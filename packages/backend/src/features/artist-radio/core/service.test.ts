/**
 * Artist Radio — buildArtistRadioSeeds Unit Tests
 *
 * No mocks needed — pure functions only.
 * Covers happy path, edge cases, and interleaving behaviour.
 */

import { describe, test, expect } from "vitest";
import { buildArtistRadioSeeds } from "./service.js";
import type { LastFmArtistTopTrack, LastFmSimilarArtist } from "./types.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const makeTopTrack = (
  name: string,
  artist: string,
  overrides: Partial<LastFmArtistTopTrack> = {},
): LastFmArtistTopTrack => ({
  name,
  artist,
  playcount: 100,
  listeners: 50,
  url: `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(name)}`,
  ...overrides,
});

const makeSimilarArtist = (name: string, match = 0.9): LastFmSimilarArtist => ({
  name,
  match,
  url: `https://www.last.fm/music/${encodeURIComponent(name)}`,
});

/** Build a ReadonlyMap of artist -> top tracks. */
const makeTracksMap = (
  entries: readonly (readonly [string, readonly LastFmArtistTopTrack[]])[],
): ReadonlyMap<string, readonly LastFmArtistTopTrack[]> => new Map(entries);

// Canonical seed artist tracks (10 — more than the 4-track limit)
const seedTracks: readonly LastFmArtistTopTrack[] = Array.from(
  { length: 10 },
  (_, i) => makeTopTrack(`Seed Track ${i + 1}`, "The Beatles"),
);

// Canonical set of 8 similar artists with 3 tracks each
const similarArtists: readonly LastFmSimilarArtist[] = Array.from(
  { length: 8 },
  (_, i) => makeSimilarArtist(`Similar Artist ${i + 1}`, 0.9 - i * 0.05),
);

const similarTracksMap: ReadonlyMap<string, readonly LastFmArtistTopTrack[]> =
  makeTracksMap(
    similarArtists.map((a) => [
      a.name,
      [
        makeTopTrack(`${a.name} Track 1`, a.name),
        makeTopTrack(`${a.name} Track 2`, a.name),
        makeTopTrack(`${a.name} Track 3`, a.name), // third track — must NOT appear in output
      ],
    ]),
  );

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — happy path", () => {
  test("first element is from the seed artist", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    expect(result[0]?.isFromSeedArtist).toBe(true);
    expect(result[0]?.artist).toBe("The Beatles");
  });

  test("third element is from the seed artist (interleave: 1 seed, 2 similar, 1 seed...)", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    // Pattern: [seed, sim, sim, seed, sim, sim, ...]
    // index 0: seed, 1: similar, 2: similar, 3: seed, 4: similar, 5: similar ...
    expect(result[3]?.isFromSeedArtist).toBe(true);
  });

  test("second and third elements are from similar artists", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    expect(result[1]?.isFromSeedArtist).toBe(false);
    expect(result[2]?.isFromSeedArtist).toBe(false);
  });

  test("total length: 4 seed seeds + 8 artists × 2 tracks = 20", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    expect(result).toHaveLength(20);
  });

  test("no more than 4 seed-artist entries appear in result", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    const seedCount = result.filter((s) => s.isFromSeedArtist).length;
    expect(seedCount).toBe(4);
  });

  test("no more than 2 tracks per similar artist appear in result", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    expect(
      similarArtists.every((artist) => {
        const count = result.filter(
          (s) => !s.isFromSeedArtist && s.artist === artist.name,
        ).length;
        return count <= 2;
      }),
    ).toBe(true);
  });

  test("all seed-artist entries carry the correct seedArtist name", () => {
    const result = buildArtistRadioSeeds(
      seedTracks,
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    result
      .filter((s) => s.isFromSeedArtist)
      .forEach((s) => expect(s.artist).toBe("The Beatles"));
  });
});

// ---------------------------------------------------------------------------
// Empty similar artists
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — empty similar artists", () => {
  test("only seed tracks are returned, in order", () => {
    const result = buildArtistRadioSeeds(
      seedTracks.slice(0, 4),
      "The Beatles",
      [],
      new Map(),
    );

    expect(result).toHaveLength(4);
    expect(result.every((s) => s.isFromSeedArtist)).toBe(true);
    // Confirm order is preserved
    expect(result[0]?.name).toBe("Seed Track 1");
    expect(result[3]?.name).toBe("Seed Track 4");
  });
});

