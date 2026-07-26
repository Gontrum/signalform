import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  TagTopTrack,
} from "../../../adapters/lastfm-client/index.js";
import {
  setGenreRadioContext,
  setRadioModeEnabledState,
  shuffleWithRandom,
  resolvePlayableUrls,
  playAndQueue,
} from "../../radio-mode/index.js";

const bodySchema = z.object({ genreName: z.string().min(1).max(100) });

const MAX_TRACKS = 8;

export const createGenreRadioRoute = (
  server: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  server.post("/api/genre-radio/start", async (request, reply) => {
    const parseResult = bodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }
    const { genreName } = parseResult.data;

    const tagTracksResult = await lastFmClient.getTagTopTracks(
      genreName,
      1,
      50,
    );
    if (!tagTracksResult.ok) {
      return reply.status(503).send({ error: "Last.fm unavailable" });
    }
    if (tagTracksResult.value.length === 0) {
      return reply.status(404).send({ error: "No tracks found for genre" });
    }

    const candidates: readonly TagTopTrack[] = shuffleWithRandom(
      tagTracksResult.value,
      Math.random,
    );

    // Collect up to MAX_TRACKS playable URLs via sequential LMS searches
    const { playableUrls } = await resolvePlayableUrls(
      { lmsClient },
      candidates,
      MAX_TRACKS,
    );

    if (playableUrls.length === 0) {
      return reply
        .status(404)
        .send({ error: "No playable tracks found for genre" });
    }

    await playAndQueue({ lmsClient }, playableUrls);

    setGenreRadioContext({ genreName, page: 2 });
    setRadioModeEnabledState(true);

    return reply
      .status(200)
      .send({ genreName, tracksAdded: playableUrls.length });
  });
};
