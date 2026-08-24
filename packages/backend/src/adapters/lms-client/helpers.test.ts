/**
 * LMS Client Helpers Unit Tests
 *
 * Covers sanitizeForItemIdPath — the item_id path-injection fix for the
 * 2026-08-19 production OOM incident (see .scratch/analyse-2026-08-19-lms-oom-tag-suche.md).
 * LMS splits item_id on "." into a menu navigation path
 * (Slim::Control::XMLBrowser: `split /\./, $item_id`); an unsanitized dot in
 * the search query lets LMS navigate into an unrelated, potentially huge
 * catalog node instead of the search results.
 */

import { describe, it, expect } from "vitest";
import { sanitizeForItemIdPath } from "./helpers.js";

describe("sanitizeForItemIdPath", () => {
  it("removes all dots from a title with a trailing abbreviation", () => {
    expect(sanitizeForItemIdPath("Good Night E.P.")).not.toContain(".");
  });

  it("removes all dots from a title with an embedded volume number", () => {
    expect(sanitizeForItemIdPath("From The Vaults | Vol. 1")).not.toContain(
      ".",
    );
  });

  it("leaves a title without dots unchanged", () => {
    expect(sanitizeForItemIdPath("Mr Bungle")).toBe("Mr Bungle");
  });

  it("keeps word boundaries by replacing dots with spaces, not removing them", () => {
    // "St. Anger" must stay two separate words, never merge into "StAnger".
    const sanitized = sanitizeForItemIdPath("St. Anger");
    expect(sanitized).not.toContain(".");
    expect(sanitized.trim().split(/\s+/)).toEqual(["St", "Anger"]);
  });
});
