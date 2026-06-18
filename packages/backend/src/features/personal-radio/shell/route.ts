import type { FastifyInstance } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { mergeTrackPools } from "../core/seed-merger.js";
import {
  setPersonalRadioContext,
  setRadioModeEnabledState,
} from "../../radio-mode/index.js";

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

/** Fisher-Yates shuffle via Array.from + reduce — no mutation */
const fisherYatesShuffle = <T>(arr: readonly T[]): readonly T[] =>
  Array.from({ length: arr.length }, (_, i) => i).reduce<readonly T[]>(
    (acc, _, i) => {
      const remaining = arr.length - i;
      const j = Math.floor(Math.random() * remaining);
      const item = acc[j]!;
      const last = acc[remaining - 1]!;
      return acc.map((el, idx) =>
        idx === j ? last : idx === remaining - 1 ? item : el,
      );
    },
    [...arr],
  );

const MAX_INITIAL_TRACKS = 8;
const MAX_CANDIDATE_SEARCHES = 50;

type ArtistScore = {
  readonly key: string;
  readonly name: string;
  readonly score: number;
};

const mergeArtistScore = (
  scores: readonly ArtistScore[],
  name: string,
  delta: number,
): readonly ArtistScore[] => {
  const key = name.toLowerCase();
  const existing = scores.find((s) => s.key === key);
  if (existing !== undefined) {
    return scores.map((s) =>
      s.key === key ? { ...s, score: s.score + delta } : s,
    );
  }
  return [...scores, { key, name, score: delta }];
};

