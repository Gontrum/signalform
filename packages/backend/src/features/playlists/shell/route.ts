/**
 * Playlists Routes
 *
 * Save the current LMS now-playing queue as a named playlist, list saved
 * playlists, load a saved playlist back into the queue, rename a saved
 * playlist, delete a saved playlist, and read or thin out its tracks.
 *
 * Handlers: validate → call core → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";
import { hasMoreAfter } from "../../library/core/browse.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { recordUserTransportCommand } from "../../../infrastructure/transport-commands.js";
import { parsePlaylistName } from "../core/service.js";
import { sendPlaylistWriteFailure } from "./write-failure.js";

const extractName = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("name" in body)) {
    return undefined;
  }
  return (body as { readonly name: unknown }).name;
};

// Called with both `request.body` (POST /load) and `request.params`
// (DELETE and PATCH /:id), so the parameter stays source-agnostic.
const extractId = (source: unknown): unknown => {
  if (typeof source !== "object" || source === null || !("id" in source)) {
    return undefined;
  }
  return (source as { readonly id: unknown }).id;
};

const PlaylistTracksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(999).default(250),
  offset: z.coerce.number().int().min(0).default(0),
});

const PlaylistIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

// `z.coerce.number()` reads "" and " " as 0, which would address the first
// track instead of failing, so the raw segment must be digits before it
// becomes a position.
const TRACK_INDEX_PATTERN = /^\d+$/;

const PlaylistTrackParamsSchema = z.object({
  id: z.string().trim().min(1),
  index: z
    .string()
    .regex(TRACK_INDEX_PATTERN)
    .transform((raw) => Number(raw)),
});

export const createPlaylistsRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
): void => {
  /**
   * POST /api/playlists
   *
   * Save the current queue as a named playlist.
   * Body: { name: string } — trimmed, non-empty, ≤200 chars
   * 201 { name } | 400 | 5xx
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playlists",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists", method: "POST" },
        "Save playlist request received",
      );

      const parsed = parsePlaylistName(extractName(request.body));
      if (!parsed.ok) {
        request.log.warn(
          { message: parsed.error.message },
          "Invalid save playlist request",
        );
        return reply.code(400).send({ error: parsed.error.message });
      }

      const result = await lmsClient.savePlaylist(parsed.value);
      if (!result.ok) {
        return await sendPlaylistWriteFailure(
          reply,
          request,
          lmsClient,
          result.error,
          { kind: "new-playlist" },
          "LMS save playlist failed",
          { name: parsed.value },
        );
      }

      request.log.info({ name: parsed.value }, "Playlist saved");
      return reply.code(201).send({ name: parsed.value });
    },
  );

  /**
   * GET /api/playlists
   *
   * List all saved playlists.
   * 200 { playlists: SavedPlaylist[] } | 5xx
   */
  fastify.get(
    "/api/playlists",
    async (request: FastifyRequest, reply: FastifyReply) => {
      request.log.debug(
        { endpoint: "/api/playlists", method: "GET" },
        "List playlists request received",
      );

      const result = await lmsClient.listSavedPlaylists();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS list playlists failed",
        );
      }

      return reply.code(200).send({ playlists: result.value });
    },
  );

  /**
   * POST /api/playlists/load
   *
   * Load a saved playlist into the queue, replacing it.
   * Body: { id: string } — non-empty string
   * 204 | 400 | 5xx
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playlists/load",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/load", method: "POST" },
        "Load playlist request received",
      );

      const rawId = extractId(request.body);
      if (typeof rawId !== "string" || rawId.trim() === "") {
        request.log.warn("Invalid load playlist request: missing id");
        return reply.code(400).send({ error: "Playlist id is required" });
      }
      const id = rawId.trim();

      recordUserTransportCommand();
      const result = await lmsClient.loadSavedPlaylist(id);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS load playlist failed",
          { id },
        );
      }

      request.log.info({ id }, "Playlist loaded");
      return reply.code(204).send();
    },
  );

  /**
   * DELETE /api/playlists/:id
   *
   * Delete a saved playlist.
   * Param: id — non-empty string (Fastify decodes percent-encoded segments)
   * 204 | 400 | 404 | 5xx
   */
  fastify.delete<{ readonly Params: unknown }>(
    "/api/playlists/:id",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/:id", method: "DELETE" },
        "Delete playlist request received",
      );

      const rawId = extractId(request.params);
      if (typeof rawId !== "string" || rawId.trim() === "") {
        request.log.warn("Invalid delete playlist request: missing id");
        return reply.code(400).send({ error: "Playlist id is required" });
      }
      const id = rawId.trim();

      const result = await lmsClient.deleteSavedPlaylist(id);
      if (!result.ok) {
        return await sendPlaylistWriteFailure(
          reply,
          request,
          lmsClient,
          result.error,
          { kind: "existing-playlist", playlistId: id },
          "LMS delete playlist failed",
          { id },
        );
      }

      request.log.info({ id }, "Playlist deleted");
      return reply.code(204).send();
    },
  );

  /**
   * PATCH /api/playlists/:id
   *
   * Rename a saved playlist — a single attribute changes, the playlist is not
   * replaced, hence PATCH rather than PUT.
   * Param: id — non-empty string (Fastify decodes percent-encoded segments)
   * Body: { name: string } — same rule as POST /api/playlists
   * 200 { id, name } | 400 | 404 | 5xx
   *
   * LMS drops the connection on an unknown id instead of answering, which
   * surfaces as 404 — same behaviour as DELETE /api/playlists/:id.
   */
  fastify.patch<{ readonly Params: unknown; readonly Body: unknown }>(
    "/api/playlists/:id",
    async (
      request: FastifyRequest<{
        readonly Params: unknown;
        readonly Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/:id", method: "PATCH" },
        "Rename playlist request received",
      );

      const rawId = extractId(request.params);
      if (typeof rawId !== "string" || rawId.trim() === "") {
        request.log.warn("Invalid rename playlist request: missing id");
        return reply.code(400).send({ error: "Playlist id is required" });
      }
      const id = rawId.trim();

      const parsed = parsePlaylistName(extractName(request.body));
      if (!parsed.ok) {
        request.log.warn(
          { message: parsed.error.message },
          "Invalid rename playlist request",
        );
        return reply.code(400).send({ error: parsed.error.message });
      }

      const result = await lmsClient.renamePlaylist(id, parsed.value);
      if (!result.ok) {
        return await sendPlaylistWriteFailure(
          reply,
          request,
          lmsClient,
          result.error,
          { kind: "existing-playlist", playlistId: id },
          "LMS rename playlist failed",
          { id, name: parsed.value },
        );
      }

      request.log.info({ id, name: parsed.value }, "Playlist renamed");
      return reply.code(200).send({ id, name: parsed.value });
    },
  );

  /**
   * GET /api/playlists/:id/tracks
   *
   * Read one page of a saved playlist's tracks.
   * Param: id — non-empty string (Fastify decodes percent-encoded segments)
   * Query: limit (1-999, default 250), offset (≥0, default 0)
   * 200 { tracks: [{ index, title, artist, album, duration? }], hasMore } | 400 | 5xx
   *
   * Each `index` is the track's position in the whole playlist, not in this
   * page — that is what DELETE .../tracks/:index expects.
   */
  fastify.get<{ readonly Params: unknown; readonly Querystring: unknown }>(
    "/api/playlists/:id/tracks",
    async (
      request: FastifyRequest<{
        readonly Params: unknown;
        readonly Querystring: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/:id/tracks", method: "GET" },
        "List playlist tracks request received",
      );

      const params = PlaylistIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        request.log.warn("Invalid playlist tracks request: missing id");
        return reply.code(400).send({ error: "Playlist id is required" });
      }

      const query = PlaylistTracksQuerySchema.safeParse(request.query);
      if (!query.success) {
        request.log.warn("Invalid playlist tracks request: bad pagination");
        return reply.code(400).send({ error: "Invalid query parameters" });
      }

      const { id } = params.data;
      const { limit, offset } = query.data;

      const result = await lmsClient.getSavedPlaylistTracks(id, offset, limit);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS list playlist tracks failed",
          { id, offset, limit },
        );
      }

      return reply.code(200).send({
        tracks: result.value.tracks,
        hasMore: hasMoreAfter(result.value.count, offset, limit),
      });
    },
  );

  /**
   * DELETE /api/playlists/:id/tracks/:index
   *
   * Remove a single track from a saved playlist.
   * Params: id — non-empty string; index — non-negative integer
   * 204 | 400 | 404 | 5xx
   *
   * The index is a position, not an identifier: removing track 3 shifts every
   * later track down by one. A caller deleting two tracks from one stale list
   * hits the wrong track the second time — it must reload after every delete.
   *
   * LMS drops the connection on an unknown id instead of answering, which
   * surfaces as 404 — same behaviour as DELETE /api/playlists/:id.
   */
  fastify.delete<{ readonly Params: unknown }>(
    "/api/playlists/:id/tracks/:index",
    async (
      request: FastifyRequest<{ readonly Params: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/:id/tracks/:index", method: "DELETE" },
        "Delete playlist track request received",
      );

      const params = PlaylistTrackParamsSchema.safeParse(request.params);
      if (!params.success) {
        request.log.warn("Invalid delete playlist track request");
        return reply.code(400).send({
          error:
            "Playlist id is required and track index must be a non-negative integer",
        });
      }

      const { id, index } = params.data;

      const result = await lmsClient.removeSavedPlaylistTrack(id, index);
      if (!result.ok) {
        return await sendPlaylistWriteFailure(
          reply,
          request,
          lmsClient,
          result.error,
          { kind: "existing-playlist", playlistId: id },
          "LMS delete playlist track failed",
          { id, index },
        );
      }

      request.log.info({ id, index }, "Playlist track removed");
      return reply.code(204).send();
    },
  );
};
