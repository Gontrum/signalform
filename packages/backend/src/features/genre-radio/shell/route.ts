import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type {
  LastFmClient,
  TagTopTrack,
} from "../../../adapters/lastfm-client/index.js";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import {
  setGenreRadioContext,
  setRadioModeEnabledState,
} from "../../radio-mode/index.js";

const bodySchema = z.object({ genreName: z.string().min(1).max(100) });

const normalizeStr = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const artistMatches = (
  resultArtist: string,
  candidateArtist: string,
): boolean => {
  const r = normalizeStr(resultArtist);
  const c = normalizeStr(candidateArtist);
  return r.includes(c) || c.includes(r);
};

const sourceRank = (source: string): number =>
  source === "local" ? 0 : source === "qobuz" ? 1 : source === "tidal" ? 2 : 3;

const pickBestResult = (
  results: readonly SearchResult[],
): SearchResult | undefined =>
  [...results].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];

/** Random-sort shuffle — each element gets a random sort key. */
const shuffled = <T>(arr: readonly T[]): readonly T[] =>
  arr
    .map((value) => ({ value, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ value }) => value);

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

    const candidates: readonly TagTopTrack[] = shuffled(tagTracksResult.value);

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
      return reply
        .status(404)
        .send({ error: "No playable tracks found for genre" });
    }

    await lmsClient.play(playableUrls[0]!);
    await playableUrls.slice(1).reduce<Promise<void>>(async (prev, url) => {
      await prev;
      await lmsClient.addToQueue(url);
    }, Promise.resolve());

    setGenreRadioContext({ genreName, page: 2 });
    setRadioModeEnabledState(true);

    return reply
      .status(200)
      .send({ genreName, tracksAdded: playableUrls.length });
  });
};
