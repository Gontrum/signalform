/**
 * Radio Mode — Replenish decisions (functional core) — Unit Tests
 *
 * Pure synchronous tests, no mocks: fixtures in, values out.
 */

import { describe, expect, test } from "vitest";
import type { QueueTrack } from "@signalform/shared";
import type { SearchResult } from "../../../adapters/lms-client/index.js";
import type { CandidateTrack, RadioAcc } from "./types.js";
import { RADIO_BATCH_SIZE, RADIO_REMOVAL_REPLENISH_SIZE } from "./types.js";
import {
  acceptIntoBatch,
  buildQueueKeySets,
  buildRecentTrackKey,
  chooseEffectiveCandidates,
  computeRepeatKey,
  computeTargetBatchSize,
  evaluateCandidateForBatch,
  excludeSeedArtist,
  filterRecentCandidates,
  pickSpreadSimilarArtists,
  shuffleWithRandom,
} from "./replenish.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeQueueTrack = (
  overrides: Partial<QueueTrack> & { readonly id: string },
): QueueTrack => ({
  position: 1,
  title: "Hello",
  artist: "Adele",
  album: "25",
  duration: 295,
  isCurrent: false,
  ...overrides,
});

const makeSearchResult = (
  overrides: Partial<SearchResult> & { readonly url: string },
): SearchResult => ({
  id: "1",
  title: "Hello",
  artist: "Adele",
  album: "25",
  source: "local",
  type: "track",
  ...overrides,
});

const makeCandidate = (
  artist: string,
  name: string,
  overrides?: Partial<CandidateTrack>,
): CandidateTrack => ({
  name,
  artist,
  match: 1,
  url: `https://last.fm/${artist}/${name}`,
  ...overrides,
});

const emptyAcc: RadioAcc = { artists: [], urls: [], trackKeys: [] };

// ---------------------------------------------------------------------------
// computeTargetBatchSize
// ---------------------------------------------------------------------------