// ---------------------------------------------------------------------------
// Empty seed tracks
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — empty seed tracks", () => {
  test("only similar-artist tracks are returned", () => {
    const twoArtists = similarArtists.slice(0, 2);
    const twoArtistMap = makeTracksMap(
      twoArtists.map((a) => [
        a.name,
        [
          makeTopTrack(`${a.name} Track 1`, a.name),
          makeTopTrack(`${a.name} Track 2`, a.name),
        ],
      ]),
    );

    const result = buildArtistRadioSeeds(
      [],
      "The Beatles",
      twoArtists,
      twoArtistMap,
    );

    expect(result).toHaveLength(4); // 2 artists × 2 tracks
    expect(result.every((s) => !s.isFromSeedArtist)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Both lists empty
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — both empty", () => {
  test("returns empty array", () => {
    const result = buildArtistRadioSeeds([], "The Beatles", [], new Map());
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Partial similar artist data (some artists missing from map)
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — partial similar artist data", () => {
  test("artists absent from the map are skipped gracefully", () => {
    const artists = [
      makeSimilarArtist("Artist With Tracks"),
      makeSimilarArtist("Artist Without Tracks"), // NOT in map
    ];
    const partialMap = makeTracksMap([
      [
        "Artist With Tracks",
        [
          makeTopTrack("Track A", "Artist With Tracks"),
          makeTopTrack("Track B", "Artist With Tracks"),
        ],
      ],
      // "Artist Without Tracks" intentionally absent
    ]);

    const result = buildArtistRadioSeeds([], "Seed", artists, partialMap);

    expect(result).toHaveLength(2); // only 2 tracks from the artist that has data
    expect(result.every((s) => s.artist === "Artist With Tracks")).toBe(true);
  });

  test("all similar artists absent from map → only seed tracks remain", () => {
    const result = buildArtistRadioSeeds(
      seedTracks.slice(0, 3),
      "The Beatles",
      similarArtists.slice(0, 3),
      new Map(), // empty map
    );

    expect(result).toHaveLength(3);
    expect(result.every((s) => s.isFromSeedArtist)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Similar artist map has more tracks than limit (only first 2 per artist)
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — similar artist map track limit", () => {
  test("only first 2 tracks per similar artist are included", () => {
    const artist = makeSimilarArtist("Rich Artist");
    const richMap = makeTracksMap([
      [
        "Rich Artist",
        [
          makeTopTrack("Hit 1", "Rich Artist"),
          makeTopTrack("Hit 2", "Rich Artist"),
          makeTopTrack("Hit 3", "Rich Artist"), // must be excluded
          makeTopTrack("Hit 4", "Rich Artist"), // must be excluded
        ],
      ],
    ]);

    const result = buildArtistRadioSeeds([], "Seed", [artist], richMap);

    const richTracks = result.filter((s) => s.artist === "Rich Artist");
    expect(richTracks).toHaveLength(2);
    expect(richTracks[0]?.name).toBe("Hit 1");
    expect(richTracks[1]?.name).toBe("Hit 2");
  });
});

// ---------------------------------------------------------------------------
// More than 4 seed tracks supplied
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — seed track limit", () => {
  test("only first 4 seed tracks are included even when more supplied", () => {
    // Supply 10 seed tracks but only 4 should appear in result
    const result = buildArtistRadioSeeds(
      seedTracks, // 10 tracks
      "The Beatles",
      [], // no similar artists → result is just the 4 seed tracks
      new Map(),
    );

    expect(result).toHaveLength(4);
    expect(result[0]?.name).toBe("Seed Track 1");
    expect(result[1]?.name).toBe("Seed Track 2");
    expect(result[2]?.name).toBe("Seed Track 3");
    expect(result[3]?.name).toBe("Seed Track 4");
  });

  test("only 4 seed-artist seeds even with many similar-artist tracks", () => {
    const result = buildArtistRadioSeeds(
      seedTracks, // 10 tracks — only 4 must be used
      "The Beatles",
      similarArtists,
      similarTracksMap,
    );

    const seedCount = result.filter((s) => s.isFromSeedArtist).length;
    expect(seedCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Similar artist limit (first 8 by position in array)
// ---------------------------------------------------------------------------

describe("buildArtistRadioSeeds — similar artist count limit", () => {
  test("only first 8 similar artists are used even when more supplied", () => {
    // 10 similar artists supplied — only first 8 should contribute tracks
    const tenArtists = Array.from({ length: 10 }, (_, i) =>
      makeSimilarArtist(`Artist ${i + 1}`, 0.9 - i * 0.05),
    );
    const tenMap = makeTracksMap(
      tenArtists.map((a) => [
        a.name,
        [
          makeTopTrack(`${a.name} T1`, a.name),
          makeTopTrack(`${a.name} T2`, a.name),
        ],
      ]),
    );

    const result = buildArtistRadioSeeds([], "Seed", tenArtists, tenMap);

    // Only 8 artists × 2 tracks = 16; artists 9 and 10 must not appear
    const artist9Tracks = result.filter((s) => s.artist === "Artist 9");
    const artist10Tracks = result.filter((s) => s.artist === "Artist 10");
    expect(artist9Tracks).toHaveLength(0);
    expect(artist10Tracks).toHaveLength(0);
    expect(result).toHaveLength(16);
  });
});
