/**
 * Playback Service Unit Tests
 *
 * Tests for pure business logic functions.
 * Architecture compliance: NO framework calls in test bodies - only in helpers.
 */

import { describe, it, expect } from "vitest";
import { initiatePlayback, initiateAlbumPlayback } from "./service.js";
import type {
  PlaybackCommand,
  PlaybackError,
  AlbumPlaybackCommand,
} from "./types.js";
import type { Result } from "@signalform/shared";

describe("Playback Service - Pure Functions", () => {
  describe("initiatePlayback", () => {
    describe("Valid track URLs", () => {
      it("returns Ok result for file:// URL", () => {
        const result = whenInitiatingPlayback("file:///music/track.flac");

        thenResultIsSuccess(result);
        thenPlaybackCommandIs(result, {
          command: "play",
          trackUrl: "file:///music/track.flac",
        });
      });

      it("returns Ok result for http:// URL", () => {
        const result = whenInitiatingPlayback(
          "http://stream.example.com/track.mp3",
        );

        thenResultIsSuccess(result);
        thenPlaybackCommandIs(result, {
          command: "play",
          trackUrl: "http://stream.example.com/track.mp3",
        });
      });

      it("returns Ok result for https:// URL", () => {
        const result = whenInitiatingPlayback(
          "https://stream.example.com/track.flac",
        );

        thenResultIsSuccess(result);
      });

      it("returns Ok result for qobuz:// URL", () => {
        const result = whenInitiatingPlayback("qobuz://track/123456");

        thenResultIsSuccess(result);
      });

      it("returns Ok result for tidal:// URL", () => {
        const result = whenInitiatingPlayback("tidal://track/789012");

        thenResultIsSuccess(result);
      });

      it("returns Ok result for spotify:// URL", () => {
        const result = whenInitiatingPlayback("spotify://track/abc123");

        thenResultIsSuccess(result);
      });
    });

    describe("Invalid track URLs", () => {
      it("returns Err result for empty URL", () => {
        const result = whenInitiatingPlayback("");

        thenResultIsError(result);
        thenErrorTypeIs(result, "INVALID_TRACK_URL");
        thenErrorMessageContains(result, "cannot be empty");
      });

      it("returns Err result for whitespace-only URL", () => {
        const result = whenInitiatingPlayback("   \t\n  ");

        thenResultIsError(result);
        thenErrorTypeIs(result, "INVALID_TRACK_URL");
      });

      it("returns Err result for malformed URL (no protocol)", () => {
        const result = whenInitiatingPlayback("not-a-valid-url");

        thenResultIsError(result);
        thenErrorTypeIs(result, "INVALID_TRACK_URL");
        thenErrorMessageContains(result, "Invalid track URL format");
      });

      it("returns Err result for URL without protocol separator", () => {
        const result = whenInitiatingPlayback("filemusic/track.flac");

        thenResultIsError(result);
        thenErrorTypeIs(result, "INVALID_TRACK_URL");
      });

      it("returns Err result for relative path", () => {
        const result = whenInitiatingPlayback("./music/track.flac");

        thenResultIsError(result);
        thenErrorTypeIs(result, "INVALID_TRACK_URL");
      });
    });

    describe("Edge cases", () => {
      it("handles URL with spaces (should be valid if protocol is present)", () => {
        const result = whenInitiatingPlayback(
          "file:///music/Pink Floyd - Breathe.flac",
        );

        thenResultIsSuccess(result);
      });

      it("handles very long URL (reasonable length)", () => {
        const longPath = "a".repeat(1000);
        const result = whenInitiatingPlayback(`file:///${longPath}.flac`);

        thenResultIsSuccess(result);
      });

      it("trims leading/trailing whitespace from URL", () => {
        const result = whenInitiatingPlayback("  file:///music/track.flac  ");

        thenResultIsSuccess(result);
        thenPlaybackCommandIs(result, {
          command: "play",
          trackUrl: "file:///music/track.flac",
        });
      });
    });

    describe("Business logic purity", () => {
      it("never throws exceptions for invalid input", () => {
        thenInitiatePlaybackDoesNotThrow("");
        thenInitiatePlaybackDoesNotThrow("invalid-url");
        thenInitiatePlaybackDoesNotThrow("   ");
      });

      it("is a pure function (same input = same output)", () => {
        const url = "file:///music/track.flac";

        const result1 = whenInitiatingPlayback(url);
        const result2 = whenInitiatingPlayback(url);

        expect(result1).toEqual(result2);
      });

      it("does not mutate input", () => {
        const url = "  file:///music/track.flac  ";
        const originalUrl = url;

        whenInitiatingPlayback(url);

        expect(url).toBe(originalUrl);
      });
    });
  });

  // =============================================================================
  // HELPER FUNCTIONS - Test framework code isolated here
  // =============================================================================

  // WHEN helpers - Execute actions
  // -----------------------------------------------------------------------------

  const whenInitiatingPlayback = (
    trackUrl: string,
  ): Result<PlaybackCommand, PlaybackError> => {
    return initiatePlayback(trackUrl);
  };

  // THEN helpers - Verify outcomes
  // -----------------------------------------------------------------------------

  const thenResultIsSuccess = (
    result: Result<PlaybackCommand, PlaybackError>,
  ): void => {
    expect(result.ok).toBe(true);
  };

  const thenResultIsError = (
    result: Result<PlaybackCommand, PlaybackError>,
  ): void => {
    expect(result.ok).toBe(false);
  };

  const thenPlaybackCommandIs = (
    result: Result<PlaybackCommand, PlaybackError>,
    expected: PlaybackCommand,
  ): void => {
    if (result.ok) {
      expect(result.value).toEqual(expected);
    }
  };

  const thenErrorTypeIs = (
    result: Result<PlaybackCommand, PlaybackError>,
    expectedType: PlaybackError["type"],
  ): void => {
    if (!result.ok) {
      expect(result.error.type).toBe(expectedType);
    }
  };

  const thenErrorMessageContains = (
    result: Result<PlaybackCommand, PlaybackError>,
    substring: string,
  ): void => {
    if (!result.ok) {
      expect(result.error.message).toContain(substring);
    }
  };

  const thenInitiatePlaybackDoesNotThrow = (trackUrl: string): void => {
    expect(() => initiatePlayback(trackUrl)).not.toThrow();
  };
});