export const createPersonalRadioRoute = (
  server: FastifyInstance,
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
): void => {
  server.post("/api/personal-radio/start", async (_request, reply) => {
    const configResult = loadConfig();
    if (!configResult.ok) {
      return reply.status(400).send({ error: "Configuration unavailable" });
    }
    const config = configResult.value;

    if (!config.personalRadioEnabled) {
      return reply.status(400).send({ error: "Personal Radio is not enabled" });
    }

    const username = config.lastFmUsername;
    if (!username) {
      return reply
        .status(400)
        .send({ error: "No Last.fm username configured" });
    }

    // Step 1: Fetch user listening history in parallel
    const [lovedResult, topOverallResult, topRecentResult] = await Promise.all([
      lastFmClient.getUserLovedTracks(username, 30),
      lastFmClient.getUserTopArtists(username, "overall", 10),
      lastFmClient.getUserTopArtists(username, "7day", 5),
    ]);

    // Step 2: Score artists from listening history using immutable reduce
    const lovedArtists = lovedResult.ok ? lovedResult.value : [];
    const recentArtists = topRecentResult.ok ? topRecentResult.value : [];
    const overallArtists = topOverallResult.ok ? topOverallResult.value : [];

    const withLoved = lovedArtists.reduce<readonly ArtistScore[]>(
      (acc, track) => mergeArtistScore(acc, track.artist, 3),
      [],
    );
    const withRecent = recentArtists.reduce<readonly ArtistScore[]>(
      (acc, artist) => mergeArtistScore(acc, artist.name, 3),
      withLoved,
    );
    const allScores = overallArtists.reduce<readonly ArtistScore[]>(
      (acc, artist) => mergeArtistScore(acc, artist.name, 1),
      withRecent,
    );

    const seedArtists: readonly string[] = [...allScores]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((s) => s.name);

    if (seedArtists.length === 0) {
      return reply.status(404).send({ error: "No listening history found" });
    }

    // Steps 3+B: Similar artists for comfort + neighbours for discovery, in parallel
    const top3Seeds = seedArtists.slice(0, 3);
    const [similarResults, neighboursResult] = await Promise.all([
      Promise.all(
        top3Seeds.map((seed) => lastFmClient.getSimilarArtists(seed, 15)),
      ),
      lastFmClient.getUserNeighbours(username, 5),
    ]);

    const neighbourUsernames = (
      neighboursResult.ok ? neighboursResult.value : []
    )
      .slice(0, 3)
      .map((n) => n.username);

    // Step 4: Pick 5 similar artists spread across the list from each seed
    const pickedSimilarArtists: readonly string[] = similarResults.flatMap(
      (result) => {
        if (!result.ok || result.value.length === 0) {
          return [];
        }
        const similar = result.value;
        return [
          0,
          Math.floor(similar.length / 4),
          Math.floor(similar.length / 2),
          Math.floor((similar.length * 3) / 4),
          similar.length - 1,
        ]
          .map((i) => similar[i]?.name)
          .filter((name): name is string => name !== undefined)
          .filter((name, i, arr) => arr.indexOf(name) === i)
          .slice(0, 5);
      },
    );

    // Step 5: Fetch top tracks for picked similar artists
    const trackResults = await Promise.all(
      pickedSimilarArtists.map((a) => lastFmClient.getArtistTopTracks(a, 8)),
    );

    const allTracks = trackResults.flatMap((r) => (r.ok ? r.value : []));

    // Kanal B: fetch neighbours' top tracks (+ optional recommendations if session key)
    const [neighbourTrackResults, maybeRecommended] = await Promise.all([
      Promise.all(
        neighbourUsernames.map((n) =>
          lastFmClient.getUserTopTracks(n, "overall", 10),
        ),
      ),
      config.lastFmSessionKey !== undefined &&
      config.lastFmSharedSecret !== undefined
        ? lastFmClient.getRecommendedTracks(
            config.lastFmSessionKey,
            config.lastFmSharedSecret,
            15,
          )
        : Promise.resolve({ ok: true as const, value: [] as const }),
    ]);

    const discoveryTracks = [
      ...neighbourTrackResults.flatMap((r) =>
        r.ok
          ? r.value.map((t) => ({ name: t.name, artist: t.artist, url: t.url }))
          : [],
      ),
      ...(maybeRecommended.ok ? maybeRecommended.value : []),
    ];

    // Step 6: Exclude recently played tracks
    const recentResult = await lastFmClient.getUserRecentTracks(username, 30);
    const recentKeys = new Set<string>(
      recentResult.ok
        ? recentResult.value.map(
            (t) => `${t.artist.toLowerCase()}|||${t.name.toLowerCase()}`,
          )
        : [],
    );

    const candidateTracks = allTracks.filter(
      (t) =>
        !recentKeys.has(`${t.artist.toLowerCase()}|||${t.name.toLowerCase()}`),
    );

    const discoveryPool = discoveryTracks.filter(
      (t) =>
        !recentKeys.has(`${t.artist.toLowerCase()}|||${t.name.toLowerCase()}`),
    );

    // Step 7: Blend comfort + discovery based on personalRadioDiscovery ratio
    const discoveryRatio = config.personalRadioDiscovery;
    const shuffledComfort = fisherYatesShuffle(candidateTracks);
    const shuffledDiscovery = fisherYatesShuffle(discoveryPool);

    const blendedCandidates = mergeTrackPools(
      shuffledComfort,
      shuffledDiscovery,
      discoveryRatio,
      MAX_CANDIDATE_SEARCHES,
    );

    // Step 8: LMS search — collect up to MAX_INITIAL_TRACKS playable URLs
    const { urls: playableUrls } = await blendedCandidates
      .slice(0, MAX_CANDIDATE_SEARCHES)
      .reduce<Promise<{ readonly urls: readonly string[] }>>(
        async (accPromise, track) => {
          const acc = await accPromise;
          if (acc.urls.length >= MAX_INITIAL_TRACKS) {
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

    // Step 9: Start playback
    await lmsClient.play(playableUrls[0]!);
    await playableUrls.slice(1).reduce<Promise<void>>(async (prev, url) => {
      await prev;
      await lmsClient.addToQueue(url);
    }, Promise.resolve());

    // Step 10: Set radio context
    setPersonalRadioContext({
      username,
      seedArtists: [...seedArtists],
      neighbours: neighbourUsernames,
      cycle: 1,
    });
    setRadioModeEnabledState(true);

    return reply
      .status(200)
      .send({ tracksAdded: playableUrls.length, seedArtists });
  });
};
