import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import {
  getAlbumDetail,
  getArtistTopTracksByName,
  type ArtistPopularityClient,
} from "./service.js";
import type {
  LmsClient,
  LmsConfig,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type { AlbumTrackRaw } from "../../../adapters/lms-client/index.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";
import type { ArtistTopTrack as LastFmArtistTopTrack } from "../../../adapters/lastfm-client/index.js";

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

const makeTrack = (overrides: Partial<AlbumTrackRaw> = {}): AlbumTrackRaw => ({
  id: 1,
  title: "Track 1",
  artist: "Artist",
  album: "Album Title",
  url: "file:///music/1.flac",
  tracknum: "1",
  duration: 240,
  year: 2020,
  ...overrides,
});

type AlbumMockClient = LmsClient & {
  readonly getAlbumTracks: ReturnType<
    typeof vi.fn<LmsClient["getAlbumTracks"]>
  >;
};

const makeMockClient = (tracks: ReadonlyArray<AlbumTrackRaw>): LmsClient =>
  ({
    ...createLmsClient(defaultConfig),
    getAlbumTracks: vi
      .fn<LmsClient["getAlbumTracks"]>()
      .mockResolvedValue(ok(tracks)),
  }) as AlbumMockClient;

describe("getAlbumDetail", () => {
  it("returns AlbumDetail with mapped tracks from LMS response", async () => {
    const tracks = [
      makeTrack({ id: 1, title: "Track 1", tracknum: "1" }),
      makeTrack({ id: 2, title: "Track 2", tracknum: "2" }),
      makeTrack({ id: 3, title: "Track 3", tracknum: "3" }),
      makeTrack({ id: 4, title: "Track 4", tracknum: "4" }),
      makeTrack({ id: 5, title: "Track 5", tracknum: "5" }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(5);
      expect(result.value.tracks[0]?.title).toBe("Track 1");
    }
  });

  it("returns NotFound error when LMS returns empty tracklist", async () => {
    const client = makeMockClient([]);

    const result = await getAlbumDetail("99", client, defaultConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFound");
      expect(result.error.message).toContain("99");
    }
  });

  it("propagates LMS error when getAlbumTracks fails", async () => {
    const client: AlbumMockClient = {
      ...createLmsClient(defaultConfig),
      getAlbumTracks: vi
        .fn<LmsClient["getAlbumTracks"]>()
        .mockResolvedValue(
          err({ type: "NetworkError", message: "Connection refused" }),
        ),
    };

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("LmsError");
      expect(result.error.message).toBe("Connection refused");
    }
  });

  it("derives album title and artist from first track", async () => {
    const tracks = [
      makeTrack({ artist: "Pink Floyd", album: "Dark Side of the Moon" }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Dark Side of the Moon");
      expect(result.value.artist).toBe("Pink Floyd");
    }
  });

  it("builds coverArtUrl from first track id and config", async () => {
    const tracks = [makeTrack({ id: 7785 })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.coverArtUrl).toBe(
        "http://localhost:9000/music/7785/cover.jpg",
      );
    }
  });

  it("sets releaseYear to null when year not available in first track", async () => {
    const tracks = [makeTrack({ year: undefined })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.releaseYear).toBeNull();
    }
  });

  it("preserves track ordering from sorted input", async () => {
    const tracks = [
      makeTrack({ id: 1, title: "A", tracknum: "1" }),
      makeTrack({ id: 2, title: "B", tracknum: "2" }),
      makeTrack({ id: 3, title: "C", tracknum: "3" }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks.map((t) => t.title)).toEqual(["A", "B", "C"]);
    }
  });

  it("maps duration from raw track", async () => {
    const tracks = [makeTrack({ duration: 305 })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBe(305);
    }
  });

  it("defaults duration to 0 when not provided by LMS", async () => {
    const tracks = [makeTrack({ duration: undefined })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.duration).toBe(0);
    }
  });

  // Story 8.4: albumartist tag (AC2)
  it("uses albumartist tag when present, ignoring per-track artist", async () => {
    const tracks = [
      makeTrack({
        id: 1,
        albumartist: "Die Toten Hosen",
        artist: "Holst/Fregee",
      }),
      makeTrack({ id: 2, albumartist: undefined, artist: "Holst/Meurer" }),
      makeTrack({ id: 3, albumartist: undefined, artist: "Breitkopf" }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("317", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artist).toBe("Die Toten Hosen");
    }
  });

  // Story 8.4: most-common fallback (AC3)
  it("returns empty string when all tracks have empty artist and no albumartist", async () => {
    const tracks = [
      makeTrack({ id: 1, artist: "", albumartist: undefined }),
      makeTrack({ id: 2, artist: "", albumartist: undefined }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("317", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artist).toBe("");
    }
  });

  it("falls back to most-common track artist when albumartist absent", async () => {
    const tracks = [
      makeTrack({ id: 1, artist: "Holst" }),
      makeTrack({ id: 2, artist: "Die Toten Hosen" }),
      makeTrack({ id: 3, artist: "Die Toten Hosen" }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("317", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.artist).toBe("Die Toten Hosen");
    }
  });

  // Story 9.1: regression — LMS titles command returns year as string (e.g. "2008")
  it("parses releaseYear as number when LMS returns year as string", async () => {
    const tracks = [makeTrack({ year: "2008" })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("92", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.releaseYear).toBe(2008);
      expect(typeof result.value.releaseYear).toBe("number");
    }
  });

  it("returns null releaseYear when LMS returns year as string '0'", async () => {
    const tracks = [makeTrack({ year: "0" })];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("92", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.releaseYear).toBeNull();
    }
  });

  it("parses audioQuality for FLAC tracks with quality tags", async () => {
    const tracks = [
      makeTrack({
        type: "flc",
        bitrate: "1411kb/s VBR",
        samplerate: "44100",
        samplesize: 16,
      }),
    ];
    const client = makeMockClient(tracks);

    const result = await getAlbumDetail("42", client, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks[0]?.audioQuality).toBeDefined();
      expect(result.value.tracks[0]?.audioQuality?.format).toBe("FLAC");
      expect(result.value.tracks[0]?.audioQuality?.lossless).toBe(true);
    }
  });
});

