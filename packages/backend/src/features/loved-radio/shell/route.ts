import type { FastifyInstance } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  UserLovedTrack,
} from "../../../adapters/lastfm-client/index.js";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { resolveRequestUser } from "../../users/index.js";
import {
  setLovedRadioContext,
  setRadioModeEnabledState,
  shuffleWithRandom,
  resolvePlayableUrls,
  playAndQueue,
} from "../../radio-mode/index.js";

const MAX_TRACKS = 8;

export const createLovedRadioRoute = (
  server: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  server.post("/api/loved-radio/start", async (request, reply) => {
    const configResult = loadConfig();
    if (!configResult.ok) {
      return reply.status(400).send({ error: "Configuration unavailable" });
    }
    const config = configResult.value;

    const headerValue = request.headers["x-signalform-user"];
    const user = resolveRequestUser(
      config.users,
      typeof headerValue === "string" ? headerValue : undefined,
    );
    if (user === undefined) {
      return reply
        .status(400)
        .send({ error: "No user resolvable for request" });
    }

    const username = user.lastFmUsername;
    if (username === undefined) {
      return reply
        .status(400)
        .send({ error: "No Last.fm username configured" });
    }

    const lovedTracksResult = await lastFmClient.getUserLovedTracks(
      username,
      200,
    );
    if (!lovedTracksResult.ok) {
      return reply.status(503).send({ error: "Last.fm unavailable" });
    }
    if (lovedTracksResult.value.length === 0) {
      return reply.status(404).send({ error: "No loved tracks found" });
    }

    const candidates: readonly UserLovedTrack[] = shuffleWithRandom(
      lovedTracksResult.value,
      Math.random,
    );

    // Collect up to MAX_TRACKS playable URLs via sequential LMS searches
    const { playableUrls } = await resolvePlayableUrls(
      { lmsClient },
      candidates,
      MAX_TRACKS,
    );

    if (playableUrls.length === 0) {
      return reply.status(404).send({ error: "No playable tracks found" });
    }

    await playAndQueue({ lmsClient }, playableUrls);

    setLovedRadioContext({ username });
    setRadioModeEnabledState(true);

    return reply.status(200).send({ tracksAdded: playableUrls.length });
  });
};
