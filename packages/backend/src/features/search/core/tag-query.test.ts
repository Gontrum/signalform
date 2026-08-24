/**
 * Tests for the `tag:` search query parsing and match-building helpers.
 */

import { describe, it, expect } from "vitest";
import { parseTagQuery, buildTagSearchMatch } from "./tag-query.js";

describe("parseTagQuery", () => {
  it("extracts the text after the tag: prefix", () => {
    expect(parseTagQuery("tag:qsound")).toEqual({ tagQuery: "qsound" });
  });

  it("matches the prefix case-insensitively", () => {
    expect(parseTagQuery("TAG:qsound")).toEqual({ tagQuery: "qsound" });
  });

  it("trims surrounding whitespace before and after parsing", () => {
    expect(parseTagQuery("  tag:qsound  ")).toEqual({ tagQuery: "qsound" });
  });

  it("returns a match with an empty tagQuery when the rest after the prefix is empty", () => {
    expect(parseTagQuery("tag:")).toEqual({ tagQuery: "" });
  });

  it("returns a match with an empty tagQuery when the rest after the prefix is only whitespace", () => {
    expect(parseTagQuery("tag:   ")).toEqual({ tagQuery: "" });
  });

  it("returns undefined when the query has no tag: prefix", () => {
    expect(parseTagQuery("Sting")).toBeUndefined();
  });

  it("keeps internal whitespace in a multi-word tag query", () => {
    expect(parseTagQuery("tag:qsound extra")).toEqual({
      tagQuery: "qsound extra",
    });
  });
});

describe("buildTagSearchMatch", () => {
  it("builds a single match with the query as display name when candidates exist", () => {
    expect(buildTagSearchMatch("qsound", 5)).toEqual([
      { query: "qsound", displayName: "qsound", albumCount: 5 },
    ]);
  });

  it("returns an empty array when there are no candidates", () => {
    expect(buildTagSearchMatch("qsound", 0)).toEqual([]);
  });
});
