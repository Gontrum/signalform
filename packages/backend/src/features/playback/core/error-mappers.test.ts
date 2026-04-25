import { describe, it, expect } from "vitest";
import {
  mapLmsErrorToHttpStatus,
  mapLmsErrorToErrorType,
  getUserFriendlyErrorMessage,
  getUserFriendlySkipErrorMessage,
  getUserFriendlyVolumeErrorMessage,
  getUserFriendlySeekErrorMessage,
  getUserFriendlyTimeErrorMessage,
  getUserFriendlyAlbumErrorMessage,
} from "./error-mappers.js";
import type { LmsError } from "../../../adapters/lms-client/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const networkError: LmsError = {
  type: "NetworkError",
  message: "ECONNREFUSED",
};
const timeoutError: LmsError = {
  type: "TimeoutError",
  message: "Request timed out",
};
const validationError: LmsError = {
  type: "ValidationError",
  message: "Invalid volume: 999",
};
const apiError: LmsError = {
  type: "LmsApiError",
  code: 500,
  message: "Player not found",
};
const parseError: LmsError = {
  type: "JsonParseError",
  message: "Unexpected token",
};
const emptyQueryError: LmsError = {
  type: "EmptyQueryError",
  message: "URL is empty",
};

// ─── mapLmsErrorToHttpStatus ──────────────────────────────────────────────────

describe("mapLmsErrorToHttpStatus", () => {
  it("returns 503 for NetworkError", () => {
    expect(mapLmsErrorToHttpStatus(networkError)).toBe(503);
  });

  it("returns 503 for TimeoutError", () => {
    expect(mapLmsErrorToHttpStatus(timeoutError)).toBe(503);
  });

  it("returns 400 for ValidationError", () => {
    expect(mapLmsErrorToHttpStatus(validationError)).toBe(400);
  });

  it("returns 500 for LmsApiError", () => {
    expect(mapLmsErrorToHttpStatus(apiError)).toBe(500);
  });

  it("returns 500 for JsonParseError", () => {
    expect(mapLmsErrorToHttpStatus(parseError)).toBe(500);
  });

  it("returns 500 for EmptyQueryError", () => {
    expect(mapLmsErrorToHttpStatus(emptyQueryError)).toBe(500);
  });
});

// ─── mapLmsErrorToErrorType ───────────────────────────────────────────────────

describe("mapLmsErrorToErrorType", () => {
  it("returns LMS_UNREACHABLE for NetworkError", () => {
    expect(mapLmsErrorToErrorType(networkError)).toBe("LMS_UNREACHABLE");
  });

  it("returns LMS_TIMEOUT for TimeoutError", () => {
    expect(mapLmsErrorToErrorType(timeoutError)).toBe("LMS_TIMEOUT");
  });

  it("returns PLAYBACK_FAILED for LmsApiError", () => {
    expect(mapLmsErrorToErrorType(apiError)).toBe("PLAYBACK_FAILED");
  });

  it("returns PLAYBACK_FAILED for JsonParseError", () => {
    expect(mapLmsErrorToErrorType(parseError)).toBe("PLAYBACK_FAILED");
  });

  it("returns PLAYBACK_FAILED for EmptyQueryError", () => {
    expect(mapLmsErrorToErrorType(emptyQueryError)).toBe("PLAYBACK_FAILED");
  });
});

// ─── getUserFriendlyErrorMessage ──────────────────────────────────────────────

describe("getUserFriendlyErrorMessage", () => {
  it("mentions LMS for NetworkError", () => {
    expect(getUserFriendlyErrorMessage(networkError)).toContain(
      "Lyrion Music Server",
    );
  });

  it("mentions timeout for TimeoutError", () => {
    expect(getUserFriendlyErrorMessage(timeoutError)).toContain(
      "did not respond in time",
    );
  });

  it("includes the LMS error message for LmsApiError", () => {
    expect(getUserFriendlyErrorMessage(apiError)).toContain("Player not found");
  });

  it("mentions invalid response for JsonParseError", () => {
    expect(getUserFriendlyErrorMessage(parseError)).toContain(
      "invalid response",
    );
  });

  it("mentions empty URL for EmptyQueryError", () => {
    expect(getUserFriendlyErrorMessage(emptyQueryError)).toContain(
      "cannot be empty",
    );
  });
});

// ─── getUserFriendlySkipErrorMessage ─────────────────────────────────────────

