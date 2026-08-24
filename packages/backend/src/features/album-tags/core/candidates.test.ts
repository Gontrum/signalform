import { describe, it, expect } from "vitest";
import { toCandidates } from "./candidates.js";
import type { ReleaseSearchResult } from "./types.js";

describe("toCandidates", () => {
  it("splits at the first separator only", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "Roger Waters - Amused to Death - Special Edition", year: 1992 },
    ];

    expect(toCandidates(results)).toEqual([
      {
        artist: "Roger Waters",
        title: "Amused to Death - Special Edition",
        year: 1992,
      },
    ]);
  });

  it("drops entries without a separator or with an empty part", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "QSound Compilation", year: 1990 },
      { title: " - Amused to Death" },
      { title: "Roger Waters - " },
      { title: "Sting - The Soul Cages", year: 1991 },
    ];

    expect(toCandidates(results)).toEqual([
      { artist: "Sting", title: "The Soul Cages", year: 1991 },
    ]);
  });

  it("keeps the earliest year when two pressings collapse into one candidate", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "Roger Waters - Amused to Death", year: 1992 },
      { title: "Sting - The Soul Cages", year: 1991 },
      { title: "Roger Waters - Amused To Death (Remastered)", year: 1991 },
    ];

    const candidates = toCandidates(results);

    expect(candidates).toEqual([
      { artist: "Roger Waters", title: "Amused to Death", year: 1991 },
      { artist: "Sting", title: "The Soul Cages", year: 1991 },
    ]);
    expect(candidates[0]?.year).toBe(1991);
  });

  it("adopts the year of a duplicate that carries one", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "Pink Floyd - Meddle" },
      { title: "Pink Floyd - Meddle (Remastered)", year: 1971 },
    ];

    expect(toCandidates(results)).toEqual([
      { artist: "Pink Floyd", title: "Meddle", year: 1971 },
    ]);
  });

  it("keeps a known cover image when the merged duplicate has none", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "Roger Waters - Amused to Death (Remastered)" },
      {
        title: "Roger Waters - Amused to Death",
        coverImageUrl: "https://discogs.example/amused-to-death.jpg",
      },
    ];

    const candidates = toCandidates(results);

    expect(candidates).toEqual([
      {
        artist: "Roger Waters",
        title: "Amused to Death (Remastered)",
        coverImageUrl: "https://discogs.example/amused-to-death.jpg",
      },
    ]);
    expect(candidates[0]?.coverImageUrl).toBe(
      "https://discogs.example/amused-to-death.jpg",
    );
  });

  it("leaves the year undefined when no duplicate carries one", () => {
    const results: readonly ReleaseSearchResult[] = [
      { title: "Pink Floyd - Animals" },
      { title: "Pink Floyd - Animals (Remastered)" },
    ];

    expect(toCandidates(results)).toStrictEqual([
      { artist: "Pink Floyd", title: "Animals" },
    ]);
  });
});
