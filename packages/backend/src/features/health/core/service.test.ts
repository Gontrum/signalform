/**
 * Health service acceptance tests (TDD — written before implementation)
 *
 * AC1: GET /health returns { status, dependencies: { lms, lastfm } }
 * AC2: LMS reachable + lastfm circuit CLOSED → { status: 'healthy', httpStatus: 200 }
 * AC3: LMS unreachable → { status: 'unhealthy', httpStatus: 503 }
 * AC5: lastfm circuit OPEN (LMS up) → { status: 'degraded', httpStatus: 200, lastfm: 'circuit open' }
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkHealth,
  type LmsHealthClient,
  type LastFmHealthClient,
} from "./service.js";

const makeLmsClient = (
  overrides: Partial<LmsHealthClient> = {},
): LmsHealthClient =>
  ({
    getStatus: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }) as LmsHealthClient;

const makeLastFmClient = (
  circuitState: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED",
): LastFmHealthClient =>
  ({
    getCircuitState: () => circuitState,
  }) as LastFmHealthClient;

describe("checkHealth()", () => {
  it("AC2: returns healthy 200 when LMS is reachable and lastfm circuit is CLOSED", async () => {
    const lms = makeLmsClient();
    const lastfm = makeLastFmClient("CLOSED");

    const result = await checkHealth(lms, lastfm);

    expect(result.status).toBe("healthy");
    expect(result.httpStatus).toBe(200);
    expect(result.dependencies.lms).toBe("connected");
    expect(result.dependencies.lastfm).toBe("available");
  });

  it("AC3: returns unhealthy 503 when LMS is unreachable", async () => {
    const lms = makeLmsClient({
      getStatus: vi.fn().mockResolvedValue({ ok: false }),
    });
    const lastfm = makeLastFmClient("CLOSED");

    const result = await checkHealth(lms, lastfm);

    expect(result.status).toBe("unhealthy");
    expect(result.httpStatus).toBe(503);
    expect(result.dependencies.lms).toBe("disconnected");
  });

  it("AC5: returns degraded 200 when LMS is up but lastfm circuit is OPEN", async () => {
    const lms = makeLmsClient();
    const lastfm = makeLastFmClient("OPEN");

    const result = await checkHealth(lms, lastfm);

    expect(result.status).toBe("degraded");
    expect(result.httpStatus).toBe(200);
    expect(result.dependencies.lms).toBe("connected");
    expect(result.dependencies.lastfm).toBe("circuit open");
  });
});