describe("Playback Service - initiateAlbumPlayback", () => {
  describe("Valid album IDs", () => {
    it("returns AlbumPlaybackCommand for a numeric album ID", () => {
      const result = whenInitiatingAlbumPlayback("42");

      thenAlbumResultIsSuccess(result);
      thenAlbumCommandIs(result, { command: "play-album", albumId: "42" });
    });

    it("returns AlbumPlaybackCommand for an alphanumeric album ID", () => {
      const result = whenInitiatingAlbumPlayback("abc-123");

      thenAlbumResultIsSuccess(result);
      thenAlbumCommandIs(result, { command: "play-album", albumId: "abc-123" });
    });

    it("trims leading/trailing whitespace from album ID", () => {
      const result = whenInitiatingAlbumPlayback("  42  ");

      thenAlbumResultIsSuccess(result);
      thenAlbumCommandIs(result, { command: "play-album", albumId: "42" });
    });
  });

  describe("Invalid album IDs", () => {
    it("returns Err result for empty album ID", () => {
      const result = whenInitiatingAlbumPlayback("");

      thenAlbumResultIsError(result);
      thenAlbumErrorTypeIs(result, "INVALID_TRACK_URL");
      thenAlbumErrorMessageContains(result, "cannot be empty");
    });

    it("returns Err result for whitespace-only album ID", () => {
      const result = whenInitiatingAlbumPlayback("   \t\n  ");

      thenAlbumResultIsError(result);
      thenAlbumErrorTypeIs(result, "INVALID_TRACK_URL");
    });
  });

  describe("Business logic purity", () => {
    it("never throws exceptions for invalid input", () => {
      thenInitiateAlbumPlaybackDoesNotThrow("");
      thenInitiateAlbumPlaybackDoesNotThrow("   ");
    });

    it("is a pure function (same input = same output)", () => {
      const albumId = "42";

      const result1 = whenInitiatingAlbumPlayback(albumId);
      const result2 = whenInitiatingAlbumPlayback(albumId);

      expect(result1).toEqual(result2);
    });

    it("does not mutate input", () => {
      const albumId = "  42  ";
      const originalAlbumId = albumId;

      whenInitiatingAlbumPlayback(albumId);

      expect(albumId).toBe(originalAlbumId);
    });
  });

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  const whenInitiatingAlbumPlayback = (
    albumId: string,
  ): Result<AlbumPlaybackCommand, PlaybackError> => {
    return initiateAlbumPlayback(albumId);
  };

  const thenAlbumResultIsSuccess = (
    result: Result<AlbumPlaybackCommand, PlaybackError>,
  ): void => {
    expect(result.ok).toBe(true);
  };

  const thenAlbumResultIsError = (
    result: Result<AlbumPlaybackCommand, PlaybackError>,
  ): void => {
    expect(result.ok).toBe(false);
  };

  const thenAlbumCommandIs = (
    result: Result<AlbumPlaybackCommand, PlaybackError>,
    expected: AlbumPlaybackCommand,
  ): void => {
    if (result.ok) {
      expect(result.value).toEqual(expected);
    }
  };

  const thenAlbumErrorTypeIs = (
    result: Result<AlbumPlaybackCommand, PlaybackError>,
    expectedType: PlaybackError["type"],
  ): void => {
    if (!result.ok) {
      expect(result.error.type).toBe(expectedType);
    }
  };

  const thenAlbumErrorMessageContains = (
    result: Result<AlbumPlaybackCommand, PlaybackError>,
    substring: string,
  ): void => {
    if (!result.ok) {
      expect(result.error.message).toContain(substring);
    }
  };

  const thenInitiateAlbumPlaybackDoesNotThrow = (albumId: string): void => {
    expect(() => initiateAlbumPlayback(albumId)).not.toThrow();
  };
});
