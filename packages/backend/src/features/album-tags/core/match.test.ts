import { describe, it, expect } from "vitest";
import { matchCandidate } from "./match.js";
import type { LibraryAlbumMatchInput } from "./types.js";

const library: readonly LibraryAlbumMatchInput[] = [
  { id: 11, album: "The Soul Cages", artist: "Sting", year: 1991 },
  {
    id: 22,
    album: "Amused to Death [2011 Remaster]",
    artist: "Roger Waters",
    year: 1992,
  },
  { id: 33, album: "Meddle", artist: "Pink Floyd & Friends", year: 1971 },
  { id: 44, album: "Animals" },
];

describe("matchCandidate", () => {
  it("matches on normalized title and artist, ignoring a remaster suffix", () => {
    const match = matchCandidate(
      { artist: "Roger Waters", title: "Amused to Death", year: 1992 },
      library,
    );

    expect(match?.id).toBe(22);
    expect(match?.album).toBe("Amused to Death [2011 Remaster]");
  });

  it("matches when one artist string contains the other", () => {
    const match = matchCandidate(
      { artist: "Pink Floyd", title: "Meddle" },
      library,
    );

    expect(match?.id).toBe(33);
  });

  it("matches an inverted artist name via equal word sets", () => {
    const match = matchCandidate(
      { artist: "Waters, Roger", title: "Amused to Death" },
      library,
    );

    expect(match?.id).toBe(22);
  });

  it("rejects an unrelated artist on a matching title", () => {
    expect(
      matchCandidate({ artist: "Q.Sound", title: "Amused to Death" }, library),
    ).toBeUndefined();
  });

  it("rejects a wrong title for a known artist", () => {
    expect(
      matchCandidate({ artist: "Roger Waters", title: "The Wall" }, library),
    ).toBeUndefined();
  });

  it("never matches a title by substring", () => {
    expect(
      matchCandidate({ artist: "Sting", title: "Soul Cages" }, library),
    ).toBeUndefined();
  });

  it("rejects an album without artist", () => {
    expect(
      matchCandidate({ artist: "Pink Floyd", title: "Animals" }, library),
    ).toBeUndefined();
  });

  it("returns the first match in input order", () => {
    const duplicates: readonly LibraryAlbumMatchInput[] = [
      { id: "b-77", album: "Meddle", artist: "Pink Floyd", year: 1971 },
      { id: "a-11", album: "Meddle", artist: "Pink Floyd", year: 2011 },
    ];

    expect(
      matchCandidate({ artist: "Pink Floyd", title: "Meddle" }, duplicates)?.id,
    ).toBe("b-77");
  });
});
