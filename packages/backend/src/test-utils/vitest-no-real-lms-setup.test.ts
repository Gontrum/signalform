import { describe, expect, it } from "vitest";

import { assertBackendVitestLmsTargetSafe } from "./vitest-no-real-lms-setup.js";

describe("vitest-no-real-lms-setup bootstrap", () => {
  it("allows loopback LMS target without throwing", () => {
    expect(() =>
      assertBackendVitestLmsTargetSafe("http://127.0.0.1:9000"),
    ).not.toThrow();
  });

  it("throws actionable error for private-range non-loopback target", () => {
    expect(() =>
      assertBackendVitestLmsTargetSafe("http://192.168.178.39:9000"),
    ).toThrow(
      /\[no-real-lms-guard\] Unsafe LMS target "http:\/\/192\.168\.178\.39:9000"/,
    );
  });
});
