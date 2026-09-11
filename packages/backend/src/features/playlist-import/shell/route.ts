/**
 * Playlist Import Route
 *
 * Parses pasted track-list text (CSV, M3U, or plain "Artist - Title" lines),
 * resolves each track against LMS, plays + queues what resolves, and
 * optionally saves the result as a named playlist.
 *
 * Handler: validate → parse → resolve → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { parsePlaylistName } from "../../playlists/core/service.js";
import { parseTrackList } from "@signalform/shared";
import { resolveWithMissing } from "./resolve-with-missing.js";
import { playQueueAndMaybeSave } from "./play-and-save.js";

const MAX_IMPORT_TEXT_BYTES = 200_000;
const DEFAULT_IMPORT_LIMIT = 100;
const MAX_IMPORT_LIMIT = 500;

const ImportBodySchema = z.object({
  text: z.string().min(1).max(MAX_IMPORT_TEXT_BYTES),
  name: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_IMPORT_LIMIT)
    .default(DEFAULT_IMPORT_LIMIT),
});

export const createPlaylistImportRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
): void => {
  /**
   * POST /api/playlists/import
   *
   * Body: { text: string, name?: string, limit?: number }
   * 200 { imported: number, missing: string[], skippedLines: number }
   * 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playlists/import",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playlists/import", method: "POST" },
        "Playlist import request received",
      );

      const parsedBody = ImportBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        request.log.warn("Invalid playlist import request");
        return reply.code(400).send({ error: "Invalid import request" });
      }
      const { text, limit } = parsedBody.data;

      const rawName = parsedBody.data.name;
      const parsedName =
        rawName === undefined ? undefined : parsePlaylistName(rawName);
      if (parsedName !== undefined && !parsedName.ok) {
        request.log.warn(
          { message: parsedName.error.message },
          "Invalid playlist import request: bad name",
        );
        return reply.code(400).send({ error: parsedName.error.message });
      }
      const name = parsedName?.ok ? parsedName.value : undefined;

      const { tracks, skippedLines } = parseTrackList(text);
      if (tracks.length === 0) {
        return reply.code(200).send({ imported: 0, missing: [], skippedLines });
      }

      const candidates = tracks.slice(0, limit);
      const { playableUrls, missing } = await resolveWithMissing(
        lmsClient,
        candidates,
      );

      if (playableUrls.length === 0) {
        return reply.code(200).send({ imported: 0, missing, skippedLines });
      }

      const queued = await playQueueAndMaybeSave(
        request,
        reply,
        lmsClient,
        playableUrls,
        name,
      );
      if (typeof queued !== "number") {
        return queued;
      }

      request.log.info(
        { imported: queued, skippedLines },
        "Playlist import completed",
      );
      return reply.code(200).send({ imported: queued, missing, skippedLines });
    },
  );
};
