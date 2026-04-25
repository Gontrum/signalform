import { describe, expect, it } from "vitest";
import { mapTidalAlbums, mapTidalAlbumTracks } from "./service.js";
import type {
  TidalAlbumRaw,
  TidalTrackRaw,
} from "../../../adapters/lms-client/index.js";

const BASE_URL = "http://localhost:9000";

const makeRaw = (id: string, name: string, image?: string): TidalAlbumRaw => ({
  id,
  name,
  image,
  type: "playlist",
  isaudio: 1,
  hasitems: 1,
});

describe("mapTidalAlbums", () => {
  it("maps name '{title} - {artist}' to separate title and artist fields", () => {
    const result = mapTidalAlbums(
      [makeRaw("4.0", "Monica - Jack Harlow")],
      1,
      BASE_URL,
    );

    expect(result.albums).toHaveLength(1);
    expect(result.albums[0]?.title).toBe("Monica");
    expect(result.albums[0]?.artist).toBe("Jack Harlow");
  });

  it("uses LAST ' - ' to split name (album title may contain ' - ')", () => {
    const result = mapTidalAlbums(
      [makeRaw("4.0", "Mutter - Live - In Concert - Rammstein")],
      1,
      BASE_URL,
    );

    expect(result.albums[0]?.title).toBe("Mutter - Live - In Concert");
    expect(result.albums[0]?.artist).toBe("Rammstein");
  });

  it("returns full name as title and empty artist when no ' - ' in name", () => {
    const result = mapTidalAlbums(
      [makeRaw("4.0", "SomeAlbumWithoutDash")],
      1,
      BASE_URL,
    );

    expect(result.albums[0]?.title).toBe("SomeAlbumWithoutDash");
    expect(result.albums[0]?.artist).toBe("");
  });

  it("constructs absolute coverArtUrl from baseUrl + image path", () => {
    const image =
      "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc123%2F1280x1280.jpg/image.jpg";
    const result = mapTidalAlbums(
      [makeRaw("4.0", "Album - Artist", image)],
      1,
      BASE_URL,
    );

    expect(result.albums[0]?.coverArtUrl).toBe(`${BASE_URL}${image}`);
  });

  it("returns empty string coverArtUrl when image is absent", () => {
    const result = mapTidalAlbums(
      [makeRaw("4.0", "Album - Artist")],
      1,
      BASE_URL,
    );

    expect(result.albums[0]?.coverArtUrl).toBe("");
  });

  it("maps id field directly", () => {
    const result = mapTidalAlbums(
      [makeRaw("4.7", "Album - Artist")],
      1,
      BASE_URL,
    );

    expect(result.albums[0]?.id).toBe("4.7");
  });

  it("maps totalCount from count parameter", () => {
    const result = mapTidalAlbums([], 42, BASE_URL);

    expect(result.totalCount).toBe(42);
  });

  it("returns empty albums array when rawAlbums is empty", () => {
    const result = mapTidalAlbums([], 0, BASE_URL);

    expect(result.albums).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("maps multiple albums preserving order", () => {
    const result = mapTidalAlbums(
      [
        makeRaw("4.0", "Pablo Honey - Radiohead"),
        makeRaw("4.1", "The Bends - Radiohead"),
        makeRaw("4.2", "OK Computer - Radiohead"),
      ],
      3,
      BASE_URL,
    );

    expect(result.albums).toHaveLength(3);
    expect(result.albums[0]?.title).toBe("Pablo Honey");
    expect(result.albums[1]?.title).toBe("The Bends");
    expect(result.albums[2]?.title).toBe("OK Computer");
  });
});

const makeRawTrack = (
  id: string,
  name: string,
  overrides?: Partial<TidalTrackRaw>,
): TidalTrackRaw => ({
  id,
  name,
  url: `tidal://${id.replace(/\./g, "")}.flc`,
  duration: 240,
  type: "audio",
  isaudio: 1,
  ...overrides,
});

describe("mapTidalAlbumTracks", () => {
  it("maps track name to title", () => {
    const result = mapTidalAlbumTracks([makeRawTrack("4.0.0", "Creep")], 1);

    expect(result.tracks[0]?.title).toBe("Creep");
  });

  it("assigns 1-indexed trackNumber based on position in audio list", () => {
    const result = mapTidalAlbumTracks(
      [
        makeRawTrack("4.0.0", "Track One"),
        makeRawTrack("4.0.1", "Track Two"),
        makeRawTrack("4.0.2", "Track Three"),
      ],
      3,
    );

    expect(result.tracks[0]?.trackNumber).toBe(1);
    expect(result.tracks[1]?.trackNumber).toBe(2);
    expect(result.tracks[2]?.trackNumber).toBe(3);
  });

  it("maps url field directly", () => {
    const result = mapTidalAlbumTracks(
      [makeRawTrack("4.0.0", "Track", { url: "tidal://58990486.flc" })],
      1,
    );

    expect(result.tracks[0]?.url).toBe("tidal://58990486.flc");
  });

  it("returns empty string url when url field is absent", () => {
    const result = mapTidalAlbumTracks(
      [makeRawTrack("4.0.0", "Track", { url: undefined })],
      1,
    );

    expect(result.tracks[0]?.url).toBe("");
  });

  it("maps duration field in seconds", () => {
    const result = mapTidalAlbumTracks(
      [makeRawTrack("4.0.0", "Track", { duration: 325 })],
      1,
    );

    expect(result.tracks[0]?.duration).toBe(325);
  });

  it("returns 0 duration when duration field is absent", () => {
    const result = mapTidalAlbumTracks(
      [makeRawTrack("4.0.0", "Track", { duration: undefined })],
      1,
    );

    expect(result.tracks[0]?.duration).toBe(0);
  });

  it("filters out non-audio items (isaudio !== 1)", () => {
    const result = mapTidalAlbumTracks(
      [
        makeRawTrack("4.0.0", "Play All", { isaudio: undefined }),
        makeRawTrack("4.0.1", "Real Track", { isaudio: 1 }),
      ],
      2,
    );

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.title).toBe("Real Track");
    expect(result.tracks[0]?.trackNumber).toBe(1);
  });

  it("returns empty tracks array when all items are non-audio", () => {
    const result = mapTidalAlbumTracks(
      [makeRawTrack("4.0.0", "Play All", { isaudio: undefined })],
      1,
    );

    expect(result.tracks).toHaveLength(0);
  });

  it("returns empty tracks array when rawTracks is empty", () => {
    const result = mapTidalAlbumTracks([], 0);

    expect(result.tracks).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("maps totalCount from count parameter", () => {
    const result = mapTidalAlbumTracks([makeRawTrack("4.0.0", "Track")], 12);

    expect(result.totalCount).toBe(12);
  });
});
