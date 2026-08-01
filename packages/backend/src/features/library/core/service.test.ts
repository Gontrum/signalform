import { describe, it, expect } from "vitest";
import { buildLibraryAlbumsResponse, mapLibraryLmsError } from "./service.js";

const baseUrl = "http://lms.local:9000";

describe("buildLibraryAlbumsResponse", () => {
  it("maps every raw field onto the domain album", () => {
    const response = buildLibraryAlbumsResponse(
      [
        {
          id: 42,
          album: "The Wall",
          artist: "Pink Floyd",
          year: 1979,
          artwork_track_id: "abc123",
        },
      ],
      767,
      baseUrl,
    );

    expect(response.albums[0]).toEqual({
      id: "42",
      title: "The Wall",
      artist: "Pink Floyd",
      releaseYear: 1979,
      coverArtUrl: `${baseUrl}/music/abc123/cover.jpg`,
    });
    expect(response.totalCount).toBe(767);
  });

  it("exposes exactly the domain album fields, without a genre", () => {
    const response = buildLibraryAlbumsResponse(
      [{ id: 42, album: "The Wall" }],
      1,
      baseUrl,
    );

    expect(Object.keys(response.albums[0] ?? {}).sort()).toEqual([
      "artist",
      "coverArtUrl",
      "id",
      "releaseYear",
      "title",
    ]);
  });

  it("stringifies a numeric id and keeps a string id as is", () => {
    const response = buildLibraryAlbumsResponse(
      [
        { id: 7, album: "Kid A" },
        { id: "b-7", album: "Amnesiac" },
      ],
      2,
      baseUrl,
    );

    expect(response.albums.map((album) => album.id)).toEqual(["7", "b-7"]);
  });

  it("falls back to an empty artist when LMS omits it", () => {
    const response = buildLibraryAlbumsResponse(
      [{ id: 1, album: "Untitled" }],
      1,
      baseUrl,
    );

    expect(response.albums[0]?.artist).toBe("");
  });

  it("maps a missing or non-positive year to a null release year", () => {
    const response = buildLibraryAlbumsResponse(
      [
        { id: 1, album: "No Year" },
        { id: 2, album: "Zero Year", year: 0 },
        { id: 3, album: "Real Year", year: 1979 },
      ],
      3,
      baseUrl,
    );

    expect(response.albums.map((album) => album.releaseYear)).toEqual([
      null,
      null,
      1979,
    ]);
  });

  it("builds the cover art url from the album id when no artwork track exists", () => {
    const response = buildLibraryAlbumsResponse(
      [{ id: 99, album: "Coverless" }],
      1,
      baseUrl,
    );

    expect(response.albums[0]?.coverArtUrl).toBe(
      `${baseUrl}/music/0/cover.jpg?album_id=99`,
    );
  });

  it("maps each raw album onto its own domain album", () => {
    const response = buildLibraryAlbumsResponse(
      [
        { id: 3, album: "Zoo", artist: "Zed", year: 2001 },
        { id: 1, album: "Anthem", artist: "Ada", year: 1999 },
      ],
      2,
      baseUrl,
    );

    expect(response.albums).toEqual([
      {
        id: "3",
        title: "Zoo",
        artist: "Zed",
        releaseYear: 2001,
        coverArtUrl: `${baseUrl}/music/0/cover.jpg?album_id=3`,
      },
      {
        id: "1",
        title: "Anthem",
        artist: "Ada",
        releaseYear: 1999,
        coverArtUrl: `${baseUrl}/music/0/cover.jpg?album_id=1`,
      },
    ]);
  });

  it("returns an empty album list with the reported total count", () => {
    const response = buildLibraryAlbumsResponse([], 0, baseUrl);

    expect(response.albums).toEqual([]);
    expect(response.totalCount).toBe(0);
  });
});

describe("mapLibraryLmsError", () => {
  it("wraps the upstream message in an LmsError", () => {
    expect(mapLibraryLmsError("connection refused")).toEqual({
      type: "LmsError",
      message: "connection refused",
    });
  });
});
