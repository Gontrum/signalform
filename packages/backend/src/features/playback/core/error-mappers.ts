/**
 * Playback Error Mappers
 *
 * Pure functions that translate LMS errors into HTTP responses.
 * No I/O, no side effects — safe to unit test directly.
 */

import type { LmsError } from "../../../adapters/lms-client/index.js";

/**
 * Map LMS error to HTTP status code.
 */
export const mapLmsErrorToHttpStatus = (error: LmsError): number => {
  switch (error.type) {
    case "NetworkError":
    case "TimeoutError":
      return 503; // Service Unavailable
    case "ValidationError":
      return 400; // Bad Request
    case "LmsApiError":
    case "JsonParseError":
    case "EmptyQueryError":
      return 500; // Internal Server Error
    default:
      return 500;
  }
};

/**
 * Map LMS error to user-facing error type string.
 */
export const mapLmsErrorToErrorType = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "LMS_UNREACHABLE";
    case "TimeoutError":
      return "LMS_TIMEOUT";
    case "LmsApiError":
    case "JsonParseError":
    case "EmptyQueryError":
      return "PLAYBACK_FAILED";
    default:
      return "PLAYBACK_FAILED";
  }
};

/**
 * Get user-friendly error message for general playback operations.
 */
export const getUserFriendlyErrorMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "LmsApiError":
      return `Playback failed: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    case "EmptyQueryError":
      return "Track URL cannot be empty.";
    default:
      return "Could not start playback. Please try again.";
  }
};

/**
 * Get user-friendly error message for skip operations (next/previous).
 */
export const getUserFriendlySkipErrorMessage = (
  error: LmsError,
  direction: "next" | "previous",
): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "LmsApiError":
      return `Could not skip to ${direction} track: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    default:
      return `Could not skip to ${direction} track. Please try again.`;
  }
};

/**
 * Get user-friendly error message for volume operations.
 */
export const getUserFriendlyVolumeErrorMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "ValidationError":
      return error.message;
    case "LmsApiError":
      return `Volume control failed: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    default:
      return "Could not change volume. Please try again.";
  }
};

/**
 * Get user-friendly error message for seek operations.
 */
export const getUserFriendlySeekErrorMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "ValidationError":
      return error.message;
    case "LmsApiError":
      return `Seek failed: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    default:
      return "Could not seek to position. Please try again.";
  }
};

/**
 * Get user-friendly error message for time query operations.
 */
export const getUserFriendlyTimeErrorMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "LmsApiError":
      return `Could not get playback time: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    default:
      return "Could not get playback time. Please try again.";
  }
};

/**
 * Get user-friendly error message for album playback operations.
 */
export const getUserFriendlyAlbumErrorMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    case "LmsApiError":
      return `Album playback failed: ${error.message}`;
    case "JsonParseError":
      return "Music server returned invalid response. Please try again.";
    default:
      return "Could not start album playback. Please try again.";
  }
};