// ─── getArtistTopTracksByName ───────────────────────────────────────────────

type MockPopularityClient = {
  readonly getArtistTopTracks: ReturnType<
    typeof vi.fn<ArtistPopularityClient["getArtistTopTracks"]>
  >;
  readonly getArtistTopAlbums: ReturnType<
    typeof vi.fn<ArtistPopularityClient["getArtistTopAlbums"]>
  >;
};

const makeMockPopularityClient = (
  tracks: readonly LastFmArtistTopTrack[],
): MockPopularityClient => ({
  getArtistTopTracks: vi
    .fn<ArtistPopularityClient["getArtistTopTracks"]>()
    .mockResolvedValue(ok(tracks)),
  getArtistTopAlbums: vi
    .fn<ArtistPopularityClient["getArtistTopAlbums"]>()
    .mockResolvedValue(ok([])),
});

const makeLastFmTrack = (
  overrides: Partial<LastFmArtistTopTrack> = {},
): LastFmArtistTopTrack => ({
  name: "Bohemian Rhapsody",
  artist: "Queen",
  playcount: 1000000,
  listeners: 500000,
  url: "https://www.last.fm/music/Queen/_/Bohemian+Rhapsody",
  ...overrides,
});

const makeSearchResult = (
  overrides: Partial<SearchResult> = {},
): SearchResult => ({
  id: "42",
  title: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  url: "file:///music/bohemian.flac",
  source: "local",
  type: "track",
  ...overrides,
});

type TopTracksMockClient = LmsClient & {
  readonly search: ReturnType<typeof vi.fn<LmsClient["search"]>>;
};

