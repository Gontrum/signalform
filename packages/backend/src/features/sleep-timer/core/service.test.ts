import { describe, expect, it } from "vitest";
import { unwrap } from "@signalform/shared";
import { parseSleepDuration } from "./service.js";

describe("parseSleepDuration", () => {
  it.each([
    ["zero (cancels the timer)", 0],
    ["a mid-range duration", 900],
    ["the upper bound of 24 hours", 86_400],
  ])("accepts %s", (_label, input) => {
    expect(unwrap(parseSleepDuration(input))).toBe(input);
  });

  it.each([
    ["a negative number", -1],
    ["a value above the 24-hour bound", 86_401],
    ["a non-integer number", 900.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "900"],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
  ])("rejects %s", (_label, input) => {
    const result = parseSleepDuration(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Not a valid sleep duration");
    }
  });

  it("rejects a bigint without throwing", () => {
    const result = parseSleepDuration(10n);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Not a valid sleep duration");
    }
  });
});
