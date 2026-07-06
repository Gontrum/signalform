/**
 * Health check service (functional core)
 *
 * toLmsStatus     — maps a probe outcome to 'connected' | 'disconnected'
 * toLastFmStatus  — maps a circuit state to 'available' | 'circuit open'
 * evaluateHealth  — composes both statuses into HealthResult
 *
 * All functions are pure; probing LMS and reading the circuit state
 * happen in the shell, which passes the raw results in.
 *
 * Logic:
 *   LMS connected + lastfm available  → healthy 200
 *   LMS connected + circuit open      → degraded 200
 *   LMS disconnected                  → unhealthy 503
 */

export type LmsStatus = "connected" | "disconnected";
export type LastFmStatus = "available" | "circuit open";
type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type HealthResult = {
  readonly status: HealthStatus;
  readonly httpStatus: 200 | 503;
  readonly dependencies: {
    readonly lms: LmsStatus;
    readonly lastfm: LastFmStatus;
  };
};

export const toLmsStatus = (ok: boolean): LmsStatus =>
  ok ? "connected" : "disconnected";

export const toLastFmStatus = (
  state: "CLOSED" | "OPEN" | "HALF_OPEN",
): LastFmStatus => (state === "OPEN" ? "circuit open" : "available");

export const evaluateHealth = (
  lms: LmsStatus,
  lastfm: LastFmStatus,
): HealthResult => {
  if (lms === "disconnected") {
    return {
      status: "unhealthy",
      httpStatus: 503,
      dependencies: { lms, lastfm },
    };
  }

  const status: HealthStatus =
    lastfm === "circuit open" ? "degraded" : "healthy";

  return {
    status,
    httpStatus: 200,
    dependencies: { lms, lastfm },
  };
};