describe("getArtistTopTracksByName", () => {
  it("returns local track when per-track local search finds a match", async () => {
    const localTrack = makeSearchResult({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "local",
      url: "file:///music/bohemian.flac",
    });

    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockImplementation(async (_query, options) => {
          if (options?.tidalEnabled === false) {
            // per-track local search
            return ok({ tracks: [localTrack], tidalAvailable: false });
          }
          // artist Tidal search — returns no Tidal tracks
          return ok({ tracks: [], tidalAvailable: true });
        }),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.source).toBe("local");
      expect(result.value.tracks[0]?.title).toBe("Bohemian Rhapsody");
    }
  });

  it("returns Tidal track when local search is empty but artist Tidal search has a match", async () => {
    const tidalTrack = makeSearchResult({
      id: "tidal://123",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "tidal",
      url: "tidal://track/123",
    });

    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockImplementation(async (_query, options) => {
          if (options?.tidalEnabled === false) {
            // per-track local search returns nothing
            return ok({ tracks: [], tidalAvailable: false });
          }
          // artist Tidal search returns a Tidal track
          return ok({ tracks: [tidalTrack], tidalAvailable: true });
        }),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.source).toBe("tidal");
      expect(result.value.tracks[0]?.title).toBe("Bohemian Rhapsody");
    }
  });

  it("matches Tidal track with empty artist field (unenriched)", async () => {
    // Tidal tracks returned by artist search often have artist: "" before enrichment.
    // selectPlayableTopTrack allows empty artist for tidal source.
    const tidalTrackEmptyArtist = makeSearchResult({
      id: "tidal://456",
      title: "Bohemian Rhapsody",
      artist: "", // unenriched — no artist tag yet
      source: "tidal",
      url: "tidal://track/456",
    });

    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockImplementation(async (_query, options) => {
          if (options?.tidalEnabled === false) {
            return ok({ tracks: [], tidalAvailable: false });
          }
          return ok({
            tracks: [tidalTrackEmptyArtist],
            tidalAvailable: true,
          });
        }),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.source).toBe("tidal");
    }
  });

  it("prefers local over Tidal when both match the same track", async () => {
    const localTrack = makeSearchResult({
      id: "99",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "local",
      url: "file:///music/bohemian.flac",
    });
    const tidalTrack = makeSearchResult({
      id: "tidal://789",
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "tidal",
      url: "tidal://track/789",
    });

    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockImplementation(async (_query, options) => {
          if (options?.tidalEnabled === false) {
            return ok({ tracks: [localTrack], tidalAvailable: false });
          }
          return ok({ tracks: [tidalTrack], tidalAvailable: true });
        }),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.source).toBe("local");
    }
  });

  it("silently drops track when neither local nor Tidal has it", async () => {
    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockResolvedValue(ok({ tracks: [], tidalAvailable: false })),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(0);
    }
  });

  it("returns only local results when Tidal search returns empty", async () => {
    const localTrack = makeSearchResult({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      source: "local",
    });

    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockImplementation(async (_query, options) => {
          if (options?.tidalEnabled === false) {
            return ok({ tracks: [localTrack], tidalAvailable: false });
          }
          // Tidal search returns nothing — Tidal not available
          return ok({ tracks: [], tidalAvailable: false });
        }),
    };

    const popularityClient = makeMockPopularityClient([
      makeLastFmTrack({ name: "Bohemian Rhapsody", artist: "Queen" }),
    ]);

    const result = await getArtistTopTracksByName(
      "Queen",
      lmsClient,
      popularityClient,
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0]?.source).toBe("local");
    }
  });

  it("propagates Last.fm error as ArtistPopularityServiceError", async () => {
    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockResolvedValue(ok({ tracks: [], tidalAvailable: false })),
    };

    const popularityClient: MockPopularityClient = {
      getArtistTopTracks: vi
        .fn<ArtistPopularityClient["getArtistTopTracks"]>()
        .mockResolvedValue(
          err({ type: "NotFoundError", code: 6, message: "Artist not found" }),
        ),
      getArtistTopAlbums: vi
        .fn<ArtistPopularityClient["getArtistTopAlbums"]>()
        .mockResolvedValue(ok([])),
    };

    const result = await getArtistTopTracksByName(
      "UnknownArtist",
      lmsClient,
      popularityClient,
      5,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFound");
      expect(result.error.message).toBe("Artist not found");
    }
  });

  it("fires exactly one Tidal search (artist-only) and N local searches with tidalEnabled:false", async () => {
    const lmsClient: TopTracksMockClient = {
      ...createLmsClient(defaultConfig),
      search: vi
        .fn<LmsClient["search"]>()
        .mockResolvedValue(ok({ tracks: [], tidalAvailable: false })),
    };

    const topTracks: readonly LastFmArtistTopTrack[] = [
      makeLastFmTrack({ name: "Track A" }),
      makeLastFmTrack({ name: "Track B" }),
      makeLastFmTrack({ name: "Track C" }),
    ];
    const popularityClient = makeMockPopularityClient(topTracks);

    await getArtistTopTracksByName("Queen", lmsClient, popularityClient, 3);

    const calls = lmsClient.search.mock.calls;
    // 3 local searches + 1 Tidal artist search = 4 total
    expect(calls).toHaveLength(4);

    const localCalls = calls.filter(
      ([_q, opts]) => opts?.tidalEnabled === false,
    );
    const tidalCalls = calls.filter(
      ([_q, opts]) => opts?.tidalEnabled !== false,
    );

    expect(localCalls).toHaveLength(3);
    expect(tidalCalls).toHaveLength(1);

    // The Tidal call uses just the artist name
    expect(tidalCalls[0]?.[0]).toBe("Queen");

    // Each local call uses "artist trackName"
    const localQueries = localCalls.map(([q]) => q);
    expect(localQueries).toContain("Queen Track A");
    expect(localQueries).toContain("Queen Track B");
    expect(localQueries).toContain("Queen Track C");
  });
});
