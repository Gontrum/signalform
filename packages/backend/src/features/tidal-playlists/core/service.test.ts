import { describe, expect, it } from "vitest";
import { mapTidalPlaylists, mapTidalPlaylistTracks } from "./service.js";
import type {
  TidalAlbumRaw,
  TidalTrackRaw,
} from "../../../adapters/lms-client/index.js";

const BASE_URL = "http://host:9000";

const makeRaw = (id: string, name: string, image?: string): TidalAlbumRaw => ({
  id,
  name,
  image,
  type: "playlist",
  isaudio: 1,
  hasitems: 1,
});

describe("mapTidalPlaylists", () => {
  it("constructs absolute coverArtUrl from baseUrl + image path", () => {
    const image =
      "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc123%2F1080x1080.jpg/image.jpg";
    const result = mapTidalPlaylists(
      [makeRaw("3.0", "Bacoben's Top 500 Rock 'n Roll Songs", image)],
      1,
      BASE_URL,
    );

    expect(result.playlists[0]?.coverArtUrl).toBe(`${BASE_URL}${image}`);
  });

  it("returns empty string coverArtUrl when image is absent", () => {
    const result = mapTidalPlaylists(
      [makeRaw("3.0", "Bacoben's Top 500 Rock 'n Roll Songs")],
      1,
      BASE_URL,
    );

    expect(result.playlists[0]?.coverArtUrl).toBe("");
  });

  it("passes a name containing ' - ' through unsplit", () => {
    const result = mapTidalPlaylists(
      [makeRaw("3.0", "Rock - Not Split - Please")],
      1,
      BASE_URL,
    );

    expect(result.playlists[0]?.name).toBe("Rock - Not Split - Please");
  });

  it("filters out items with an empty name", () => {
    const result = mapTidalPlaylists(
      [
        makeRaw("3.0", "Real Playlist"),
        makeRaw("3.1", "   "),
        makeRaw("3.2", "Another Playlist"),
      ],
      3,
      BASE_URL,
    );

    expect(result.playlists).toHaveLength(2);
    expect(result.playlists.map((p) => p.id)).toEqual(["3.0", "3.2"]);
  });

  it("maps totalCount from count parameter", () => {
    const result = mapTidalPlaylists([], 449, BASE_URL);

    expect(result.totalCount).toBe(449);
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

describe("mapTidalPlaylistTracks", () => {
  it("passes only isaudio === 1 items through, mixed with non-audio in the middle", () => {
    const result = mapTidalPlaylistTracks(
      [
        makeRawTrack("3.0.0", "Stairway to Heaven"),
        makeRawTrack("3.0.1", "Play All", { isaudio: 0 }),
        makeRawTrack("3.0.2", "Section Header", { isaudio: 0 }),
        makeRawTrack("3.0.3", "Layla"),
      ],
      4,
      0,
      BASE_URL,
    );

    expect(result.tracks).toHaveLength(2);
    expect(result.tracks.map((t) => t.title)).toEqual([
      "Stairway to Heaven",
      "Layla",
    ]);
  });

  it("computes position starting at the given offset", () => {
    const result = mapTidalPlaylistTracks(
      [makeRawTrack("3.0.250", "First Track On Page 2")],
      449,
      250,
      BASE_URL,
    );

    expect(result.tracks[0]?.position).toBe(250);
  });

  it("computes contiguous positions after filtering, not before", () => {
    const result = mapTidalPlaylistTracks(
      [
        makeRawTrack("3.0.0", "Track A"),
        makeRawTrack("3.0.1", "Play All", { isaudio: 0 }),
        makeRawTrack("3.0.2", "Track B"),
        makeRawTrack("3.0.3", "Track C"),
      ],
      4,
      10,
      BASE_URL,
    );

    expect(result.tracks.map((t) => t.position)).toEqual([10, 11, 12]);
  });

  it("leaves duration undefined when the raw field is missing", () => {
    const result = mapTidalPlaylistTracks(
      [makeRawTrack("3.0.0", "No Duration", { duration: undefined })],
      1,
      0,
      BASE_URL,
    );

    expect(result.tracks[0]?.duration).toBeUndefined();
  });

  it("maps duration in seconds when present", () => {
    const result = mapTidalPlaylistTracks(
      [makeRawTrack("3.0.0", "Track", { duration: 325 })],
      1,
      0,
      BASE_URL,
    );

    expect(result.tracks[0]?.duration).toBe(325);
  });

  it("maps totalCount from count parameter", () => {
    const result = mapTidalPlaylistTracks(
      [makeRawTrack("3.0.0", "Track")],
      449,
      0,
      BASE_URL,
    );

    expect(result.totalCount).toBe(449);
  });
});
