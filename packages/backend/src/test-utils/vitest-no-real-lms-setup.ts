import { assertSafeTestLmsTarget } from "./no-real-lms-guard.js";

export const assertBackendVitestLmsTargetSafe = (target: string): void => {
  assertSafeTestLmsTarget(target, "backend vitest bootstrap");
};

const target = process.env["LMS_URL"] ?? "http://localhost:9000";

assertBackendVitestLmsTargetSafe(target);
