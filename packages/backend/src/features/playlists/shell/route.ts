/**
 * Playlists Routes
 *
 * Save the current LMS now-playing queue as a named playlist, list saved
 * playlists, and load a saved playlist back into the queue.
 *
 * Handlers: validate → call core → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { parsePlaylistName } from "../core/service.js";

const extractName = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("name" in body)) {
    return undefined;
  }
  return (body as { readonly name: unknown }).name;
};

const extractId = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return undefined;
  }
  return (body as { readonly id: unknown }).id;
};

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
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
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
};
