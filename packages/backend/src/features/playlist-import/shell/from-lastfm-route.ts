import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import { loadConfig } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/service.js";
import { resolveRequestUser } from "../../users/index.js";
import { parsePlaylistName } from "../../playlists/core/service.js";
import type { ParsedTrack } from "@signalform/shared";
import { resolveWithMissing } from "./resolve-with-missing.js";
import { playQueueAndMaybeSave } from "./play-and-save.js";

const MAX_CANDIDATE_LIMIT = 200;
const DEFAULT_CANDIDATE_LIMIT = 50;

const baseFields = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CANDIDATE_LIMIT)
    .default(DEFAULT_CANDIDATE_LIMIT),
  name: z.string().optional(),
};

const FromLastFmBodySchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("top-tracks"),
      period: z
        .enum(["7day", "1month", "12month", "overall"])
        .default("overall"),
      ...baseFields,
    })
    .strict(),
  z.object({ source: z.literal("loved"), ...baseFields }).strict(),
  z
    .object({
      source: z.literal("tag"),
      tag: z.string().trim().min(1),
      ...baseFields,
    })
    .strict(),
  z
    .object({
      source: z.literal("artist"),
      artist: z.string().trim().min(1),
      ...baseFields,
    })
    .strict(),
  z.object({ source: z.literal("recommended"), ...baseFields }).strict(),
]);

type FromLastFmBody = z.infer<typeof FromLastFmBodySchema>;

type CandidateFetchResult =
  | { readonly ok: true; readonly value: readonly ParsedTrack[] }
  | { readonly ok: false; readonly status: number; readonly error: string };

const fetchCandidates = async (
  body: FromLastFmBody,
  config: AppConfig,
  headerValue: string | undefined,
  lastFmClient: LastFmClient,
): Promise<CandidateFetchResult> => {
  if (body.source === "tag") {
    const result = await lastFmClient.getTagTopTracks(body.tag, 1, body.limit);
    if (!result.ok) {
      return { ok: false, status: 503, error: "Last.fm unavailable" };
    }
    return { ok: true, value: result.value };
  }

  if (body.source === "artist") {
    const result = await lastFmClient.getArtistTopTracks(
      body.artist,
      body.limit,
    );
    if (!result.ok) {
      return { ok: false, status: 503, error: "Last.fm unavailable" };
    }
    return { ok: true, value: result.value };
  }

  const user = resolveRequestUser(config.users, headerValue);
  if (user === undefined) {
    return { ok: false, status: 400, error: "No user resolvable for request" };
  }

  if (body.source === "top-tracks" || body.source === "loved") {
    if (user.lastFmUsername === undefined) {
      return {
        ok: false,
        status: 400,
        error: "No Last.fm username configured",
      };
    }

    const result =
      body.source === "top-tracks"
        ? await lastFmClient.getUserTopTracks(
            user.lastFmUsername,
            body.period,
            body.limit,
          )
        : await lastFmClient.getUserLovedTracks(
            user.lastFmUsername,
            body.limit,
          );
    if (!result.ok) {
      return { ok: false, status: 503, error: "Last.fm unavailable" };
    }
    return { ok: true, value: result.value };
  }

  if (
    user.lastFmSessionKey === undefined ||
    config.lastFmSharedSecret === undefined
  ) {
    return {
      ok: false,
      status: 400,
      error: "No Last.fm session configured for this user",
    };
  }

  const result = await lastFmClient.getRecommendedTracks(
    user.lastFmSessionKey,
    config.lastFmSharedSecret,
    body.limit,
  );
  if (!result.ok) {
    return { ok: false, status: 503, error: "Last.fm unavailable" };
  }
  return { ok: true, value: result.value };
};

export const createLastFmPlaylistRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  fastify.post<{ readonly Body: unknown }>(
    "/api/playlists/from-lastfm",
    async (request, reply) => {
      const parsedBody = FromLastFmBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "Invalid import request" });
      }
      const body = parsedBody.data;

      const rawName = body.name;
      const parsedName =
        rawName === undefined ? undefined : parsePlaylistName(rawName);
      if (parsedName !== undefined && !parsedName.ok) {
        return reply.code(400).send({ error: parsedName.error.message });
      }
      const name = parsedName?.ok ? parsedName.value : undefined;

      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(400).send({ error: "Configuration unavailable" });
      }
      const config = configResult.value;

      const headerValue = request.headers["x-signalform-user"];
      const candidatesResult = await fetchCandidates(
        body,
        config,
        typeof headerValue === "string" ? headerValue : undefined,
        lastFmClient,
      );
      if (!candidatesResult.ok) {
        return reply
          .code(candidatesResult.status)
          .send({ error: candidatesResult.error });
      }
      const candidates = candidatesResult.value;
      const totalCandidates = candidates.length;

      if (totalCandidates === 0) {
        return reply
          .code(200)
          .send({ imported: 0, missing: [], totalCandidates: 0 });
      }

      const { playableUrls, missing } = await resolveWithMissing(
        lmsClient,
        candidates,
      );

      if (playableUrls.length === 0) {
        return reply.code(200).send({ imported: 0, missing, totalCandidates });
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

      return reply.code(200).send({
        imported: queued,
        missing,
        totalCandidates,
      });
    },
  );
};
