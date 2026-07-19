import type { FastifyInstance } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  UserLovedTrack,
} from "../../../adapters/lastfm-client/index.js";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { resolveRequestUser } from "../../users/index.js";
import {
  setLovedRadioContext,
  setRadioModeEnabledState,
} from "../../radio-mode/index.js";

// ponytail: duplicated from genre-radio; extract a shared shell helper if a third mode needs it
const normalizeStr = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

// ponytail: duplicated from genre-radio; extract a shared shell helper if a third mode needs it
const artistMatches = (
  resultArtist: string,
  candidateArtist: string,
): boolean => {
  const r = normalizeStr(resultArtist);
  const c = normalizeStr(candidateArtist);
  return r.includes(c) || c.includes(r);
};

// ponytail: duplicated from genre-radio; extract a shared shell helper if a third mode needs it
const sourceRank = (source: string): number =>
  source === "local" ? 0 : source === "qobuz" ? 1 : source === "tidal" ? 2 : 3;

// ponytail: duplicated from genre-radio; extract a shared shell helper if a third mode needs it
const pickBestResult = (
  results: readonly SearchResult[],
): SearchResult | undefined =>
  [...results].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];

/** Random-sort shuffle — each element gets a random sort key. */
// ponytail: duplicated from genre-radio; extract a shared shell helper if a third mode needs it
const shuffled = <T>(arr: readonly T[]): readonly T[] =>
  arr
    .map((value) => ({ value, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ value }) => value);

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

    const candidates: readonly UserLovedTrack[] = shuffled(
      lovedTracksResult.value,
    );

    // Collect up to MAX_TRACKS playable URLs via sequential LMS searches
    const { urls: playableUrls } = await candidates.reduce<
      Promise<{ readonly urls: readonly string[] }>
    >(
      async (accPromise, track) => {
        const acc = await accPromise;
        if (acc.urls.length >= MAX_TRACKS) {
          return acc;
        }
        const searchResult = await lmsClient.search(
          `${track.artist} ${track.name}`,
        );
        if (!searchResult.ok || searchResult.value.tracks.length === 0) {
          return acc;
        }
        const matching = searchResult.value.tracks.filter((r) =>
          artistMatches(r.artist, track.artist),
        );
        const best = pickBestResult(matching);
        if (best === undefined || acc.urls.includes(best.url)) {
          return acc;
        }
        return { urls: [...acc.urls, best.url] };
      },
      Promise.resolve({ urls: [] }),
    );

    if (playableUrls.length === 0) {
      return reply.status(404).send({ error: "No playable tracks found" });
    }

    await lmsClient.play(playableUrls[0]!);
    await playableUrls.slice(1).reduce<Promise<void>>(async (prev, url) => {
      await prev;
      await lmsClient.addToQueue(url);
    }, Promise.resolve());

    setLovedRadioContext({ username });
    setRadioModeEnabledState(true);

    return reply.status(200).send({ tracksAdded: playableUrls.length });
  });
};
