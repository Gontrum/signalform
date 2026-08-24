import { describe, it, expect } from "vitest";
import {
  sliceCandidatePage,
  toTagAlbumView,
  buildCoverArtUrl,
} from "./page.js";
import type { TagCandidate } from "./types.js";

describe("sliceCandidatePage", () => {
  const candidates: readonly TagCandidate[] = [
    { artist: "Roger Waters", title: "Amused to Death" },
    { artist: "Sting", title: "The Soul Cages" },
    { artist: "Pink Floyd", title: "Meddle" },
    { artist: "Pink Floyd", title: "Animals" },
  ];

  it("returns an empty page with hasMore false when offset is at or past the length", () => {
    expect(sliceCandidatePage(candidates, 4, 2)).toEqual({
      page: [],
      hasMore: false,
      totalCandidates: 4,
    });
    expect(sliceCandidatePage(candidates, 10, 2)).toEqual({
      page: [],
      hasMore: false,
      totalCandidates: 4,
    });
  });

  it("sets hasMore to false when offset + limit lands exactly on the length", () => {
    expect(sliceCandidatePage(candidates, 2, 2)).toEqual({
      page: [
        { artist: "Pink Floyd", title: "Meddle" },
        { artist: "Pink Floyd", title: "Animals" },
      ],
      hasMore: false,
      totalCandidates: 4,
    });
  });

  it("returns the correct slice, hasMore true, and the full length in totalCandidates for a middle page", () => {
    expect(sliceCandidatePage(candidates, 1, 1)).toEqual({
      page: [{ artist: "Sting", title: "The Soul Cages" }],
      hasMore: true,
      totalCandidates: 4,
    });
  });
});

describe("buildCoverArtUrl", () => {
  it("builds the cover.jpg path under /music/<artworkTrackId> when the artwork track id is set", () => {
    expect(buildCoverArtUrl("http://192.168.1.10:9000", "42", "9876")).toBe(
      "http://192.168.1.10:9000/music/9876/cover.jpg",
    );
  });

  it("falls back to /music/0/cover.jpg?album_id=<albumId> when the artwork track id is missing", () => {
    expect(buildCoverArtUrl("http://192.168.1.10:9000", "42", undefined)).toBe(
      "http://192.168.1.10:9000/music/0/cover.jpg?album_id=42",
    );
  });
});

describe("toTagAlbumView", () => {
  const baseUrl = "http://192.168.1.10:9000";

  it("builds a local view with the artworkTrackId-based cover when only the local album is available", () => {
    const candidate: TagCandidate = {
      artist: "Roger Waters",
      title: "Amused to Death",
      year: 1992,
      coverImageUrl: "https://discogs.example/cover.jpg",
    };

    const result = toTagAlbumView(
      candidate,
      { albumId: "42", artworkTrackId: "9876" },
      undefined,
      baseUrl,
    );

    expect(result).toEqual({
      artist: "Roger Waters",
      title: "Amused to Death",
      year: 1992,
      coverArtUrl: "http://192.168.1.10:9000/music/9876/cover.jpg",
      source: "local",
      albumId: "42",
    });
  });

  it("falls back to the album_id query form when the local album has no artwork track id", () => {
    const candidate: TagCandidate = {
      artist: "Roger Waters",
      title: "Amused to Death",
    };

    const result = toTagAlbumView(
      candidate,
      { albumId: "42" },
      undefined,
      baseUrl,
    );

    expect(result?.coverArtUrl).toBe(
      "http://192.168.1.10:9000/music/0/cover.jpg?album_id=42",
    );
    expect(result?.source).toBe("local");
  });

  it("prefers the local source over Tidal when both are available", () => {
    const candidate: TagCandidate = { artist: "Sting", title: "Ten Summoner" };

    const result = toTagAlbumView(
      candidate,
      { albumId: "42", artworkTrackId: "9876" },
      { coverArtUrl: "https://tidal.example/ten-summoner.jpg" },
      baseUrl,
    );

    expect(result).toEqual({
      artist: "Sting",
      title: "Ten Summoner",
      coverArtUrl: "http://192.168.1.10:9000/music/9876/cover.jpg",
      source: "local",
      albumId: "42",
    });
  });

  it("uses the Tidal cover and omits albumId when only Tidal has the album", () => {
    const candidate: TagCandidate = {
      artist: "Sting",
      title: "The Soul Cages",
      year: 1991,
      coverImageUrl: "https://discogs.example/soul-cages.jpg",
    };

    const result = toTagAlbumView(
      candidate,
      undefined,
      {
        coverArtUrl: "https://tidal.example/soul-cages.jpg",
      },
      baseUrl,
    );

    expect(result).toEqual({
      artist: "Sting",
      title: "The Soul Cages",
      year: 1991,
      coverArtUrl: "https://tidal.example/soul-cages.jpg",
      source: "tidal",
    });
    expect(result !== undefined && "albumId" in result).toBe(false);
  });

  it("returns undefined for a Tidal-only album without a cover", () => {
    const candidate: TagCandidate = {
      artist: "Sting",
      title: "The Soul Cages",
      coverImageUrl: "https://discogs.example/soul-cages.jpg",
    };

    expect(toTagAlbumView(candidate, undefined, {}, baseUrl)).toBeUndefined();
  });

  it("returns undefined when the album is available neither locally nor on Tidal", () => {
    const candidate: TagCandidate = {
      artist: "Pink Floyd",
      title: "Meddle",
      coverImageUrl: "https://discogs.example/meddle.jpg",
    };

    expect(
      toTagAlbumView(candidate, undefined, undefined, baseUrl),
    ).toBeUndefined();
  });

  it("omits the year key entirely when the candidate has no year", () => {
    const candidate: TagCandidate = { artist: "Pink Floyd", title: "Animals" };

    const result = toTagAlbumView(
      candidate,
      { albumId: "7", artworkTrackId: "70" },
      undefined,
      baseUrl,
    );

    expect(result !== undefined && "year" in result).toBe(false);
  });
});