describe("getUserFriendlySkipErrorMessage", () => {
  it("mentions 'next' in the message when direction is next", () => {
    const msg = getUserFriendlySkipErrorMessage(apiError, "next");
    expect(msg).toContain("next");
    expect(msg).toContain("Player not found");
  });

  it("mentions 'previous' in the message when direction is previous", () => {
    const msg = getUserFriendlySkipErrorMessage(apiError, "previous");
    expect(msg).toContain("previous");
  });

  it("returns LMS connection message for NetworkError regardless of direction", () => {
    expect(getUserFriendlySkipErrorMessage(networkError, "next")).toContain(
      "Lyrion Music Server",
    );
    expect(getUserFriendlySkipErrorMessage(networkError, "previous")).toContain(
      "Lyrion Music Server",
    );
  });

  it("returns timeout message for TimeoutError", () => {
    expect(getUserFriendlySkipErrorMessage(timeoutError, "next")).toContain(
      "did not respond in time",
    );
  });
});

// ─── getUserFriendlyVolumeErrorMessage ───────────────────────────────────────

describe("getUserFriendlyVolumeErrorMessage", () => {
  it("returns the ValidationError message directly (so UI can show the validation detail)", () => {
    expect(getUserFriendlyVolumeErrorMessage(validationError)).toBe(
      "Invalid volume: 999",
    );
  });

  it("mentions 'Volume control' for LmsApiError", () => {
    expect(getUserFriendlyVolumeErrorMessage(apiError)).toContain(
      "Volume control",
    );
  });

  it("returns LMS connection message for NetworkError", () => {
    expect(getUserFriendlyVolumeErrorMessage(networkError)).toContain(
      "Lyrion Music Server",
    );
  });

  it("returns timeout message for TimeoutError", () => {
    expect(getUserFriendlyVolumeErrorMessage(timeoutError)).toContain(
      "did not respond in time",
    );
  });

  it("returns invalid response for JsonParseError", () => {
    expect(getUserFriendlyVolumeErrorMessage(parseError)).toContain(
      "invalid response",
    );
  });
});

// ─── getUserFriendlySeekErrorMessage ─────────────────────────────────────────

describe("getUserFriendlySeekErrorMessage", () => {
  it("returns the ValidationError message directly", () => {
    expect(getUserFriendlySeekErrorMessage(validationError)).toBe(
      "Invalid volume: 999",
    );
  });

  it("mentions 'Seek failed' for LmsApiError", () => {
    expect(getUserFriendlySeekErrorMessage(apiError)).toContain("Seek failed");
  });

  it("mentions 'seek to position' in fallback for NetworkError", () => {
    expect(getUserFriendlySeekErrorMessage(networkError)).toContain(
      "Lyrion Music Server",
    );
  });
});

// ─── getUserFriendlyTimeErrorMessage ─────────────────────────────────────────

describe("getUserFriendlyTimeErrorMessage", () => {
  it("mentions 'playback time' for LmsApiError", () => {
    expect(getUserFriendlyTimeErrorMessage(apiError)).toContain(
      "playback time",
    );
    expect(getUserFriendlyTimeErrorMessage(apiError)).toContain(
      "Player not found",
    );
  });

  it("returns LMS connection message for NetworkError", () => {
    expect(getUserFriendlyTimeErrorMessage(networkError)).toContain(
      "Lyrion Music Server",
    );
  });

  it("returns timeout message for TimeoutError", () => {
    expect(getUserFriendlyTimeErrorMessage(timeoutError)).toContain(
      "did not respond in time",
    );
  });

  it("returns invalid response for JsonParseError", () => {
    expect(getUserFriendlyTimeErrorMessage(parseError)).toContain(
      "invalid response",
    );
  });
});

// ─── getUserFriendlyAlbumErrorMessage ────────────────────────────────────────

describe("getUserFriendlyAlbumErrorMessage", () => {
  it("mentions 'Album playback failed' for LmsApiError", () => {
    expect(getUserFriendlyAlbumErrorMessage(apiError)).toContain(
      "Album playback failed",
    );
    expect(getUserFriendlyAlbumErrorMessage(apiError)).toContain(
      "Player not found",
    );
  });

  it("returns LMS connection message for NetworkError", () => {
    expect(getUserFriendlyAlbumErrorMessage(networkError)).toContain(
      "Lyrion Music Server",
    );
  });

  it("returns timeout message for TimeoutError", () => {
    expect(getUserFriendlyAlbumErrorMessage(timeoutError)).toContain(
      "did not respond in time",
    );
  });

  it("returns invalid response for JsonParseError", () => {
    expect(getUserFriendlyAlbumErrorMessage(parseError)).toContain(
      "invalid response",
    );
  });
});
