import { describe, expect, test } from "vitest";
import { nextPollDelayMs } from "./poll-backoff.js";

describe("nextPollDelayMs", () => {
  test("keeps the configured interval while polling succeeds", () => {
    expect(nextPollDelayMs(1000, 0)).toBe(1000);
  });

  test("backs off to 5s from the first failure until the third", () => {
    expect(nextPollDelayMs(1000, 1)).toBe(5000);
    expect(nextPollDelayMs(1000, 2)).toBe(5000);
  });

  test("caps at 30s from the third consecutive failure onwards", () => {
    expect(nextPollDelayMs(1000, 3)).toBe(30000);
    expect(nextPollDelayMs(1000, 4)).toBe(30000);
    expect(nextPollDelayMs(1000, 100_000)).toBe(30000);
  });

  test("applies a non-default interval only to the failure-free case", () => {
    expect(nextPollDelayMs(250, 0)).toBe(250);
    expect(nextPollDelayMs(250, 1)).toBe(5000);
    expect(nextPollDelayMs(250, 3)).toBe(30000);
  });

  test("treats an interval longer than the backoff steps as the success delay only", () => {
    expect(nextPollDelayMs(60_000, 0)).toBe(60_000);
    expect(nextPollDelayMs(60_000, 1)).toBe(5000);
  });
});
