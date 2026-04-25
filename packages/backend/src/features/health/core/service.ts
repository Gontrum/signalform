/**
 * Health check service (functional core)
 *
 * checkLms   — probes LMS via getStatus(); returns 'connected' | 'disconnected'
 * checkLastfm — reads circuit state; returns 'available' | 'circuit open'
 * checkHealth — composes both into HealthResult
 *
 * Logic:
 *   LMS connected + lastfm available  → healthy 200
 *   LMS connected + circuit open      → degraded 200
 *   LMS disconnected                  → unhealthy 503
 */

export type LmsStatus = "connected" | "disconnected";
export type LastFmStatus = "available" | "circuit open";
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type HealthResult = {
  readonly status: HealthStatus;
  readonly httpStatus: 200 | 503;
  readonly dependencies: {
    readonly lms: LmsStatus;
    readonly lastfm: LastFmStatus;
  };
};

export type LmsHealthClient = {
  readonly getStatus: () => Promise<{
    readonly ok: boolean;
  }>;
};

export type LastFmHealthClient = {
  readonly getCircuitState: () => "CLOSED" | "OPEN" | "HALF_OPEN";
};

export const checkLms = async (
  lmsClient: LmsHealthClient,
): Promise<LmsStatus> => {
  const result = await lmsClient.getStatus();
  return result.ok ? "connected" : "disconnected";
};

export const checkLastfm = (lastFmClient: LastFmHealthClient): LastFmStatus => {
  const state = lastFmClient.getCircuitState();
  return state === "OPEN" ? "circuit open" : "available";
};

export const checkHealth = async (
  lmsClient: LmsHealthClient,
  lastFmClient: LastFmHealthClient,
): Promise<HealthResult> => {
  const lms = await checkLms(lmsClient);
  const lastfm = checkLastfm(lastFmClient);

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
