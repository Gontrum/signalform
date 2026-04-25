/**
 * Time Formatting Utilities - Unit Tests
 *
 * Pure function tests with 100% coverage for time formatting.
 */

import { describe, it, expect } from "vitest";
import { formatSeconds, formatProgress } from "./time";

describe("formatSeconds", () => {
  it("formats 0 seconds as 0:00", () => {
    expect(formatSeconds(0)).toBe("0:00");
  });

  it("formats seconds < 60 with leading zero", () => {
    expect(formatSeconds(5)).toBe("0:05");
    expect(formatSeconds(45)).toBe("0:45");
  });

  it("formats exactly 60 seconds as 1:00", () => {
    expect(formatSeconds(60)).toBe("1:00");
  });

  it("formats exactly 59 seconds as 0:59", () => {
    expect(formatSeconds(59)).toBe("0:59");
  });

  it("formats minutes correctly with single digit", () => {
    expect(formatSeconds(165)).toBe("2:45");
    expect(formatSeconds(125)).toBe("2:05");
  });

  it("formats multi-digit minutes", () => {
    expect(formatSeconds(2732)).toBe("45:32");
  });

  it("always pads seconds to 2 digits", () => {
    expect(formatSeconds(5)).toBe("0:05");
    expect(formatSeconds(125)).toBe("2:05");
    expect(formatSeconds(3605)).toBe("60:05");
  });

  it("handles edge case at 1 second", () => {
    expect(formatSeconds(1)).toBe("0:01");
  });

  it("handles large values (hours)", () => {
    expect(formatSeconds(3661)).toBe("61:01"); // 1 hour 1 minute 1 second
  });

  it("guards against negative values (returns 0:00)", () => {
    expect(formatSeconds(-1)).toBe("0:00");
    expect(formatSeconds(-100)).toBe("0:00");
  });

  it("floors float values (LMS returns fractional seconds)", () => {
    expect(formatSeconds(298.368)).toBe("4:58");
    expect(formatSeconds(145.9999)).toBe("2:25");
    expect(formatSeconds(60.1)).toBe("1:00");
  });
});

describe("formatProgress", () => {
  it("formats progress as 'current / total'", () => {
    expect(formatProgress(165, 272)).toBe("2:45 / 4:32");
  });

  it("handles zero current time", () => {
    expect(formatProgress(0, 272)).toBe("0:00 / 4:32");
  });

  it("handles zero total time", () => {
    expect(formatProgress(0, 0)).toBe("0:00 / 0:00");
  });

  it("handles current equals total", () => {
    expect(formatProgress(165, 165)).toBe("2:45 / 2:45");
  });

  it("formats with multi-digit minutes", () => {
    expect(formatProgress(2732, 3600)).toBe("45:32 / 60:00");
  });
});
