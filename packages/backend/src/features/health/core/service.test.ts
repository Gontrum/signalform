/**
 * Health core tests — pure, synchronous, no mocks.
 *
 * toLmsStatus    — both branches
 * toLastFmStatus — all three circuit states
 * evaluateHealth — all four status combinations
 */

import { describe, it, expect } from "vitest";
import { toLmsStatus, toLastFmStatus, evaluateHealth } from "./service.js";

describe("toLmsStatus()", () => {
  it("returns 'connected' when ok is true", () => {
    expect(toLmsStatus(true)).toBe("connected");
  });

  it("returns 'disconnected' when ok is false", () => {
    expect(toLmsStatus(false)).toBe("disconnected");
  });
});

describe("toLastFmStatus()", () => {
  it("returns 'available' for CLOSED", () => {
    expect(toLastFmStatus("CLOSED")).toBe("available");
  });

  it("returns 'circuit open' for OPEN", () => {
    expect(toLastFmStatus("OPEN")).toBe("circuit open");
  });

  it("returns 'available' for HALF_OPEN", () => {
    expect(toLastFmStatus("HALF_OPEN")).toBe("available");
  });
});

describe("evaluateHealth()", () => {
  it("connected + available → healthy 200", () => {
    const result = evaluateHealth("connected", "available");
    expect(result.status).toBe("healthy");
    expect(result.httpStatus).toBe(200);
    expect(result.dependencies).toEqual({
      lms: "connected",
      lastfm: "available",
    });
  });

  it("connected + circuit open → degraded 200", () => {
    const result = evaluateHealth("connected", "circuit open");
    expect(result.status).toBe("degraded");
    expect(result.httpStatus).toBe(200);
    expect(result.dependencies).toEqual({
      lms: "connected",
      lastfm: "circuit open",
    });
  });

  it("disconnected + available → unhealthy 503", () => {
    const result = evaluateHealth("disconnected", "available");
    expect(result.status).toBe("unhealthy");
    expect(result.httpStatus).toBe(503);
    expect(result.dependencies).toEqual({
      lms: "disconnected",
      lastfm: "available",
    });
  });

  it("disconnected + circuit open → unhealthy 503", () => {
    const result = evaluateHealth("disconnected", "circuit open");
    expect(result.status).toBe("unhealthy");
    expect(result.httpStatus).toBe(503);
    expect(result.dependencies).toEqual({
      lms: "disconnected",
      lastfm: "circuit open",
    });
  });
});