describe("computeTargetBatchSize", () => {
  test("queue-end trigger targets a full batch", () => {
    expect(computeTargetBatchSize("queue-end")).toBe(RADIO_BATCH_SIZE);
    expect(computeTargetBatchSize("queue-end")).toBe(5);
  });

  test("queue-remove trigger targets a single replacement track", () => {
    expect(computeTargetBatchSize("queue-remove")).toBe(
      RADIO_REMOVAL_REPLENISH_SIZE,
    );
    expect(computeTargetBatchSize("queue-remove")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildQueueKeySets
// ---------------------------------------------------------------------------

describe("buildQueueKeySets", () => {
  test("builds repeat keys for every track", () => {
    const tracks = [
      makeQueueTrack({ id: "a", artist: "Adele", title: "Hello" }),
      makeQueueTrack({ id: "b", artist: "Bonobo", title: "Kerala" }),
    ];

    expect(buildQueueKeySets(tracks).repeatKeys).toEqual([
      "adele::hello",
      "bonobo::kerala",
    ]);
  });

  test("url keys skip tracks without a usable URL key", () => {
    const tracks = [
      makeQueueTrack({ id: "a", url: "file:///music/hello.flac" }),
      makeQueueTrack({ id: "b" }), // no url
      makeQueueTrack({ id: "c", url: "   " }), // whitespace-only → no key
      makeQueueTrack({ id: "d", url: " tidal://track/42 " }),
    ];

    expect(buildQueueKeySets(tracks).urlKeys).toEqual([
      "file:///music/hello.flac",
      "tidal://track/42",
    ]);
  });

  test("empty queue yields empty key sets", () => {
    expect(buildQueueKeySets([])).toEqual({ repeatKeys: [], urlKeys: [] });
  });
});

// ---------------------------------------------------------------------------
// computeRepeatKey
// ---------------------------------------------------------------------------

describe("computeRepeatKey", () => {
  const candidate = { artist: "Adele", name: "Hello" } as const;

  test("uses the search result matching bestUrl when found", () => {
    const results = [
      makeSearchResult({
        url: "file:///a.flac",
        artist: "Adele",
        title: "Hello (Remastered)",
      }),
      makeSearchResult({ url: "file:///b.flac", title: "Other" }),
    ];

    expect(computeRepeatKey(results, "file:///a.flac", candidate)).toBe(
      "adele::hello (remastered)",
    );
  });

  test("falls back to the candidate's queue-track key when no result matches", () => {
    const results = [makeSearchResult({ url: "file:///b.flac" })];

    expect(computeRepeatKey(results, "file:///missing.flac", candidate)).toBe(
      "adele::hello",
    );
  });
});

// ---------------------------------------------------------------------------
// evaluateCandidateForBatch
// ---------------------------------------------------------------------------

describe("evaluateCandidateForBatch", () => {
  const baseInput = {
    acc: emptyAcc,
    queuedRepeatKeys: [] as readonly string[],
    queuedUrlKeys: [] as readonly string[],
    candidateArtist: "Adele",
    repeatKey: "adele::hello",
    urlKey: "file:///hello.flac",
  };

  test("accepts a clean candidate", () => {
    expect(evaluateCandidateForBatch(baseInput)).toBe("accept");
  });

  test("flags batch-artist-duplicate when artist already in batch", () => {
    const input = {
      ...baseInput,
      acc: { ...emptyAcc, artists: ["Adele"] },
    };
    expect(evaluateCandidateForBatch(input)).toBe("batch-artist-duplicate");
  });

  test("artist matching is case-insensitive and handles feat. variants", () => {
    const input = {
      ...baseInput,
      acc: { ...emptyAcc, artists: ["adele"] },
      candidateArtist: "Adele feat. James Brown",
    };
    expect(evaluateCandidateForBatch(input)).toBe("batch-artist-duplicate");
  });

  test("artist duplicate wins over recent duplicate when both apply", () => {
    const input = {
      ...baseInput,
      acc: {
        artists: ["Adele"],
        urls: [],
        trackKeys: ["adele::hello"],
      },
      queuedRepeatKeys: ["adele::hello"],
    };
    expect(evaluateCandidateForBatch(input)).toBe("batch-artist-duplicate");
  });

  test("flags recent-duplicate via acc.trackKeys", () => {
    const input = {
      ...baseInput,
      acc: { ...emptyAcc, trackKeys: ["adele::hello"] },
    };
    expect(evaluateCandidateForBatch(input)).toBe("recent-duplicate");
  });

  test("flags recent-duplicate via queuedRepeatKeys", () => {
    const input = { ...baseInput, queuedRepeatKeys: ["adele::hello"] };
    expect(evaluateCandidateForBatch(input)).toBe("recent-duplicate");
  });

  test("flags recent-duplicate via queuedUrlKeys", () => {
    const input = { ...baseInput, queuedUrlKeys: ["file:///hello.flac"] };
    expect(evaluateCandidateForBatch(input)).toBe("recent-duplicate");
  });

  test("flags batch-url-duplicate only when urlKey is in acc.urls but repeatKey is fresh", () => {
    const input = {
      ...baseInput,
      acc: { ...emptyAcc, urls: ["file:///hello.flac"] },
    };
    expect(evaluateCandidateForBatch(input)).toBe("batch-url-duplicate");
  });

  test("recent-duplicate wins over batch-url-duplicate when both apply", () => {
    const input = {
      ...baseInput,
      acc: { ...emptyAcc, urls: ["file:///hello.flac"] },
      queuedRepeatKeys: ["adele::hello"],
    };
    expect(evaluateCandidateForBatch(input)).toBe("recent-duplicate");
  });
});

// ---------------------------------------------------------------------------
// acceptIntoBatch
// ---------------------------------------------------------------------------

describe("acceptIntoBatch", () => {
  test("appends artist, urlKey, and repeatKey", () => {
    const acc: RadioAcc = {
      artists: ["Adele"],
      urls: ["file:///a.flac"],
      trackKeys: ["adele::hello"],
    };

    expect(
      acceptIntoBatch(acc, "Bonobo", "file:///b.flac", "bonobo::kerala"),
    ).toEqual({
      artists: ["Adele", "Bonobo"],
      urls: ["file:///a.flac", "file:///b.flac"],
      trackKeys: ["adele::hello", "bonobo::kerala"],
    });
  });

  test("does not mutate the input accumulator", () => {
    const acc: RadioAcc = { artists: ["A"], urls: ["u"], trackKeys: ["k"] };

    acceptIntoBatch(acc, "B", "u2", "k2");

    expect(acc).toEqual({ artists: ["A"], urls: ["u"], trackKeys: ["k"] });
  });
});

// ---------------------------------------------------------------------------
// shuffleWithRandom
// ---------------------------------------------------------------------------

describe("shuffleWithRandom", () => {
  test("random = () => 0 swaps the front to the back step by step", () => {
    // i=0: swap idx0/idx3 → [4,2,3,1]
    // i=1: swap idx0/idx2 → [3,2,4,1]
    // i=2: swap idx0/idx1 → [2,3,4,1]
    // i=3: swap idx0/idx0 → [2,3,4,1]
    expect(shuffleWithRandom([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  test("random close to 1 always swaps in place (identity permutation)", () => {
    expect(shuffleWithRandom([1, 2, 3, 4], () => 0.9999999)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test("result is a permutation of the input for a fixed random source", () => {
    const input = ["a", "b", "c", "d", "e", "f"] as const;
    const shuffled = shuffleWithRandom(input, () => 0.42);

    expect([...shuffled].sort()).toEqual([...input].sort());
    expect(shuffled).toHaveLength(input.length);
  });

  test("empty array shuffles to empty array", () => {
    expect(shuffleWithRandom([], () => 0.5)).toEqual([]);
  });

  test("single-element array is unchanged", () => {
    expect(shuffleWithRandom(["only"], () => 0.5)).toEqual(["only"]);
  });

  test("does not mutate the input array", () => {
    const input = [1, 2, 3];
    shuffleWithRandom(input, () => 0);
    expect(input).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// buildRecentTrackKey + filterRecentCandidates
// ---------------------------------------------------------------------------

describe("buildRecentTrackKey", () => {
  test("lowercases both parts and joins with |||", () => {
    expect(buildRecentTrackKey("Adele", "Hello")).toBe("adele|||hello");
  });

  test("uses ||| — deliberately distinct from identity.ts :: keys", () => {
    expect(buildRecentTrackKey("A", "B")).toContain("|||");
    expect(buildRecentTrackKey("A", "B")).not.toContain("::");
  });
});

describe("filterRecentCandidates", () => {
  test("excludes candidates whose key is in the recent set (case-insensitive)", () => {
    const candidates = [
      { artist: "Adele", name: "Hello" },
      { artist: "Bonobo", name: "Kerala" },
    ];
    const recentKeys = new Set(["adele|||hello"]);

    expect(filterRecentCandidates(candidates, recentKeys)).toEqual([
      { artist: "Bonobo", name: "Kerala" },
    ]);
  });

  test("keeps all candidates when the recent set is empty", () => {
    const candidates = [{ artist: "Adele", name: "Hello" }];

    expect(filterRecentCandidates(candidates, new Set())).toEqual(candidates);
  });

  test("preserves extra candidate fields via the generic parameter", () => {
    const candidates = [makeCandidate("Bonobo", "Kerala")];

    expect(
      filterRecentCandidates(candidates, new Set(["adele|||hello"])),
    ).toEqual(candidates);
  });
});

// ---------------------------------------------------------------------------
// pickSpreadSimilarArtists
// ---------------------------------------------------------------------------

describe("pickSpreadSimilarArtists", () => {
  test("picks indexes 0, len/3, 2*len/3, len-1 on a 10-element list", () => {
    const names = ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"];

    // floor(10/3)=3, floor(20/3)=6
    expect(pickSpreadSimilarArtists(names, 4)).toEqual([
      "n0",
      "n3",
      "n6",
      "n9",
    ]);
  });

  test("deduplicates when spread indexes hit the same name", () => {
    // len=2: indexes [0, 0, 1, 1] → ["a", "a", "b", "b"] → dedup → ["a", "b"]
    expect(pickSpreadSimilarArtists(["a", "b"], 4)).toEqual(["a", "b"]);
  });

  test("list shorter than max returns all distinct picks", () => {
    // len=1: indexes [0, 0, 0, 0] → ["x"]
    expect(pickSpreadSimilarArtists(["x"], 4)).toEqual(["x"]);
  });

  test("slices to max", () => {
    const names = ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"];

    expect(pickSpreadSimilarArtists(names, 2)).toEqual(["n0", "n3"]);
  });

  test("empty list yields empty result", () => {
    expect(pickSpreadSimilarArtists([], 4)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// excludeSeedArtist
// ---------------------------------------------------------------------------

describe("excludeSeedArtist", () => {
  test("removes fuzzy matches of the seed artist (case, feat. variants)", () => {
    const candidates = [
      makeCandidate("adele", "Hello"),
      makeCandidate("Adele feat. James Brown", "Duet"),
      makeCandidate("Bonobo", "Kerala"),
    ];

    expect(excludeSeedArtist(candidates, "Adele")).toEqual([
      makeCandidate("Bonobo", "Kerala"),
    ]);
  });

  test("keeps everything when the seed artist is absent", () => {
    const candidates = [
      makeCandidate("Bonobo", "Kerala"),
      makeCandidate("Caribou", "Odessa"),
    ];

    expect(excludeSeedArtist(candidates, "Adele")).toEqual(candidates);
  });
});

// ---------------------------------------------------------------------------
// chooseEffectiveCandidates
// ---------------------------------------------------------------------------

describe("chooseEffectiveCandidates", () => {
  test("prefers similar-track candidates when non-empty", () => {
    const candidates = [makeCandidate("Bonobo", "Kerala")];
    const fallback = [makeCandidate("Caribou", "")];

    expect(chooseEffectiveCandidates(candidates, fallback)).toBe(candidates);
  });

  test("falls back to artist candidates when the track pool is empty", () => {
    const fallback = [makeCandidate("Caribou", "")];

    expect(chooseEffectiveCandidates([], fallback)).toBe(fallback);
  });

  test("returns empty when both pools are empty", () => {
    expect(chooseEffectiveCandidates([], [])).toEqual([]);
  });
});
