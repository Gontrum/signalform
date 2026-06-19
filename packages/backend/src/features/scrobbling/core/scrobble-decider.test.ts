import { describe, it, expect } from "vitest";
import { shouldScrobble } from "./scrobble-decider.js";

describe("shouldScrobble", () => {
  it("returns false when elapsed < 30 seconds", () => {
    expect(shouldScrobble({ elapsedSeconds: 29, durationSeconds: 300 })).toBe(
      false,
    );
  });

  it("returns false when elapsed is exactly 30 seconds but less than half duration", () => {
    // half of 300 = 150, elapsed=30 is < 150 and < 240
    expect(shouldScrobble({ elapsedSeconds: 30, durationSeconds: 300 })).toBe(
      false,
    );
  });

  it("returns true when elapsed >= half duration (and >= 30)", () => {
    expect(shouldScrobble({ elapsedSeconds: 150, durationSeconds: 300 })).toBe(
      true,
    );
  });

  it("returns true when elapsed >= 240 regardless of duration", () => {
    expect(shouldScrobble({ elapsedSeconds: 240, durationSeconds: 600 })).toBe(
      true,
    );
  });

  it("returns false when elapsed < 240 and < half duration", () => {
    expect(shouldScrobble({ elapsedSeconds: 100, durationSeconds: 300 })).toBe(
      false,
    );
  });

  it("returns true for short track: elapsed >= half duration", () => {
    // 60 second track, 30 seconds elapsed = exactly half
    expect(shouldScrobble({ elapsedSeconds: 30, durationSeconds: 60 })).toBe(
      true,
    );
  });

  it("returns false for short track: elapsed < half duration and < 240", () => {
    expect(shouldScrobble({ elapsedSeconds: 29, durationSeconds: 60 })).toBe(
      false,
    );
  });

  it("handles durationSeconds = 0 (no known duration): requires 240 seconds", () => {
    expect(shouldScrobble({ elapsedSeconds: 239, durationSeconds: 0 })).toBe(
      false,
    );
    expect(shouldScrobble({ elapsedSeconds: 240, durationSeconds: 0 })).toBe(
      true,
    );
  });
});
