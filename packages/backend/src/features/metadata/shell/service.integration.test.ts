import { describe, it, expect, vi } from "vitest";
import { ok, err } from "@signalform/shared";
import { getAlbumDetail } from "./service.js";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import type { AlbumTrackRaw } from "../../../adapters/lms-client/index.js";
import { createLmsClient } from "../../../adapters/lms-client/index.js";

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
