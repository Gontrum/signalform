import type { EnrichmentError, LastFmServiceError } from "./types.js";

/**
 * Maps a LastFmError to an EnrichmentError.
 * NotFoundError → { type: "NotFound" }
 * All other errors → { type: "Unavailable" }
 */
export const mapLastFmError = (error: LastFmServiceError): EnrichmentError => {
  if (error.type === "NotFoundError") {
    return { type: "NotFound", message: error.message };
  }
  return { type: "Unavailable", message: error.message };
};
