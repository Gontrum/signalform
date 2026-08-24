import { describe, expect, it } from "vitest";

import { matchTidalAlbum } from "./availability.js";
import type { TidalAlbumCandidate } from "./availability.js";
import type { TagCandidate } from "./types.js";

describe("matchTidalAlbum", () => {
  const candidate: TagCandidate = {
    artist: "Madonna",
    title: "The Immaculate Collection",
  };

  it("returns the matching album for an exact match", () => {
    const match: TidalAlbumCandidate = {
      name: "The Immaculate Collection",
      coverArtUrl: "https://tidal.example/immaculate.jpg",
    };

    expect(matchTidalAlbum(candidate, [match])).toEqual(match);
  });

  it("returns undefined when no name in the list matches", () => {
    expect(
      matchTidalAlbum(candidate, [{ name: "Confessions on a Dance Floor" }]),
    ).toBeUndefined();
  });

  it("matches a bracketed-suffix edition against the base album, consistent with normalizeForMatch", () => {
    const match: TidalAlbumCandidate = {
      name: "The Immaculate Collection (Atmos Mix)",
      coverArtUrl: "https://tidal.example/atmos.jpg",
    };

    expect(matchTidalAlbum(candidate, [match])).toEqual(match);
  });

  it("returns the first matching album when the correct name is not first in the list", () => {
    const albums: readonly TidalAlbumCandidate[] = [
      { name: "Confessions on a Dance Floor", coverArtUrl: "https://t/c.jpg" },
      { name: "Ray of Light", coverArtUrl: "https://t/r.jpg" },
      {
        name: "The Immaculate Collection",
        coverArtUrl: "https://tidal.example/first.jpg",
      },
      {
        name: "The Immaculate Collection (Remastered)",
        coverArtUrl: "https://tidal.example/second.jpg",
      },
    ];

    expect(matchTidalAlbum(candidate, albums)).toEqual({
      name: "The Immaculate Collection",
      coverArtUrl: "https://tidal.example/first.jpg",
    });
  });

  it("returns undefined for an empty list", () => {
    expect(matchTidalAlbum(candidate, [])).toBeUndefined();
  });

  it("returns undefined when the candidate title normalizes to empty", () => {
    const emptyTitled: TagCandidate = { artist: "Madonna", title: "()" };

    expect(
      matchTidalAlbum(emptyTitled, [{ name: "The Immaculate Collection" }]),
    ).toBeUndefined();
  });
});
