import { describe, expect, it } from "vitest";
import { reverseYearBlocks } from "./browse.js";

type Row = {
  readonly title: string;
  readonly year?: number;
};

const titlesOf = (rows: readonly Row[]): readonly string[] =>
  rows.map((row) => row.title);

const yearsOf = (rows: readonly Row[]): readonly number[] =>
  rows.map((row) => row.year ?? 0);

describe("reverseYearBlocks", () => {
  it("flips the year order while keeping the album order inside each year", () => {
    const page: readonly Row[] = [
      { title: "Ashes", year: 1999 },
      { title: "Bells", year: 1999 },
      { title: "Cinders", year: 1999 },
      { title: "Anthem", year: 2004 },
      { title: "Bonfire", year: 2004 },
      { title: "Aurora", year: 2011 },
      { title: "Beacon", year: 2011 },
      { title: "Comet", year: 2011 },
    ];

    const result = reverseYearBlocks(page);

    expect(titlesOf(result)).toEqual([
      "Aurora",
      "Beacon",
      "Comet",
      "Anthem",
      "Bonfire",
      "Ashes",
      "Bells",
      "Cinders",
    ]);
    expect(yearsOf(result)).toEqual([
      2011, 2011, 2011, 2004, 2004, 1999, 1999, 1999,
    ]);
  });

  it("leaves a page that holds a single year completely untouched", () => {
    const page: readonly Row[] = [
      { title: "Amber", year: 1987 },
      { title: "Basalt", year: 1987 },
      { title: "Cobalt", year: 1987 },
    ];

    expect(titlesOf(reverseYearBlocks(page))).toEqual([
      "Amber",
      "Basalt",
      "Cobalt",
    ]);
  });

  it("keeps partial years intact when the page starts and ends mid-year", () => {
    const page: readonly Row[] = [
      { title: "Rain", year: 1994 },
      { title: "Snow", year: 1994 },
      { title: "Alps", year: 1995 },
      { title: "Basin", year: 1995 },
      { title: "Canyon", year: 1995 },
      { title: "Arc", year: 1996 },
      { title: "Bow", year: 1996 },
    ];

    const result = reverseYearBlocks(page);

    expect(titlesOf(result)).toEqual([
      "Arc",
      "Bow",
      "Alps",
      "Basin",
      "Canyon",
      "Rain",
      "Snow",
    ]);
  });

  it("moves the year-0 block to the end like any other year", () => {
    const page: readonly Row[] = [
      { title: "Anon", year: 0 },
      { title: "Bootleg", year: 0 },
      { title: "Air", year: 2001 },
      { title: "Bay", year: 2001 },
    ];

    const result = reverseYearBlocks(page);

    expect(titlesOf(result)).toEqual(["Air", "Bay", "Anon", "Bootleg"]);
    expect(yearsOf(result)).toEqual([2001, 2001, 0, 0]);
  });

  it("treats a missing year field as the same block as year 0", () => {
    const page: readonly Row[] = [
      { title: "Alpha" },
      { title: "Beta", year: 0 },
      { title: "Gamma" },
      { title: "Delta", year: 1970 },
      { title: "Epsilon", year: 1970 },
    ];

    const result = reverseYearBlocks(page);

    expect(titlesOf(result)).toEqual([
      "Delta",
      "Epsilon",
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("returns an empty page unchanged", () => {
    expect(reverseYearBlocks([])).toEqual([]);
  });

  it("returns a single album unchanged", () => {
    expect(
      titlesOf(reverseYearBlocks([{ title: "Solo", year: 2020 }])),
    ).toEqual(["Solo"]);
  });

  it("does not mutate the page it receives", () => {
    const page: readonly Row[] = [
      { title: "Ash", year: 1990 },
      { title: "Birch", year: 1990 },
      { title: "Cedar", year: 2000 },
    ];
    const snapshot = [...page];

    reverseYearBlocks(page);

    expect(page).toEqual(snapshot);
    expect(titlesOf(page)).toEqual(["Ash", "Birch", "Cedar"]);
  });
});
