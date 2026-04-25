/**
 * LMS Client Acceptance Tests
 *
 * BDD Outside-In approach: Tests based on Example Mapping session.
 * These tests define the behavior from the user's perspective (backend developer).
 *
 * Architecture compliance: NO test framework calls in test bodies.
 * Framework code (vitest, expect, mocks) ONLY in helper functions.
 *
 * 8 Business Rules identified in Example Mapping:
 * 1. JSON-RPC Request Construction
 * 2. Connection Timeout (5 seconds)
 * 3. Error Handling with Result<T, E>
 * 4. Empty Search Results
 * 5. Player ID Configuration
 * 6. Response Parsing & Validation
 * 7. Source Detection from URL
 * 8. Parallel Tidal Search (Story 7.7)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLmsClient } from "./client.js";
import type { LmsClient } from "./client.js";
import type {
  LmsConfig,
  LmsError,
  SearchResult,
  PlayerStatus,
} from "./types.js";
import type { Result } from "@signalform/shared";

const fetchMock = vi.fn();

type JsonRpcRequestBody = {
  readonly params: readonly [string, readonly unknown[]];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const parseJsonRpcRequestBody = (body: unknown): JsonRpcRequestBody => {
  expect(typeof body).toBe("string");
  const parsed = JSON.parse(typeof body === "string" ? body : "{}");
  const params: readonly [string, readonly unknown[]] | null =
    isRecord(parsed) &&
    Array.isArray(parsed["params"]) &&
    typeof parsed["params"][0] === "string" &&
    Array.isArray(parsed["params"][1])
      ? [parsed["params"][0], parsed["params"][1]]
      : null;
  expect(params).not.toBeNull();
  return {
    params: params ?? ["", []],
  };
};

const getJsonRpcRequestBodyAt = (callIndex: number): JsonRpcRequestBody => {
  const requestInit = fetchMock.mock.calls[callIndex]?.[1];
  const body = isRecord(requestInit) ? requestInit["body"] : undefined;
  return parseJsonRpcRequestBody(body);
};

type AlbumTracksResult = ReturnType<LmsClient["getAlbumTracks"]>;
type ArtistAlbumsResult = ReturnType<LmsClient["getArtistAlbums"]>;

describe("LMS Client - Acceptance Tests", () => {
  const defaultConfig: LmsConfig = {
    host: "localhost",
    port: 9000,
    playerId: "00:00:00:00:00:00",
    timeout: 5000,
    retryBaseDelayMs: 0, // instant retry in tests — no real delays
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Rule 1: JSON-RPC Request Construction", () => {
    it("constructs valid JSON-RPC 2.0 request for search command", async () => {
      await givenLmsWillReturnEmptySearchResults();

      await whenSearchingForTracks("Pink Floyd");

      await thenJsonRpcRequestWasSentWithMethod("slim.request");
      await thenRequestContainsPlayerId("00:00:00:00:00:00");
      await thenRequestContainsCommand("titles");
    });

    it("properly escapes special characters in search query", async () => {
      await givenLmsWillReturnEmptySearchResults();

      await whenSearchingForTracks('Pink Floyd - "The Wall"');

      await thenRequestContainsQuery('Pink Floyd - "The Wall"');
    });
  });

  describe("Rule 2: Connection Timeout (5 seconds)", () => {
    it("returns empty results when LMS does not respond within 5 seconds (graceful degradation)", async () => {
      await givenLmsWillTimeoutAfter(6000);

      const resultPromise = whenSearchingForTracks("test");
      await whenWaitingForTimeout(5000);
      const result = await resultPromise;

      // Story 7.7: LMS timeout in local search → graceful degradation → ok([])
      // (Tidal timeout fires at 250ms, local AbortController at 5s — both return [])
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    }, 10000);

    it("succeeds when LMS responds just before timeout", async () => {
      await givenLmsWillRespondAfter(4900, { titles_loop: [], count: 0 });

      const resultPromise = whenSearchingForTracks("test");
      await whenWaitingForTimeout(4900);
      const result = await resultPromise;

      await thenResultIsSuccess(result);
    }, 10000);
  });

  describe("Rule 3: Error Handling with Result<T, E>", () => {
    it("returns empty results when network fails (graceful degradation — no error propagated)", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenSearchingForTracks("test");

      // Story 7.7: search() no longer propagates network errors — graceful degradation
      // both local and Tidal fetches fail → combined result is ok([])
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("returns empty results when response JSON is invalid (graceful degradation)", async () => {
      await givenLmsWillReturnInvalidJson();

      const result = await whenSearchingForTracks("test");

      // Story 7.7: parse errors in local/Tidal search → graceful degradation, return []
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("returns empty results when LMS returns API error (graceful degradation)", async () => {
      await givenLmsWillReturnApiError(-32601, "Method not found");

      const result = await whenSearchingForTracks("test");

      // Story 7.7: LMS API errors in local/Tidal search → graceful degradation, return []
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("never throws exceptions for business errors", async () => {
      await givenLmsConnectionWillFail("Network failure");

      await thenSearchDoesNotThrowException("test");
    });
  });

  describe("Rule 4: Empty Search Results", () => {
    it("returns empty array when LMS returns no results (count=0)", async () => {
      await givenLmsWillReturnEmptySearchResults();

      const result = await whenSearchingForTracks("xyzabc123nonexistent");

      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("returns empty array when titles_loop field is missing", async () => {
      await givenLmsWillReturnResponseWithoutSearchLoop();

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("validates empty query client-side before sending to LMS", async () => {
      const result = await whenSearchingForTracks("");

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "EmptyQueryError");
      await thenLmsWasNotCalled();
    });

    it("validates whitespace-only query client-side", async () => {
      const result = await whenSearchingForTracks("   \t\n  ");

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "EmptyQueryError");
      await thenLmsWasNotCalled();
    });

    it("returns empty results when titles_loop is not an array (graceful degradation)", async () => {
      await givenLmsWillReturnMalformedSearchLoop("invalid-string");

      const result = await whenSearchingForTracks("test");

      // Story 7.7: malformed titles_loop → searchLocal returns [] → graceful degradation
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });
  });

  describe("Rule 5: Player ID Configuration", () => {
    it("uses configured player ID in all requests", async () => {
      await givenLmsWillReturnEmptySearchResults();

      await whenSearchingForTracksWithClient("test", "AA:BB:CC:DD:EE:FF");

      await thenRequestContainsPlayerId("AA:BB:CC:DD:EE:FF");
    });

    it("does not validate player ID format (delegates to LMS — returns empty on error)", async () => {
      await givenLmsWillReturnApiError(-32600, "Invalid player ID");

      const result = await whenSearchingForTracksWithClient(
        "test",
        "invalid-mac-address",
      );

      // Story 7.7: LMS API error → graceful degradation → ok([])
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });
  });

  describe("Rule 6: Response Parsing & Validation", () => {
    it("extracts result from valid JSON-RPC response", async () => {
      await givenLmsHasTrack({
        id: 1, // numeric (titles-command returns numeric ids)
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "file:///music/breathe.flac",
      });

      const result = await whenSearchingForTracks("Pink Floyd");

      await thenResultIsSuccess(result);
      await thenSearchResultsContain(result, { title: "Breathe" });
    });

    it("returns empty results when LMS error field is present (graceful degradation)", async () => {
      await givenLmsWillReturnResponseWithBothResultAndError();

      const result = await whenSearchingForTracks("test");

      // Story 7.7: LMS error response → searchLocal returns [] → graceful degradation
      await thenResultIsSuccess(result);
      await thenSearchResultsAreEmpty(result);
    });

    it("accepts response without id field (lenient parsing)", async () => {
      await givenLmsWillReturnResponseWithoutIdField();

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
    });
  });

  describe("Rule 7: Source Detection from URL", () => {
    it("detects local source from file:// URL", async () => {
      await givenLmsHasTrackWithUrl("file:///music/test.flac");

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenTrackSourceIs(result, "local");
    });

    it("detects qobuz source from qobuz:// URL", async () => {
      await givenLmsHasTrackWithUrl("qobuz://track/123456");

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenTrackSourceIs(result, "qobuz");
    });

    it("detects tidal source from tidal:// URL", async () => {
      await givenLmsHasTrackWithUrl("tidal://track/789012");

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenTrackSourceIs(result, "tidal");
    });

    it("returns unknown source for unrecognized URL protocols", async () => {
      await givenLmsHasTrackWithUrl("http://stream.example.com/track.mp3");

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenTrackSourceIs(result, "unknown");
    });

    it("treats unknown source as valid state, not error", async () => {
      await givenLmsHasTrackWithUrl("spotify://track/abc123");

      const result = await whenSearchingForTracks("test");

      await thenResultIsSuccess(result);
      await thenTrackSourceIs(result, "unknown");
    });

    it("parses audioQuality for FLAC track with space-variant bitrate ('320 kb/s')", async () => {
      await givenLmsHasTrack({
        id: 2,
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "file:///music/breathe.flac",
        bitrate: "1411 kb/s",
        samplerate: "44100",
        type: "flc",
      });

      const result = await whenSearchingForTracks("Breathe");

      await thenResultIsSuccess(result);
      await thenTrackHasAudioQuality(result, {
        format: "FLAC",
        lossless: true,
      });
    });

    it("parses audioQuality for FLAC track with compact bitrate ('2731kb/s VBR')", async () => {
      await givenLmsHasTrack({
        id: 3,
        title: "Time",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "file:///music/time.flac",
        bitrate: "2731kb/s VBR",
        samplerate: "96000",
        type: "flc",
      });

      const result = await whenSearchingForTracks("Time");

      await thenResultIsSuccess(result);
      await thenTrackHasAudioQuality(result, {
        format: "FLAC",
        lossless: true,
      });
    });

    it("returns undefined audioQuality for streaming track without quality tags", async () => {
      await givenLmsHasTrack({
        id: 4,
        title: "Money",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "qobuz://tracks/money",
        // no bitrate, samplerate, type → quality unknown
      });

      const result = await whenSearchingForTracks("Money");

      await thenResultIsSuccess(result);
      await thenTrackHasNoAudioQuality(result);
    });
  });

  describe("Integration: play() function", () => {
    it("sends correct play command to LMS", async () => {
      await givenLmsWillAcceptPlayCommand();

      const result = await whenPlayingTrack("file:///music/track.flac");

      await thenResultIsSuccess(result);
      await thenPlayCommandWasSentWithUrl("file:///music/track.flac");
    });

    it("validates empty track URL client-side", async () => {
      const result = await whenPlayingTrack("");

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "EmptyQueryError");
      await thenErrorMessageContains(result, "Track URL cannot be empty");
      await thenLmsWasNotCalled();
    });

    it("validates track URL length to prevent DoS", async () => {
      const longUrl = await givenVeryLongTrackUrl(3000);

      const result = await whenPlayingTrack(longUrl);

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
      await thenErrorMessageContains(result, "maximum length");
      await thenLmsWasNotCalled();
    });

    it("returns NetworkError on connection failure", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenPlayingTrack("file:///music/track.flac");

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
    });

    it("returns LmsApiError when LMS rejects play command", async () => {
      await givenLmsWillReturnApiError(-32600, "Track not found");

      const result = await whenPlayingTrack("file:///nonexistent.flac");

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "LmsApiError");
    });
  });

  describe("Integration: pause() function", () => {
    it("sends correct pause command to LMS", async () => {
      await givenLmsWillAcceptPauseCommand();

      const result = await whenPausingPlayback();

      await thenResultIsSuccess(result);
      await thenPauseCommandWasSent();
    });

    it("returns NetworkError on connection failure", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenPausingPlayback();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
    });

    it("returns LmsApiError when LMS rejects pause command", async () => {
      await givenLmsWillReturnApiError(-32600, "Player not ready");

      const result = await whenPausingPlayback();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "LmsApiError");
    });
  });

  describe("Integration: getStatus() function", () => {
    it("returns player status with current track", async () => {
      await givenLmsPlayerIsPlaying({
        mode: "play",
        time: 145.3,
        duration: 243.5,
        volume: 65,
        track: {
          id: 7785, // LMS returns numeric IDs (verified against real LMS)
          title: "Breathe",
          artist: "Pink Floyd",
          album: "Dark Side of the Moon",
          url: "file:///music/breathe.flac",
        },
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      await thenPlayerModeIs(result, "play");
      await thenPlayerTimeIs(result, 145.3);
      await thenPlayerVolumeIs(result, 65);
      await thenCurrentTrackIs(result, { title: "Breathe", source: "local" });
    });

    it("handles track without artist/album (tags not returned by LMS)", async () => {
      await givenLmsPlayerIsPlaying({
        mode: "play",
        time: 10,
        duration: 200,
        volume: 50,
        track: {
          id: 7785, // numeric ID as LMS actually returns
          title: "All die Jahre",
          // no artist, no album — LMS may omit these even with tags in some cases
          url: "file:///mnt/music/test.mp3",
        },
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      await thenCurrentTrackIs(result, {
        title: "All die Jahre",
        source: "local",
      });
    });

    it("returns currentTrack=null when no track is playing", async () => {
      await givenLmsPlayerIsStopped();

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      await thenCurrentTrackIsNull(result);
    });

    it("normalizes unknown player modes to 'stop' (fail-safe)", async () => {
      await givenLmsPlayerHasUnknownMode("buffering");

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      await thenPlayerModeIs(result, "stop");
    });

    it("returns NetworkError on connection failure", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenGettingPlayerStatus();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
    });

    it("returns LmsApiError when LMS rejects status query", async () => {
      await givenLmsWillReturnApiError(-32600, "Player not found");

      const result = await whenGettingPlayerStatus();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "LmsApiError");
    });

    // Story 8.7 fix AC3: audioQuality inferred from Tidal URL extension in status polling
    it("returns audioQuality FLAC for current Tidal track with .flc URL", async () => {
      await givenLmsPlayerIsPlaying({
        mode: "play",
        time: 30,
        duration: 300,
        volume: 65,
        track: { id: 1, title: "Kind of Blue", url: "tidal://394715089.flc" },
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      expect(result.ok && result.value.currentTrack?.audioQuality?.format).toBe(
        "FLAC",
      );
      expect(
        result.ok && result.value.currentTrack?.audioQuality?.lossless,
      ).toBe(true);
      expect(
        result.ok && result.value.currentTrack?.audioQuality?.bitrate,
      ).toBe(1411000);
    });

    it("returns audioQuality AAC for current Tidal track with .m4a URL", async () => {
      await givenLmsPlayerIsPlaying({
        mode: "play",
        time: 30,
        duration: 300,
        volume: 65,
        track: { id: 2, title: "Blue in Green", url: "tidal://394715090.m4a" },
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      expect(result.ok && result.value.currentTrack?.audioQuality?.format).toBe(
        "AAC",
      );
      expect(
        result.ok && result.value.currentTrack?.audioQuality?.lossless,
      ).toBe(false);
    });

    it("prefers artwork_url for current track cover art when LMS provides it", async () => {
      const mockResponse = {
        result: {
          mode: "play",
          time: 30,
          duration: 300,
          "mixer volume": 65,
          playlist_loop: [
            {
              id: "-94197023329720",
              title: "Israel",
              artist: "Bill Evans",
              album: "Explorations [Original Jazz Classics Remasters]",
              url: "tidal://6973569.flc",
              artwork_url:
                "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F6b02e2a4%2F3d2f%2F4902%2F97cc%2F3b4fb04c0dc7%2F1280x1280.jpg/image.jpg",
            },
          ],
        },
        id: 1,
        error: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      expect(result.ok && result.value.currentTrack?.coverArtUrl).toBe(
        "http://localhost:9000/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F6b02e2a4%2F3d2f%2F4902%2F97cc%2F3b4fb04c0dc7%2F1280x1280.jpg/image.jpg",
      );
    });

    it("coerces string time, duration, and volume values from LMS status payload", async () => {
      const mockResponse = {
        result: {
          mode: "play",
          time: "6.2770049571991",
          duration: "371.333",
          "mixer volume": "50",
          playlist_loop: [
            {
              id: 7785,
              title: "Israel",
              artist: "Bill Evans",
              album: "Explorations [Original Jazz Classics Remasters]",
              url: "tidal://6973569.flc",
            },
          ],
        },
        id: 1,
        error: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await whenGettingPlayerStatus();

      await thenResultIsSuccess(result);
      await thenPlayerTimeIs(result, 6.2770049571991);
      await thenPlayerVolumeIs(result, 50);
      expect(result.ok && result.value.duration).toBe(371.333);
    });
  });

  describe("Integration: nextTrack() function", () => {
    it("sends correct next track command to LMS", async () => {
      await givenLmsWillAcceptNextTrackCommand();

      const result = await whenSkippingToNextTrack();

      await thenResultIsSuccess(result);
      await thenNextTrackCommandWasSent();
    });

    it("returns NetworkError on connection failure", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenSkippingToNextTrack();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
    });

    it("returns LmsApiError when LMS rejects next command", async () => {
      await givenLmsWillReturnApiError(-32600, "No next track available");

      const result = await whenSkippingToNextTrack();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "LmsApiError");
    });
  });

  describe("Integration: previousTrack() function", () => {
    it("sends correct previous track command to LMS", async () => {
      await givenLmsWillAcceptPreviousTrackCommand();

      const result = await whenSkippingToPreviousTrack();

      await thenResultIsSuccess(result);
      await thenPreviousTrackCommandWasSent();
    });

    it("returns NetworkError on connection failure", async () => {
      await givenLmsConnectionWillFail("ECONNREFUSED");

      const result = await whenSkippingToPreviousTrack();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "NetworkError");
    });

    it("returns LmsApiError when LMS rejects previous command", async () => {
      await givenLmsWillReturnApiError(-32600, "No previous track available");

      const result = await whenSkippingToPreviousTrack();

      await thenResultIsError(result);
      await thenErrorTypeIs(result, "LmsApiError");
    });
  });

  describe("Rule 8: Parallel Tidal Search (Story 7.7)", () => {
    // Helper: mock first call (titles/local) and second call (tidal) separately
    const givenLocalReturnsTrack = (track: {
      readonly id: number;
      readonly title: string;
      readonly artist: string;
      readonly album: string;
      readonly url: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { titles_loop: [track], count: 1 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenLocalReturnsEmpty = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { titles_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalReturnsTrack = (track: {
      readonly name: string;
      readonly url: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              {
                id: `7_test_test.4.0`,
                name: track.name,
                url: track.url,
                isaudio: 1,
                type: "audio",
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalReturnsEmpty = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { loop_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalThrowsNetworkError = (): void => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    };

    const givenTidalReturnsApiError = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: null,
          id: 1,
          error: { code: -32600, message: "Plugin error" },
        }),
      });
    };

    const givenTidalNeverResponds = (): void => {
      fetchMock.mockImplementationOnce(
        () =>
          new Promise(() => {
            /* intentionally never resolves */
          }),
      );
    };

    // Story 7.9: tidal_info enrichment fires after Tidal search (3rd fetch call).
    // Tests that return Tidal tracks must set up this mock to avoid silent mock starvation.
    const givenTidalInfoReturns = (info: {
      readonly artist: string;
      readonly album: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              { id: "0", name: "Zu TIDAL Favoriten hinzufügen", type: "link" },
              {
                id: "1",
                name: "Zu TIDAL Wiedergabeliste hinzufügen",
                type: "link",
              },
              { id: "2", name: `Album: ${info.album}`, type: "link" },
              { id: "3", name: `Interpret: ${info.artist}`, type: "link" },
            ],
            count: 4,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalInfoFails = (): void => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    };

    it("AC1: includes Tidal tracks in results when tidal plugin returns audio items", async () => {
      givenLocalReturnsEmpty();
      givenTidalReturnsTrack({ name: "Creep", url: "tidal://58990486.flc" });
      givenTidalInfoReturns({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.title).toBe("Creep");
        expect(result.value[0]?.source).toBe("tidal");
        expect(result.value[0]?.url).toBe("tidal://58990486.flc");
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[0]?.album).toBe("Pablo Honey");
      }
    });

    it("AC1: combines local and Tidal tracks with local results first", async () => {
      givenLocalReturnsTrack({
        id: 42,
        title: "Karma Police (local)",
        artist: "Radiohead",
        album: "OK Computer",
        url: "file:///music/karma.flac",
      });
      givenTidalReturnsTrack({
        name: "Karma Police",
        url: "tidal://58990516.flc",
      });
      givenTidalInfoReturns({ artist: "Radiohead", album: "OK Computer" });

      const result = await whenSearchingForTracks("radiohead");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.source).toBe("local");
        expect(result.value[1]?.source).toBe("tidal");
      }
    });

    it("AC4a: returns only local results when Tidal fetch throws (graceful degradation)", async () => {
      givenLocalReturnsTrack({
        id: 8,
        title: "No Surprises",
        artist: "Radiohead",
        album: "OK Computer",
        url: "file:///music/no-surprises.flac",
      });
      givenTidalThrowsNetworkError();

      const result = await whenSearchingForTracks("radiohead");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("local");
      }
    });

    it("AC4b: returns only local results when Tidal command returns LMS error (graceful degradation)", async () => {
      givenLocalReturnsTrack({
        id: 9,
        title: "Fake Plastic Trees",
        artist: "Radiohead",
        album: "The Bends",
        url: "file:///music/fake-plastic-trees.flac",
      });
      givenTidalReturnsApiError();

      const result = await whenSearchingForTracks("radiohead");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("local");
      }
    });

    it("AC5: returns empty artist/album and no audioQuality when tidal_info enrichment fails (graceful degradation)", async () => {
      // Story 7.9: tidal_info enrichment normally populates artist/album/audioQuality.
      // When tidal_info fails, track is returned unchanged (empty artist/album, no audioQuality).
      givenLocalReturnsEmpty();
      givenTidalReturnsTrack({
        name: "High and Dry",
        url: "tidal://58990500.flc",
      });
      givenTidalInfoFails(); // explicit degradation — tidal_info fails

      const result = await whenSearchingForTracks("radiohead");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value[0]?.audioQuality).toBeUndefined();
        expect(result.value[0]?.artist).toBe("");
        expect(result.value[0]?.album).toBe("");
      }
    });

    it("AC6/Task3: returns only local results when Tidal exceeds 250ms timeout", async () => {
      givenLocalReturnsTrack({
        id: 10,
        title: "Paranoid Android",
        artist: "Radiohead",
        album: "OK Computer",
        url: "file:///music/paranoid.flac",
      });
      givenTidalNeverResponds();

      const resultPromise = whenSearchingForTracks("radiohead");
      // Advance fake timers past the 250ms Tidal timeout
      vi.advanceTimersByTime(250);
      await Promise.resolve(); // flush microtask queue
      const result = await resultPromise;

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("local");
      }
    });

    it("AC6/parallel: makes exactly 2 fetch calls — titles (local) and tidal .4 tracks", async () => {
      givenLocalReturnsEmpty();
      givenTidalReturnsEmpty();

      await whenSearchingForTracks("test");

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const firstCallBody = getJsonRpcRequestBodyAt(0);
      const secondCallBody = getJsonRpcRequestBodyAt(1);
      expect(firstCallBody.params[1][0]).toBe("titles");
      expect(secondCallBody.params[1][0]).toBe("tidal");
    });

    it("uses correct tidal item_id pattern for search navigation", async () => {
      givenLocalReturnsEmpty();
      givenTidalReturnsEmpty();

      await whenSearchingForTracks("radiohead");

      const secondCallBody = getJsonRpcRequestBodyAt(1);
      const command = secondCallBody.params[1];
      expect(command[4]).toBe("item_id:7_radiohead.4");
      expect(command[5]).toBe("search:radiohead");
      expect(command[6]).toBe("want_url:1");
    });

    it("M2: multi-word queries send spaces as-is in item_id (live LMS behavior unverified for multi-word)", async () => {
      // Tidal item_id uses the raw trimmedQuery including spaces.
      // e.g. query "pink floyd" → item_id:7_pink floyd.4
      // LMS JSON-RPC delivers the full string element; whether the Tidal plugin
      // handles spaces in item_id correctly has not been verified against a live LMS.
      givenLocalReturnsEmpty();
      givenTidalReturnsEmpty();

      await whenSearchingForTracks("pink floyd");

      const secondCallBody = getJsonRpcRequestBodyAt(1);
      const command = secondCallBody.params[1];
      expect(command[4]).toBe("item_id:7_pink floyd.4");
      expect(command[5]).toBe("search:pink floyd");
    });

    it("AC3/graceful-degradation: Tidal track not deduplicated with local when tidal_info enrichment fails", async () => {
      // Story 7.9: enrichTidalTracks() is always called via tidal_info. When tidal_info fails for a
      // Tidal track, that track keeps empty artist/album. normalizeDeduplicationKey() falls
      // back to URL for empty artist+album — so a local "Creep" (key: "radiohead::pablo honey::creep")
      // and an unenriched Tidal "Creep" (key: "tidal://58990486.flc") are not merged.
      // Both appear in client.search() output (graceful degradation).
      givenLocalReturnsTrack({
        id: 42,
        title: "Creep",
        artist: "Radiohead",
        album: "Pablo Honey",
        url: "file:///music/creep.flac",
      });
      givenTidalReturnsTrack({ name: "Creep", url: "tidal://58990486.flc" });
      // Explicitly fail songinfo enrichment — Tidal track keeps empty artist/album (AC6)
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await whenSearchingForTracks("creep");

      await thenResultIsSuccess(result);
      if (result.ok) {
        // Both tracks returned — dedup cannot merge them without artist/album on Tidal
        expect(result.value).toHaveLength(2);
        const sources = result.value.map((t) => t.source);
        expect(sources).toContain("local");
        expect(sources).toContain("tidal");
      }
    });
  });

  describe("Rule 12: Tidal Metadata Enrichment (Story 7.8 → updated Story 7.9)", () => {
    // Story 7.9: Enrichment approach changed from songinfo to tidal_info.
    // These tests are updated to reflect the tidal_info response format.
    const givenLocalEmpty = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { titles_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalReturnsTracks = (
      tracks: ReadonlyArray<{ readonly name: string; readonly url: string }>,
    ): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: tracks.map((t, i) => ({
              id: `7_test_test.4.${i}`,
              name: t.name,
              url: t.url,
              isaudio: 1,
              type: "audio",
            })),
            count: tracks.length,
          },
          id: 1,
          error: null,
        }),
      });
    };

    // tidal_info response (live probe 2026-03-14): loop_loop[2] = Album, loop_loop[3] = Artist
    const givenTidalInfoReturns12 = (info: {
      readonly artist: string;
      readonly album: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              { id: "0", name: "Zu TIDAL Favoriten hinzufügen", type: "link" },
              {
                id: "1",
                name: "Zu TIDAL Wiedergabeliste hinzufügen",
                type: "link",
              },
              { id: "2", name: `Album: ${info.album}`, type: "link" },
              { id: "3", name: `Interpret: ${info.artist}`, type: "link" },
              { id: "4", name: "Titelmix", type: "playlist" },
              { id: "5", name: "Dauer: 3:59", type: "text" },
              {
                id: "6",
                name: "URL: http://www.tidal.com/track/58990486",
                type: "text",
              },
            ],
            count: 7,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalInfoFails = (): void => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    };

    it("AC1: enriches Tidal track artist and album via tidal_info (Story 7.9: works for fresh tracks)", async () => {
      givenLocalEmpty();
      givenTidalReturnsTracks([{ name: "Creep", url: "tidal://58990486.flc" }]);
      givenTidalInfoReturns12({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[0]?.album).toBe("Pablo Honey");
        expect(result.value[0]?.source).toBe("tidal");
      }
    });

    it("AC4: populates audioQuality from URL extension (.flc → FLAC lossless) for Tidal track", async () => {
      givenLocalEmpty();
      givenTidalReturnsTracks([{ name: "Creep", url: "tidal://58990486.flc" }]);
      givenTidalInfoReturns12({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.audioQuality).toBeDefined();
        expect(result.value[0]?.audioQuality?.format).toBe("FLAC");
        expect(result.value[0]?.audioQuality?.lossless).toBe(true);
      }
    });

    it("AC5: enriches N Tidal tracks in parallel — makes exactly N+2 fetch calls total", async () => {
      // N+2 = 1 local + 1 tidal(.4) + N tidal_info
      givenLocalEmpty();
      givenTidalReturnsTracks([
        { name: "Creep", url: "tidal://58990486.flc" },
        { name: "Karma Police", url: "tidal://58990516.flc" },
      ]);
      givenTidalInfoReturns12({ artist: "Radiohead", album: "Pablo Honey" });
      givenTidalInfoReturns12({ artist: "Radiohead", album: "OK Computer" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        // 1 local + 1 tidal(.4) + 2 tidal_info = 4 total fetch calls (N+2 pattern)
        expect(globalThis.fetch).toHaveBeenCalledTimes(4);
        // Each tidal_info call uses the correct per-track ID (proves separate calls, not batched)
        // calls[0]=local, calls[1]=tidal.4, calls[2]=tidal_info-1, calls[3]=tidal_info-2
        const tidalInfoBody1 = getJsonRpcRequestBodyAt(2);
        const tidalInfoBody2 = getJsonRpcRequestBodyAt(3);
        expect(tidalInfoBody1.params[1][0]).toBe("tidal_info");
        expect(tidalInfoBody1.params[1][4]).toBe("id:58990486");
        expect(tidalInfoBody2.params[1][4]).toBe("id:58990516");
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[1]?.artist).toBe("Radiohead");
      }
    });

    it("AC5-timeout: returns original track when tidal_info exceeds 500ms enrichment cap", async () => {
      givenLocalEmpty();
      givenTidalReturnsTracks([{ name: "Creep", url: "tidal://58990486.flc" }]);
      // tidal_info aborts when signal fires — simulates slow LMS that respects abort
      fetchMock.mockImplementationOnce(
        (_url: unknown, options: { readonly signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted", "AbortError"),
                );
              });
            }
          }),
      );

      const resultPromise = whenSearchingForTracks("radiohead");
      // Advance past enrichment cap (500ms) — timer fires, enrichController aborts, original track returned
      // vi.advanceTimersByTimeAsync flushes pending promises between timer ticks (Vitest 4.x)
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("tidal");
        // Enrichment timed out — original empty strings preserved (graceful degradation)
        expect(result.value[0]?.artist).toBe("");
        expect(result.value[0]?.album).toBe("");
      }
    });

    it("AC6: Tidal track still returned with empty strings when tidal_info enrichment fails", async () => {
      givenLocalEmpty();
      givenTidalReturnsTracks([{ name: "Creep", url: "tidal://58990486.flc" }]);
      givenTidalInfoFails();

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("tidal");
        expect(result.value[0]?.artist).toBe("");
        expect(result.value[0]?.album).toBe("");
      }
    });
  });

  describe("Rule 13: Tidal Metadata via tidal_info — Direct LMS Plugin (Story 7.9)", () => {
    const givenLocalEmpty13 = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { titles_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalReturnsTracks13 = (
      tracks: ReadonlyArray<{ readonly name: string; readonly url: string }>,
    ): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: tracks.map((t, i) => ({
              id: `7_test_test.4.${i}`,
              name: t.name,
              url: t.url,
              isaudio: 1,
              type: "audio",
            })),
            count: tracks.length,
          },
          id: 1,
          error: null,
        }),
      });
    };

    // tidal_info response shape (from live probe 2026-03-14):
    // loop_loop[2].name = "Album: {album}", loop_loop[3].name = "Interpret: {artist}"
    const givenTidalInfoReturns = (info: {
      readonly artist: string;
      readonly album: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            title: `${info.artist}`,
            loop_loop: [
              {
                id: "0",
                name: "Zu TIDAL Favoriten hinzufügen",
                type: "link",
                isaudio: 0,
                hasitems: 1,
              },
              {
                id: "1",
                name: "Zu TIDAL Wiedergabeliste hinzufügen",
                type: "link",
                isaudio: 0,
                hasitems: 1,
              },
              {
                id: "2",
                name: `Album: ${info.album}`,
                type: "link",
                isaudio: 0,
                hasitems: 1,
              },
              {
                id: "3",
                name: `Interpret: ${info.artist}`,
                type: "link",
                isaudio: 0,
                hasitems: 1,
              },
              {
                id: "4",
                name: "Titelmix",
                type: "playlist",
                isaudio: 1,
                hasitems: 1,
              },
              {
                id: "5",
                name: "Dauer: 3:59",
                type: "text",
                isaudio: 0,
                hasitems: 0,
              },
              {
                id: "6",
                name: "URL: http://www.tidal.com/track/58990486",
                type: "text",
                isaudio: 0,
                hasitems: 0,
              },
            ],
            count: 7,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalInfoFails13 = (): void => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    };

    it("AC1: fresh Tidal track gets artist and album from tidal_info even when never played before", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
      ]);
      givenTidalInfoReturns({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[0]?.album).toBe("Pablo Honey");
        expect(result.value[0]?.source).toBe("tidal");
      }
    });

    it("AC3: audioQuality inferred from Tidal URL extension (.flc → FLAC lossless)", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
      ]);
      givenTidalInfoReturns({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.audioQuality).toBeDefined();
        expect(result.value[0]?.audioQuality?.format).toBe("FLAC");
        expect(result.value[0]?.audioQuality?.lossless).toBe(true);
        expect(result.value[0]?.audioQuality?.bitrate).toBe(1411000);
        expect(result.value[0]?.audioQuality?.sampleRate).toBe(44100);
      }
    });

    it("AC3: audioQuality inferred from Tidal URL extension (.m4a → AAC lossy)", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Something", url: "tidal://99001122.m4a" },
      ]);
      givenTidalInfoReturns({ artist: "Beatles", album: "Abbey Road" });

      const result = await whenSearchingForTracks("beatles");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.audioQuality).toBeDefined();
        expect(result.value[0]?.audioQuality?.format).toBe("AAC");
        expect(result.value[0]?.audioQuality?.lossless).toBe(false);
        expect(result.value[0]?.audioQuality?.bitrate).toBe(320000);
        expect(result.value[0]?.audioQuality?.sampleRate).toBe(44100);
      }
    });

    it("AC4: graceful degradation when tidal_info fails — Tidal track still returned with empty strings", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
      ]);
      givenTidalInfoFails13();

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("tidal");
        expect(result.value[0]?.artist).toBe("");
        expect(result.value[0]?.album).toBe("");
      }
    });

    it("AC5: enriches N Tidal tracks in parallel — makes N tidal_info calls (N+2 total fetch calls)", async () => {
      // N+2 = 1 local + 1 tidal(.4) + N tidal_info
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
        { name: "Karma Police", url: "tidal://58990516.flc" },
      ]);
      givenTidalInfoReturns({ artist: "Radiohead", album: "Pablo Honey" });
      givenTidalInfoReturns({ artist: "Radiohead", album: "OK Computer" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        // 1 local + 1 tidal(.4) + 2 tidal_info = 4 total fetch calls (N+2 pattern)
        expect(globalThis.fetch).toHaveBeenCalledTimes(4);
        // calls[0]=local, calls[1]=tidal.4, calls[2]=tidal_info-1, calls[3]=tidal_info-2
        const tidalInfoBody1 = getJsonRpcRequestBodyAt(2);
        const tidalInfoBody2 = getJsonRpcRequestBodyAt(3);
        expect(tidalInfoBody1.params[1][0]).toBe("tidal_info");
        expect(tidalInfoBody1.params[1][4]).toBe("id:58990486");
        expect(tidalInfoBody2.params[1][4]).toBe("id:58990516");
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[1]?.artist).toBe("Radiohead");
      }
    });

    it("AC5-timeout: returns original track when tidal_info exceeds 500ms enrichment cap", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
      ]);
      // tidal_info call hangs and respects abort signal
      fetchMock.mockImplementationOnce(
        (_url: unknown, options: { readonly signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted", "AbortError"),
                );
              });
            }
          }),
      );

      const resultPromise = whenSearchingForTracks("radiohead");
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("tidal");
        expect(result.value[0]?.artist).toBe("");
        expect(result.value[0]?.album).toBe("");
      }
    });

    it("AC6: enrichment uses LMS Tidal plugin — tidal_info command sent (no OAuth token config)", async () => {
      givenLocalEmpty13();
      givenTidalReturnsTracks13([
        { name: "Creep", url: "tidal://58990486.flc" },
      ]);
      givenTidalInfoReturns({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.artist).toBe("Radiohead");
        // Verify the enrichment call used tidal_info command (not songinfo)
        // calls[0]=local, calls[1]=tidal.4, calls[2]=tidal_info
        const enrichBody = getJsonRpcRequestBodyAt(2);
        expect(enrichBody.params[1][0]).toBe("tidal_info");
        expect(enrichBody.params[1][4]).toBe("id:58990486");
      }
    });
  });

  // =============================================================================
  // Story 9.8: Cover Art URL from track id (item.id)
  // Root cause (2026-03-18 live probe): /music/{album_id}/cover.jpg is WRONG — LMS always
  // interprets the path segment as a TRACK ID, not album ID. /music/177/cover.jpg returns
  // cover of track 177 (random song), not album 177.
  // Correct: /music/{item.id}/cover.jpg — track's decimal DB ID, always present, always correct.
  // Same as getAlbumDetail (firstTrack.id) and getPlayerStatus (currentTrackData.id).
  // =============================================================================

  describe("Rule 14 (Story 9.8): Cover Art URL from track id (item.id)", () => {
    it("AC1: includes 'e' tag in titles search command (needed for album grouping, not cover art)", async () => {
      await givenLmsWillReturnEmptySearchResults();

      await whenSearchingForTracks("Pink Floyd");

      const firstCallBody = getJsonRpcRequestBodyAt(0);
      const command = firstCallBody.params[1];
      // The tags parameter should contain 'e' (album_id) for album grouping in service layer
      expect(command[4]).toContain("e");
    });

    it("AC1: populates coverArtUrl using track id (item.id), not album_id", async () => {
      // Regression guard: album_id (177) must NOT appear in coverArtUrl path — /music/177/cover.jpg
      // would return cover of track 177 (wrong song). Only the track's own id is correct.
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            titles_loop: [
              {
                id: 2574, // track's decimal DB ID — must be used for cover art
                title: "Breathe",
                artist: "Pink Floyd",
                album: "Dark Side of the Moon",
                url: "file:///music/breathe.flac",
                album_id: "177", // album DB ID — must NOT appear in coverArtUrl path
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });

      const result = await whenSearchingForTracks("Breathe");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/music/2574/cover.jpg",
        );
        // Regression: album_id must NOT be in the URL path
        expect(result.value[0]?.coverArtUrl).not.toContain("/music/177/");
      }
    });

    it("AC1: coverArtUrl is always set — track id (item.id) is always present", async () => {
      // Previously, coverArtUrl was undefined when album_id was absent/zero.
      // Now it always uses item.id, which is always present in titles_loop.
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            titles_loop: [
              {
                id: 3001,
                title: "Money",
                artist: "Pink Floyd",
                album: "Dark Side of the Moon",
                url: "file:///music/money.flac",
                // no album_id — irrelevant, track id always present
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });

      const result = await whenSearchingForTracks("Money");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/music/3001/cover.jpg",
        );
      }
    });

    it("AC1: coverArtUrl uses track id even when album_id is '0'", async () => {
      // album_id = "0" is LMS sentinel for no album — track id is still valid for cover art
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            titles_loop: [
              {
                id: 999,
                title: "Some Track",
                artist: "Artist",
                album: "Album",
                url: "file:///music/track.flac",
                album_id: "0",
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });

      const result = await whenSearchingForTracks("Some Track");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/music/999/cover.jpg",
        );
      }
    });

    it("AC1: coverArtUrl uses item.id even when both id and coverid are present", async () => {
      // coverid (c-tag, hex hash) was briefly used — must be ignored.
      // item.id (decimal track DB ID) is the only correct source.
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            titles_loop: [
              {
                id: 42,
                title: "Time",
                artist: "Pink Floyd",
                album: "Dark Side of the Moon",
                url: "file:///music/time.flac",
                album_id: "5",
                coverid: "aabbcc",
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });

      const result = await whenSearchingForTracks("Time");

      await thenResultIsSuccess(result);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/music/42/cover.jpg",
        );
      }
    });
  });

  // =============================================================================
  // HELPER FUNCTIONS - Test framework code isolated here
  // =============================================================================

  // GIVEN helpers - Setup preconditions
  // -----------------------------------------------------------------------------

  const givenLmsWillReturnEmptySearchResults = async (): Promise<void> => {
    const mockResponse = {
      result: { titles_loop: [], count: 0 },
      id: 1,
      error: null,
    };
    // Story 7.7: search() makes 2 fetch calls (titles + tidal) in parallel.
    // mockResolvedValue (not Once) covers both calls with the same response:
    //   - titles call: titles_loop=[] → searchLocal returns []
    //   - tidal call: loop_loop missing → searchTidal returns []
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillTimeoutAfter = async (ms: number): Promise<void> => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((resolve, reject) => {
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted", "AbortError"),
              );
            });
          }
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ result: {}, id: 1, error: null }),
              }),
            ms,
          );
        }),
    );
  };

  const givenLmsWillRespondAfter = async (
    ms: number,
    result: unknown,
  ): Promise<void> => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  result,
                  id: 1,
                  error: null,
                }),
              }),
            ms,
          );
        }),
    );
  };

  const givenLmsConnectionWillFail = async (error: string): Promise<void> => {
    fetchMock.mockRejectedValue(new Error(error));
  };

  const givenLmsWillReturnInvalidJson = async (): Promise<void> => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
  };

  const givenLmsWillReturnApiError = async (
    code: number,
    message: string,
  ): Promise<void> => {
    const mockResponse = {
      result: null,
      id: 1,
      error: { code, message },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillReturnResponseWithoutSearchLoop =
    async (): Promise<void> => {
      // No titles_loop field → client defaults to empty array → empty results
      const mockResponse = {
        result: { count: 0 },
        id: 1,
        error: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
    };

  const givenLmsWillReturnMalformedSearchLoop = async (
    invalidValue: unknown,
  ): Promise<void> => {
    const mockResponse = {
      result: { titles_loop: invalidValue, count: 0 },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsHasTrack = async (track: {
    readonly id: number; // titles-command returns numeric ids
    readonly title: string;
    readonly artist?: string;
    readonly album?: string;
    readonly url: string;
    readonly bitrate?: string;
    readonly samplerate?: string;
    readonly type?: string;
  }): Promise<void> => {
    const mockResponse = {
      result: {
        titles_loop: [track],
        count: 1,
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsHasTrackWithUrl = async (url: string): Promise<void> => {
    await givenLmsHasTrack({
      id: 1, // numeric
      title: "Test",
      artist: "Artist",
      album: "Album",
      url,
    });
  };

  const givenLmsWillReturnResponseWithBothResultAndError =
    async (): Promise<void> => {
      const mockResponse = {
        result: { some: "data" },
        id: 1,
        error: { code: -32600, message: "Invalid request" },
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
    };

  const givenLmsWillReturnResponseWithoutIdField = async (): Promise<void> => {
    const mockResponse = {
      result: { titles_loop: [], count: 0 },
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillAcceptPlayCommand = async (): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenVeryLongTrackUrl = async (length: number): Promise<string> => {
    return "file:///" + "a".repeat(length);
  };

  const givenLmsWillAcceptPauseCommand = async (): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsPlayerIsPlaying = async (status: {
    readonly mode: string;
    readonly time: number;
    readonly duration: number;
    readonly volume: number;
    readonly track: {
      readonly id: number | string; // LMS returns numeric IDs at runtime
      readonly title: string;
      readonly artist?: string; // only present with 'a' tag
      readonly album?: string; // only present with 'l' tag
      readonly url: string;
    };
  }): Promise<void> => {
    const mockResponse = {
      result: {
        mode: status.mode,
        time: status.time,
        duration: status.duration,
        "mixer volume": status.volume,
        playlist_loop: [status.track],
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsPlayerIsStopped = async (): Promise<void> => {
    const mockResponse = {
      result: {
        mode: "stop",
        time: 0,
        duration: 0,
        "mixer volume": 50,
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsPlayerHasUnknownMode = async (mode: string): Promise<void> => {
    const mockResponse = {
      result: {
        mode,
        time: 0,
        duration: 0,
        "mixer volume": 50,
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillAcceptNextTrackCommand = async (): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillAcceptPreviousTrackCommand = async (): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  // WHEN helpers - Execute actions
  // -----------------------------------------------------------------------------

  const whenSearchingForTracks = async (
    query: string,
  ): Promise<Result<readonly SearchResult[], LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.search(query);
  };

  const whenSearchingForTracksWithClient = async (
    query: string,
    playerId: string,
  ): Promise<Result<readonly SearchResult[], LmsError>> => {
    const client = createLmsClient({ ...defaultConfig, playerId });
    return await client.search(query);
  };

  const whenWaitingForTimeout = async (ms: number): Promise<void> => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  };

  const whenPlayingTrack = async (
    url: string,
  ): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.play(url);
  };

  const whenPausingPlayback = async (): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.pause();
  };

  const whenGettingPlayerStatus = async (): Promise<
    Result<PlayerStatus, LmsError>
  > => {
    const client = createLmsClient(defaultConfig);
    return await client.getStatus();
  };

  const whenSkippingToNextTrack = async (): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.nextTrack();
  };

  const whenSkippingToPreviousTrack = async (): Promise<
    Result<void, LmsError>
  > => {
    const client = createLmsClient(defaultConfig);
    return await client.previousTrack();
  };

  // THEN helpers - Verify outcomes
  // -----------------------------------------------------------------------------

  const thenResultIsSuccess = async <T>(
    result: Result<T, LmsError>,
  ): Promise<void> => {
    expect(result.ok).toBe(true);
  };

  const thenResultIsError = async <T>(
    result: Result<T, LmsError>,
  ): Promise<void> => {
    expect(result.ok).toBe(false);
  };

  const thenErrorTypeIs = async <T>(
    result: Result<T, LmsError>,
    expectedType: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.type).toBe(expectedType);
    }
  };

  const thenErrorMessageIs = async <T>(
    result: Result<T, LmsError>,
    expectedMessage: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.message).toBe(expectedMessage);
    }
  };

  const thenErrorMessageContains = async <T>(
    result: Result<T, LmsError>,
    substring: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.message).toContain(substring);
    }
  };

  const thenSearchResultsAreEmpty = async (
    result: Result<readonly SearchResult[], LmsError>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  };

  const thenSearchResultsContain = async (
    result: Result<readonly SearchResult[], LmsError>,
    expected: { readonly title: string },
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.title).toBe(expected.title);
    }
  };

  const thenTrackSourceIs = async (
    result: Result<readonly SearchResult[], LmsError>,
    expectedSource: "local" | "qobuz" | "tidal" | "unknown",
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value[0]?.source).toBe(expectedSource);
    }
  };

  const thenTrackHasAudioQuality = async (
    result: Result<readonly SearchResult[], LmsError>,
    expected: { readonly format: string; readonly lossless: boolean },
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value[0]?.audioQuality).toBeDefined();
      expect(result.value[0]?.audioQuality?.format).toBe(expected.format);
      expect(result.value[0]?.audioQuality?.lossless).toBe(expected.lossless);
    }
  };

  const thenTrackHasNoAudioQuality = async (
    result: Result<readonly SearchResult[], LmsError>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value[0]?.audioQuality).toBeUndefined();
    }
  };

  const thenLmsWasNotCalled = async (): Promise<void> => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
  };

  const thenJsonRpcRequestWasSentWithMethod = async (
    method: string,
  ): Promise<void> => {
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:9000/jsonrpc.js",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining(`"method":"${method}"`),
      }),
    );
  };

  const thenRequestContainsPlayerId = async (
    playerId: string,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[0]).toBe(playerId);
  };

  const thenRequestContainsCommand = async (command: string): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1][0]).toBe(command);
  };

  const thenRequestContainsQuery = async (query: string): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    // titles command: ["titles", 0, 999, "search:X", "tags:..."] → query at index 3
    expect(body.params[1][3]).toContain(query);
  };

  const thenSearchDoesNotThrowException = async (
    query: string,
  ): Promise<void> => {
    const client = createLmsClient(defaultConfig);
    await expect(client.search(query)).resolves.toBeDefined();
  };

  const thenPlayCommandWasSentWithUrl = async (url: string): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["playlist", "play", url]);
  };

  const thenPauseCommandWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["pause", "1"]);
  };

  const thenPlayerModeIs = async (
    result: Result<PlayerStatus, LmsError>,
    expectedMode: "play" | "pause" | "stop",
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.mode).toBe(expectedMode);
    }
  };

  const thenPlayerTimeIs = async (
    result: Result<PlayerStatus, LmsError>,
    expectedTime: number,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.time).toBe(expectedTime);
    }
  };

  const thenPlayerVolumeIs = async (
    result: Result<PlayerStatus, LmsError>,
    expectedVolume: number,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.volume).toBe(expectedVolume);
    }
  };

  const thenCurrentTrackIs = async (
    result: Result<PlayerStatus, LmsError>,
    expected: {
      readonly title: string;
      readonly source: "local" | "qobuz" | "tidal" | "unknown";
    },
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.currentTrack).not.toBeNull();
      expect(result.value.currentTrack?.title).toBe(expected.title);
      expect(result.value.currentTrack?.source).toBe(expected.source);
    }
  };

  const thenCurrentTrackIsNull = async (
    result: Result<PlayerStatus, LmsError>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.currentTrack).toBeNull();
    }
  };

  const thenNextTrackCommandWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["playlist", "index", "+1"]);
  };

  const thenPreviousTrackCommandWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["playlist", "index", "-1"]);
  };

  // New helpers for Volume Control (Story 2.8)
  const givenLmsWillAcceptVolumeChange = async (
    newVolume: number,
  ): Promise<void> => {
    const mockResponse = {
      result: {
        _volume: newVolume,
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillReturnCurrentVolume = async (
    volume: number,
  ): Promise<void> => {
    const mockResponse = {
      result: {
        _volume: String(volume), // LMS returns _volume as string (verified against real LMS)
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const whenSettingVolume = async (
    level: number,
  ): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.setVolume(level);
  };

  const whenGettingVolume = async (): Promise<Result<number, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.getVolume();
  };

  const thenVolumeCommandWasSentWithLevel = async (
    level: number,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["mixer", "volume", level]);
  };

  const thenVolumeQueryCommandWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["mixer", "volume", "?"]);
  };

  const thenVolumeIs = async (
    result: Result<number, LmsError>,
    expectedVolume: number,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value).toBe(expectedVolume);
    }
  };

  // Seek and Time helpers (Story 2.9)
  const givenLmsWillAcceptSeekCommand = async (
    _position: number,
  ): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const givenLmsWillReturnCurrentTime = async (
    time: number,
    duration: number,
  ): Promise<void> => {
    const mockResponse = {
      result: {
        mode: "play",
        time,
        duration,
        "mixer volume": 50,
      },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  const whenSeekingToPosition = async (
    seconds: number,
  ): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.seek(seconds);
  };

  const whenGettingCurrentTime = async (): Promise<
    Result<number, LmsError>
  > => {
    const client = createLmsClient(defaultConfig);
    return await client.getCurrentTime();
  };

  const thenSeekCommandWasSentWithPosition = async (
    position: number,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["time", position]);
  };

  const thenCurrentTimeQueryWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1][0]).toBe("status");
  };

  const thenCurrentTimeIs = async (
    result: Result<number, LmsError>,
    expectedTime: number,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value).toBe(expectedTime);
    }
  };

  // Seek and Time Tests (Story 2.9)
  describe("Seek and Current Time", () => {
    describe("seek", () => {
      it("seeks to specific position in seconds", async () => {
        await givenLmsWillAcceptSeekCommand(165);

        const result = await whenSeekingToPosition(165);

        await thenResultIsSuccess(result);
        await thenSeekCommandWasSentWithPosition(165);
      });

      it("accepts seek to beginning (0 seconds)", async () => {
        await givenLmsWillAcceptSeekCommand(0);

        const result = await whenSeekingToPosition(0);

        await thenResultIsSuccess(result);
        await thenSeekCommandWasSentWithPosition(0);
      });

      it("rejects negative seek position", async () => {
        const result = await whenSeekingToPosition(-5);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "ValidationError");
        await thenErrorMessageIs(result, "Seek position must be >= 0");
        await thenLmsWasNotCalled();
      });

      it("handles LMS connection error", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenSeekingToPosition(100);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("handles LMS API error", async () => {
        await givenLmsWillReturnApiError(-32600, "Invalid seek position");

        const result = await whenSeekingToPosition(999999);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "LmsApiError");
      });
    });

    describe("getCurrentTime", () => {
      it("returns current playback time in seconds", async () => {
        await givenLmsWillReturnCurrentTime(145.3, 272.5);

        const result = await whenGettingCurrentTime();

        await thenResultIsSuccess(result);
        await thenCurrentTimeIs(result, 145);
        await thenCurrentTimeQueryWasSent();
      });

      it("returns 0 when no track is playing", async () => {
        await givenLmsPlayerIsStopped();

        const result = await whenGettingCurrentTime();

        await thenResultIsSuccess(result);
        await thenCurrentTimeIs(result, 0);
      });

      it("rounds float seconds to integer", async () => {
        await givenLmsWillReturnCurrentTime(127.89, 200.0);

        const result = await whenGettingCurrentTime();

        await thenResultIsSuccess(result);
        await thenCurrentTimeIs(result, 127);
      });

      it("handles missing time field in response", async () => {
        const mockResponse = {
          result: {
            mode: "stop",
            duration: 0,
            "mixer volume": 50,
          },
          id: 1,
          error: null,
        };
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await whenGettingCurrentTime();

        await thenResultIsSuccess(result);
        await thenCurrentTimeIs(result, 0);
      });

      it("handles LMS connection error", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenGettingCurrentTime();

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });
    });
  });

  // Volume Control Tests (Story 2.8)
  describe("Volume Control", () => {
    describe("setVolume", () => {
      it("sets volume to specific level (0-100)", async () => {
        await givenLmsWillAcceptVolumeChange(65);

        const result = await whenSettingVolume(65);

        await thenResultIsSuccess(result);
        await thenVolumeCommandWasSentWithLevel(65);
      });

      it("accepts minimum volume (0)", async () => {
        await givenLmsWillAcceptVolumeChange(0);

        const result = await whenSettingVolume(0);

        await thenResultIsSuccess(result);
        await thenVolumeCommandWasSentWithLevel(0);
      });

      it("accepts maximum volume (100)", async () => {
        await givenLmsWillAcceptVolumeChange(100);

        const result = await whenSettingVolume(100);

        await thenResultIsSuccess(result);
        await thenVolumeCommandWasSentWithLevel(100);
      });

      it("rejects volume below 0", async () => {
        const result = await whenSettingVolume(-1);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "ValidationError");
        await thenErrorMessageIs(result, "Volume must be between 0 and 100");
        await thenLmsWasNotCalled();
      });

      it("rejects volume above 100", async () => {
        const result = await whenSettingVolume(101);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "ValidationError");
        await thenErrorMessageIs(result, "Volume must be between 0 and 100");
        await thenLmsWasNotCalled();
      });

      it("handles LMS connection error", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenSettingVolume(50);

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });
    });

    describe("getVolume", () => {
      it("queries current volume level", async () => {
        await givenLmsWillReturnCurrentVolume(73);

        const result = await whenGettingVolume();

        await thenResultIsSuccess(result);
        await thenVolumeIs(result, 73);
        await thenVolumeQueryCommandWasSent();
      });

      it("returns 0 when volume is muted", async () => {
        await givenLmsWillReturnCurrentVolume(0);

        const result = await whenGettingVolume();

        await thenResultIsSuccess(result);
        await thenVolumeIs(result, 0);
      });

      it("handles missing _volume field in response", async () => {
        const mockResponse = {
          result: {},
          id: 1,
          error: null,
        };
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await whenGettingVolume();

        await thenResultIsSuccess(result);
        await thenVolumeIs(result, 0); // Default to 0 if missing
      });

      it("handles LMS connection error", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenGettingVolume();

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });
    });
  });

  // Rule 8: Album Playback (Gapless) — Story 3.5
  describe("Rule 8: Album Playback (Gapless)", () => {
    describe("playAlbum()", () => {
      it("sends playlistcontrol cmd:load with album_id", async () => {
        await givenLmsWillAcceptAlbumCommand();

        const result = await whenPlayingAlbum("42");

        await thenResultIsSuccess(result);
        await thenPlaylistControlCommandWasSentWithAlbumId("42");
      });

      it("returns EmptyQueryError for empty album ID without calling LMS", async () => {
        const result = await whenPlayingAlbum("");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "EmptyQueryError");
        await thenLmsWasNotCalled();
      });

      it("trims whitespace from album ID before sending", async () => {
        await givenLmsWillAcceptAlbumCommand();

        await whenPlayingAlbum("  42  ");

        await thenPlaylistControlCommandWasSentWithAlbumId("42");
      });

      it("returns NetworkError when LMS is unreachable", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenPlayingAlbum("42");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("returns LmsApiError when LMS rejects album command", async () => {
        await givenLmsWillReturnApiError(-32600, "Album not found");

        const result = await whenPlayingAlbum("42");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "LmsApiError");
      });
    });

    describe("disableRepeat()", () => {
      it("sends playlist repeat 0 command to LMS", async () => {
        await givenLmsWillAcceptAlbumCommand();

        const result = await whenDisablingRepeat();

        await thenResultIsSuccess(result);
        await thenDisableRepeatCommandWasSent();
      });

      it("returns NetworkError when LMS is unreachable", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenDisablingRepeat();

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("returns LmsApiError when LMS rejects repeat command", async () => {
        await givenLmsWillReturnApiError(-32600, "Player not available");

        const result = await whenDisablingRepeat();

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "LmsApiError");
      });
    });

    // Story 8.7: playTidalAlbum — fetch tracks, clear, play, add
    describe("playTidalAlbum()", () => {
      it("fetches tracks via tidal items, clears queue, plays first track, adds rest", async () => {
        givenTidalAlbumTracksReturn([
          {
            id: "4.0.0",
            name: "Track 1",
            url: "tidal://111.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
          {
            id: "4.0.1",
            name: "Track 2",
            url: "tidal://222.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
        ]);
        givenLmsAcceptsPlaylistCommand(); // clear
        givenLmsAcceptsPlaylistCommand(); // play
        givenLmsAcceptsPlaylistCommand(); // add track 2

        const result = await whenPlayingTidalAlbum("4.0");

        await thenResultIsSuccess(result);
        await thenTidalItemsFetchWasSentWithItemId("4.0");
        await thenPlaylistPlayWasSentWithUrl("tidal://111.flc");
      });

      it("returns EmptyQueryError for empty album ID without calling LMS", async () => {
        const result = await whenPlayingTidalAlbum("");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "EmptyQueryError");
        await thenLmsWasNotCalled();
      });

      it("returns LmsApiError when album has no playable tracks", async () => {
        givenTidalAlbumTracksReturn([]);

        const result = await whenPlayingTidalAlbum("4.99");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "LmsApiError");
      });

      it("returns NetworkError when track fetch fails", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenPlayingTidalAlbum("4.0");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("returns NetworkError when playlist clear fails after fetching tracks", async () => {
        givenTidalAlbumTracksReturn([
          {
            id: "4.0.0",
            name: "Track 1",
            url: "tidal://111.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
        ]);
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

        const result = await whenPlayingTidalAlbum("4.0");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("returns NetworkError when playlist play (first track) fails after clear", async () => {
        givenTidalAlbumTracksReturn([
          {
            id: "4.0.0",
            name: "Track 1",
            url: "tidal://111.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
        ]);
        givenLmsAcceptsPlaylistCommand(); // clear succeeds
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

        const result = await whenPlayingTidalAlbum("4.0");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("returns error when a mid-queue playlist add fails (partial reduce failure)", async () => {
        givenTidalAlbumTracksReturn([
          {
            id: "4.0.0",
            name: "Track 1",
            url: "tidal://111.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
          {
            id: "4.0.1",
            name: "Track 2",
            url: "tidal://222.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
          {
            id: "4.0.2",
            name: "Track 3",
            url: "tidal://333.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
        ]);
        givenLmsAcceptsPlaylistCommand(); // clear succeeds
        givenLmsAcceptsPlaylistCommand(); // play track 1 succeeds
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED")); // add track 2 fails

        const result = await whenPlayingTidalAlbum("4.0");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("works for artist-browse album ID format '6.0.1.0'", async () => {
        givenTidalAlbumTracksReturn([
          {
            id: "6.0.1.0.0",
            name: "Track 1",
            url: "tidal://333.flc",
            isaudio: 1,
            type: "audio",
            hasitems: 0,
          },
        ]);
        givenLmsAcceptsPlaylistCommand(); // clear
        givenLmsAcceptsPlaylistCommand(); // play

        const result = await whenPlayingTidalAlbum("6.0.1.0");

        await thenResultIsSuccess(result);
        await thenTidalItemsFetchWasSentWithItemId("6.0.1.0");
      });
    });
  });

  // Rule 9: Album Track Listing — Story 4.3
  describe("Rule 9: Album Track Listing", () => {
    describe("getAlbumTracks()", () => {
      it("returns tracks sorted by track_num for valid album ID", async () => {
        await givenLmsWillReturnAlbumTracks([
          { id: 3, title: "Track 3", tracknum: "3", url: "file:///3.flac" },
          { id: 1, title: "Track 1", tracknum: "1", url: "file:///1.flac" },
          { id: 2, title: "Track 2", tracknum: "2", url: "file:///2.flac" },
        ]);

        const result = await whenGettingAlbumTracks("42");

        await thenResultIsSuccess(result);
        await thenAlbumTrackCountIs(result, 3);
        await thenAlbumTracksAreSortedByTrackNum(result);
      });

      it("returns EmptyQueryError for empty album ID without calling LMS", async () => {
        const result = await whenGettingAlbumTracks("");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "EmptyQueryError");
        await thenLmsWasNotCalled();
      });

      it("returns empty array when LMS returns no tracks", async () => {
        await givenLmsWillReturnAlbumTracks([]);

        const result = await whenGettingAlbumTracks("99");

        await thenResultIsSuccess(result);
        await thenAlbumTrackCountIs(result, 0);
      });

      it("returns NetworkError when LMS is unreachable", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenGettingAlbumTracks("42");

        await thenResultIsError(result);
        await thenErrorTypeIs(result, "NetworkError");
      });

      it("sends titles command with album_id filter and correct tags", async () => {
        await givenLmsWillReturnAlbumTracks([]);

        await whenGettingAlbumTracks("42");

        await thenAlbumTracksCommandWasSentWithAlbumId("42");
      });
    });
  });

  // GIVEN helpers for Album Track Listing (Rule 9)
  const givenLmsWillReturnAlbumTracks = async (
    tracks: ReadonlyArray<{
      readonly id: number;
      readonly title: string;
      readonly tracknum?: string;
      readonly url?: string;
      readonly artist?: string;
      readonly album?: string;
      readonly duration?: number;
    }>,
  ): Promise<void> => {
    const mockResponse = {
      result: { titles_loop: tracks },
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  // WHEN helpers for Album Track Listing (Rule 9)
  const whenGettingAlbumTracks = async (albumId: string): AlbumTracksResult => {
    const client = createLmsClient(defaultConfig);
    return client.getAlbumTracks(albumId);
  };

  // THEN helpers for Album Track Listing (Rule 9)
  const thenAlbumTrackCountIs = async (
    result: Result<
      ReadonlyArray<{
        readonly id: number;
        readonly title: string;
        readonly tracknum?: string;
      }>,
      LmsError
    >,
    expectedCount: number,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value).toHaveLength(expectedCount);
    }
  };

  const thenAlbumTracksAreSortedByTrackNum = async (
    result: Result<
      ReadonlyArray<{
        readonly id: number;
        readonly title: string;
        readonly tracknum?: string;
      }>,
      LmsError
    >,
  ): Promise<void> => {
    if (result.ok) {
      const trackNums = result.value.map((t) =>
        parseInt(t.tracknum ?? "0", 10),
      );
      const sorted = [...trackNums].sort((a, b) => a - b);
      expect(trackNums).toEqual(sorted);
    }
  };

  const thenAlbumTracksCommandWasSentWithAlbumId = async (
    albumId: string,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1][0]).toBe("titles");
    expect(body.params[1][3]).toBe(`album_id:${albumId}`);
  };

  // GIVEN helpers for Album Playback (Rule 8)
  const givenLmsWillAcceptAlbumCommand = async (): Promise<void> => {
    const mockResponse = {
      result: {},
      id: 1,
      error: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  };

  // WHEN helpers for Album Playback (Rule 8)
  const whenPlayingAlbum = async (
    albumId: string,
  ): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.playAlbum(albumId);
  };

  const whenDisablingRepeat = async (): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.disableRepeat();
  };

  // THEN helpers for Album Playback (Rule 8)
  const thenPlaylistControlCommandWasSentWithAlbumId = async (
    albumId: string,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1][0]).toBe("playlistcontrol");
    expect(body.params[1][1]).toBe("cmd:load");
    expect(body.params[1][2]).toBe(`album_id:${albumId}`);
  };

  const thenDisableRepeatCommandWasSent = async (): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1]).toEqual(["playlist", "repeat", "0"]);
  };

  // GIVEN/WHEN/THEN helpers for playTidalAlbum (Rule 8 — Story 8.7)
  const givenTidalAlbumTracksReturn = (
    tracks: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly url: string;
      readonly isaudio: number;
      readonly type: string;
      readonly hasitems: number;
    }>,
  ): void => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { loop_loop: tracks, count: tracks.length },
        id: 1,
        error: null,
      }),
    });
  };

  const givenLmsAcceptsPlaylistCommand = (): void => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: {}, id: 1, error: null }),
    });
  };

  const whenPlayingTidalAlbum = async (
    albumId: string,
  ): Promise<Result<void, LmsError>> => {
    const client = createLmsClient(defaultConfig);
    return await client.playTidalAlbum(albumId);
  };

  const thenTidalItemsFetchWasSentWithItemId = async (
    albumId: string,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(0);
    expect(body.params[1][0]).toBe("tidal");
    expect(body.params[1][1]).toBe("items");
    expect(body.params[1][4]).toBe(`item_id:${albumId}`);
  };

  const thenPlaylistPlayWasSentWithUrl = async (
    trackUrl: string,
  ): Promise<void> => {
    const body = getJsonRpcRequestBodyAt(2);
    expect(body.params[1]).toEqual(["playlist", "play", trackUrl]);
  };

  // =============================================================================
  // Rule 9: Artist Albums Retrieval
  // =============================================================================

  describe("Rule 9: Artist Albums Retrieval", () => {
    it("returns albums for a valid artist ID", async () => {
      await givenLmsWillReturnArtistAlbums([
        {
          id: 1,
          album: "The Wall",
          artist: "Pink Floyd",
          year: 1979,
          artwork_track_id: "101",
        },
        {
          id: 2,
          album: "Dark Side of the Moon",
          artist: "Pink Floyd",
          year: 1973,
          artwork_track_id: "201",
        },
      ]);

      const result = await whenGettingArtistAlbums("42");

      await thenArtistAlbumsResultIsOk(result);
      await thenArtistAlbumsCommandWasSentWithArtistId("42");
    });

    it("returns empty array when artist has no albums", async () => {
      await givenLmsWillReturnArtistAlbums([]);

      const result = await whenGettingArtistAlbums("99");

      await thenArtistAlbumsResultIsOk(result);
    });

    it("returns EmptyQueryError for empty artist ID", async () => {
      const client = createLmsClient(defaultConfig);
      const result = await client.getArtistAlbums("   ");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("EmptyQueryError");
      }
    });

    // GIVEN helpers for Artist Albums (Rule 9)
    const givenLmsWillReturnArtistAlbums = async (
      albums: ReadonlyArray<{
        readonly id: number;
        readonly album: string;
        readonly artist?: string;
        readonly year?: number;
        readonly artwork_track_id?: string;
      }>,
    ): Promise<void> => {
      const mockResponse = {
        result: { albums_loop: albums },
        id: 1,
        error: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
    };

    // WHEN helpers for Artist Albums (Rule 9)
    const whenGettingArtistAlbums = async (
      artistId: string,
    ): ArtistAlbumsResult => {
      const client = createLmsClient(defaultConfig);
      return client.getArtistAlbums(artistId);
    };

    // THEN helpers for Artist Albums (Rule 9)
    const thenArtistAlbumsResultIsOk = async (
      result: Result<readonly unknown[], LmsError>,
    ): Promise<void> => {
      expect(result.ok).toBe(true);
    };

    const thenArtistAlbumsCommandWasSentWithArtistId = async (
      artistId: string,
    ): Promise<void> => {
      const body = getJsonRpcRequestBodyAt(0);
      expect(body.params[1][0]).toBe("albums");
      expect(body.params[1][3]).toBe(`artist_id:${artistId}`);
    };
  });

  // =============================================================================
  // getArtistName() — direct artist name lookup via LMS artists command
  // =============================================================================

  describe("getArtistName()", () => {
    it("returns the artist name from artists_loop for a valid artist ID", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            artists_loop: [{ id: 225, artist: "Verlorene Jungs" }],
          },
          id: 1,
          error: null,
        }),
      });

      const client = createLmsClient(defaultConfig);
      const result = await client.getArtistName("225");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("Verlorene Jungs");
      }
    });

    it("sends artists command with artist_id filter", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { artists_loop: [{ id: 42, artist: "Pink Floyd" }] },
          id: 1,
          error: null,
        }),
      });

      const client = createLmsClient(defaultConfig);
      await client.getArtistName("42");
      const body = getJsonRpcRequestBodyAt(0);
      expect(body.params[1][0]).toBe("artists");
      expect(body.params[1]).toContain("artist_id:42");
    });

    it("returns null when artists_loop is empty", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { artists_loop: [] },
          id: 1,
          error: null,
        }),
      });

      const client = createLmsClient(defaultConfig);
      const result = await client.getArtistName("999");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("returns null for empty artist ID without making LMS request", async () => {
      const client = createLmsClient(defaultConfig);
      const result = await client.getArtistName("   ");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Rule 10: getQueue() Quality Tags (AC4 — Story 6.6)
  // =============================================================================

  describe("Rule 10: getQueue() returns audioQuality and source when LMS provides quality tags", () => {
    it("parses FLAC quality tags from playlist_loop and populates audioQuality on QueueTrack", async () => {
      await givenLmsQueueHasTracks([
        {
          id: 42,
          title: "Breathe",
          artist: "Pink Floyd",
          album: "Dark Side of the Moon",
          duration: 163,
          url: "file:///music/breathe.flac",
          bitrate: "1411kb/s",
          samplerate: "44100",
          type: "flc",
        },
      ]);

      const result = await whenGettingQueue();

      await thenQueueResultIsOk(result);
      await thenQueueTrackHasAudioQuality(result, 0, {
        format: "FLAC",
        lossless: true,
      });
      await thenQueueTrackHasSource(result, 0, "local");
    });

    it("leaves audioQuality undefined for queue track without quality tags", async () => {
      await givenLmsQueueHasTracks([
        {
          id: 99,
          title: "Streaming Track",
          artist: "Artist",
          album: "Album",
          duration: 240,
          url: "qobuz://track/12345",
          // no bitrate, samplerate, type — quality unknown
        },
      ]);

      const result = await whenGettingQueue();

      await thenQueueResultIsOk(result);
      await thenQueueTrackHasNoAudioQuality(result, 0);
      await thenQueueTrackHasSource(result, 0, "qobuz");
    });

    it("requests quality tags (b,r,o,s) in getQueue LMS status command", async () => {
      await givenLmsQueueHasTracks([]);

      await whenGettingQueue();

      await thenQueueCommandRequestedQualityTags();
    });

    it("populates bitDepth from samplesize when present in LMS playlist_loop response", async () => {
      await givenLmsQueueHasTracks([
        {
          id: 55,
          title: "Hi-Res Track",
          artist: "Artist",
          album: "Album",
          duration: 300,
          url: "file:///music/hiRes.flac",
          bitrate: "4608kb/s",
          samplerate: "96000",
          type: "flc",
          samplesize: 24,
        },
      ]);

      const result = await whenGettingQueue();

      await thenQueueResultIsOk(result);
      await thenQueueTrackHasAudioQuality(result, 0, {
        format: "FLAC",
        lossless: true,
      });
      // samplesize: 24 → bitDepth: 24 (enables "FLAC 24/96" badge format per AC4)
      if (result.ok) {
        expect(result.value[0]?.audioQuality?.bitDepth).toBe(24);
      }
    });

    // GIVEN helpers for getQueue (Rule 10)
    const givenLmsQueueHasTracks = async (
      tracks: ReadonlyArray<{
        readonly id: number;
        readonly title: string;
        readonly artist?: string;
        readonly album?: string;
        readonly duration?: number;
        readonly url?: string;
        readonly bitrate?: string;
        readonly samplerate?: string;
        readonly type?: string;
        readonly samplesize?: number;
      }>,
    ): Promise<void> => {
      const mockResponse = {
        result: {
          playlist_cur_index: 0,
          playlist_loop: tracks,
        },
        id: 1,
        error: null,
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
    };

    // WHEN helpers for getQueue (Rule 10)
    const whenGettingQueue = async (): Promise<
      Result<readonly import("@signalform/shared").QueueTrack[], LmsError>
    > => {
      const client = createLmsClient(defaultConfig);
      return await client.getQueue();
    };

    // THEN helpers for getQueue (Rule 10)
    const thenQueueResultIsOk = async (
      result: Result<
        readonly import("@signalform/shared").QueueTrack[],
        LmsError
      >,
    ): Promise<void> => {
      expect(result.ok).toBe(true);
    };

    const thenQueueTrackHasAudioQuality = async (
      result: Result<
        readonly import("@signalform/shared").QueueTrack[],
        LmsError
      >,
      index: number,
      expected: { readonly format: string; readonly lossless: boolean },
    ): Promise<void> => {
      if (result.ok) {
        const track = result.value[index];
        expect(track?.audioQuality).toBeDefined();
        expect(track?.audioQuality?.format).toBe(expected.format);
        expect(track?.audioQuality?.lossless).toBe(expected.lossless);
      }
    };

    const thenQueueTrackHasNoAudioQuality = async (
      result: Result<
        readonly import("@signalform/shared").QueueTrack[],
        LmsError
      >,
      index: number,
    ): Promise<void> => {
      if (result.ok) {
        expect(result.value[index]?.audioQuality).toBeUndefined();
      }
    };

    const thenQueueTrackHasSource = async (
      result: Result<
        readonly import("@signalform/shared").QueueTrack[],
        LmsError
      >,
      index: number,
      expectedSource: string,
    ): Promise<void> => {
      if (result.ok) {
        expect(result.value[index]?.source).toBe(expectedSource);
      }
    };

    const thenQueueCommandRequestedQualityTags = async (): Promise<void> => {
      const body = getJsonRpcRequestBodyAt(0);
      // getQueue uses: ["status", 0, 999, "tags:..."]
      const tagsArg = body.params[1][3];
      expect(typeof tagsArg).toBe("string");
      // Must include quality tags: b=bitrate, r=samplerate, o=type, s=samplesize/bitdepth
      expect(tagsArg).toContain("b");
      expect(tagsArg).toContain("r");
      expect(tagsArg).toContain("o");
      expect(tagsArg).toContain("s"); // samplesize/bitdepth — needed for "FLAC 24/96" badge format
    };
  });

  // Rule 11: Library Albums — Story 7.1
  describe("Rule 11: Library Albums", () => {
    describe("getLibraryAlbums()", () => {
      it("returns albums list and total count", async () => {
        await givenLmsWillReturnLibraryAlbums(
          [
            {
              id: 42,
              album: "The Wall",
              artist: "Pink Floyd",
              year: 1979,
              artwork_track_id: "abc123",
            },
            { id: 7, album: "Animals", artist: "Pink Floyd", year: 1977 },
          ],
          767,
        );

        const result = await whenGettingLibraryAlbums(0, 10);

        await thenLibraryResultIsOk(result);
        await thenLibraryAlbumsHaveLength(result, 2);
        await thenLibraryTotalCountIs(result, 767);
      });

      it("sends albums command with correct offset, limit and tags", async () => {
        await givenLmsWillReturnLibraryAlbums([], 0);

        await whenGettingLibraryAlbums(50, 250);

        await thenLibraryCommandWasSentWith(50, 250);
      });

      it("returns empty albums list when LMS returns empty albums_loop", async () => {
        await givenLmsWillReturnLibraryAlbums([], 0);

        const result = await whenGettingLibraryAlbums(0, 250);

        await thenLibraryResultIsOk(result);
        await thenLibraryAlbumsHaveLength(result, 0);
        await thenLibraryTotalCountIs(result, 0);
      });

      it("enriches albums with genre from songs bulk query", async () => {
        await givenLmsWillReturnLibraryAlbums(
          [{ id: 42, album: "The Wall", artist: "Pink Floyd" }],
          1,
          [{ album_id: "42", genre: "Rock" }],
        );

        const result = await whenGettingLibraryAlbums(0, 10);

        await thenLibraryResultIsOk(result);
        await thenFirstAlbumHasGenre(result, "Rock");
      });

      it("returns albums without genre when songs query fails (graceful degradation)", async () => {
        await givenSongsQueryWillFailAfterAlbums(
          [{ id: 42, album: "The Wall", artist: "Pink Floyd" }],
          1,
        );

        const result = await whenGettingLibraryAlbums(0, 10);

        await thenLibraryResultIsOk(result);
        await thenFirstAlbumHasGenre(result, undefined);
      });

      it("sends songs command with correct tags (tags:g,e, offset=0, limit=20000)", async () => {
        await givenLmsWillReturnLibraryAlbums([], 0);

        await whenGettingLibraryAlbums(0, 250);

        await thenSongsCommandWasSentWith();
      });

      it("returns NetworkError when LMS is unreachable", async () => {
        await givenLmsConnectionWillFail("ECONNREFUSED");

        const result = await whenGettingLibraryAlbums(0, 250);

        await thenLibraryResultIsError(result);
        await thenLibraryErrorTypeIs(result, "NetworkError");
      });

      // GIVEN helpers for getLibraryAlbums (Rule 11)
      // NOTE: getLibraryAlbums makes TWO fetch calls:
      //   1. albums command (primary data)
      //   2. songs bulk query (genre enrichment via album_id→genre mapping)
      // Both must be mocked; songsGenres defaults to [] (no genre data).
      const givenLmsWillReturnLibraryAlbums = async (
        albums: ReadonlyArray<{
          readonly id: number;
          readonly album: string;
          readonly artist?: string;
          readonly year?: number;
          readonly artwork_track_id?: string;
        }>,
        count: number,
        songsGenres: ReadonlyArray<{
          readonly album_id: string;
          readonly genre: string;
        }> = [],
      ): Promise<void> => {
        const albumsResponse = {
          result: { albums_loop: albums, count },
          id: 1,
          error: null,
        };
        const songsResponse = {
          result: { titles_loop: songsGenres, count: songsGenres.length },
          id: 2,
          error: null,
        };
        fetchMock
          .mockResolvedValueOnce({ ok: true, json: async () => albumsResponse })
          .mockResolvedValueOnce({ ok: true, json: async () => songsResponse });
      };

      // Simulates albums succeeding but songs bulk query failing (graceful degradation).
      const givenSongsQueryWillFailAfterAlbums = async (
        albums: ReadonlyArray<{
          readonly id: number;
          readonly album: string;
          readonly artist?: string;
          readonly year?: number;
          readonly artwork_track_id?: string;
        }>,
        count: number,
      ): Promise<void> => {
        const albumsResponse = {
          result: { albums_loop: albums, count },
          id: 1,
          error: null,
        };
        fetchMock
          .mockResolvedValueOnce({ ok: true, json: async () => albumsResponse })
          .mockRejectedValueOnce(new Error("songs query failed"));
      };

      // WHEN helpers for getLibraryAlbums (Rule 11)
      const whenGettingLibraryAlbums = async (
        offset: number,
        limit: number,
      ): Promise<
        Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >
      > => {
        const client = createLmsClient(defaultConfig);
        return await client.getLibraryAlbums(offset, limit);
      };

      // THEN helpers for getLibraryAlbums (Rule 11)
      const thenLibraryResultIsOk = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
      ): Promise<void> => {
        expect(result.ok).toBe(true);
      };

      const thenLibraryAlbumsHaveLength = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
        expectedLength: number,
      ): Promise<void> => {
        if (result.ok) {
          expect(result.value.albums).toHaveLength(expectedLength);
        }
      };

      const thenLibraryTotalCountIs = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
        expectedCount: number,
      ): Promise<void> => {
        if (result.ok) {
          expect(result.value.count).toBe(expectedCount);
        }
      };

      const thenLibraryCommandWasSentWith = async (
        expectedOffset: number,
        expectedLimit: number,
      ): Promise<void> => {
        const body = getJsonRpcRequestBodyAt(0);
        const command = body.params[1];
        expect(command[0]).toBe("albums");
        expect(command[1]).toBe(expectedOffset);
        expect(command[2]).toBe(expectedLimit);
        expect(command[3]).toContain("tags:");
        expect(command[3]).toContain("j"); // artwork_track_id
      };

      const thenSongsCommandWasSentWith = async (): Promise<void> => {
        const body = getJsonRpcRequestBodyAt(1);
        const command = body.params[1];
        expect(command[0]).toBe("songs");
        expect(command[1]).toBe(0); // offset: always 0 (full library scan)
        expect(command[2]).toBe(20000); // limit: full library scan
        expect(command[3]).toContain("g"); // genre tag
        expect(command[3]).toContain("e"); // album_id tag
      };

      const thenFirstAlbumHasGenre = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
        expectedGenre: string | undefined,
      ): Promise<void> => {
        if (result.ok) {
          expect(result.value.albums[0]?.genre).toBe(expectedGenre);
        }
      };

      const thenLibraryResultIsError = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
      ): Promise<void> => {
        expect(result.ok).toBe(false);
      };

      const thenLibraryErrorTypeIs = async (
        result: Result<
          {
            readonly albums: readonly import("./types.js").LibraryAlbumRaw[];
            readonly count: number;
          },
          LmsError
        >,
        expectedType: string,
      ): Promise<void> => {
        if (!result.ok) {
          expect(result.error.type).toBe(expectedType);
        }
      };
    });
  });

  // Rule 14: getTidalAlbums — Story 8.1
  // Live-probe 2026-03-15: item_id:4 = "Alben" (user's Tidal library albums)
  // name = "{title} - {artist}", image = relative LMS proxy path, no separate artist/artwork_url fields
  describe("Rule 14: getTidalAlbums — Tidal Album Browse (Story 8.1)", () => {
    // GIVEN helpers for getTidalAlbums (Rule 14)
    // LMS real format: loop_loop items with id, name ("{title} - {artist}"), image (relative path)
    const givenTidalAlbumsReturns = (
      albums: ReadonlyArray<{
        readonly id: string;
        readonly name: string; // "{title} - {artist}" format (live-probe confirmed)
        readonly image?: string; // relative LMS proxy path, e.g. /imageproxy/...
      }>,
      count: number,
    ): void => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: albums.map((a) => ({
              id: a.id,
              name: a.name,
              image: a.image,
              type: "playlist",
              isaudio: 1,
              hasitems: 1,
            })),
            count,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalAlbumsCommandFails = (): void => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    };

    // WHEN helper for getTidalAlbums (Rule 14)
    const whenGettingTidalAlbums = async (
      offset: number = 0,
      limit: number = 10,
    ): Promise<Awaited<ReturnType<LmsClient["getTidalAlbums"]>>> => {
      const client = createLmsClient(defaultConfig);
      return await client.getTidalAlbums(offset, limit);
    };

    it("returns list of Tidal albums when LMS responds with albums", async () => {
      // LMS format: name = "{title} - {artist}", image = relative proxy path
      givenTidalAlbumsReturns(
        [
          {
            id: "4.0",
            name: "Pablo Honey - Radiohead",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F12345%2F1280x1280.jpg/image.jpg",
          },
          {
            id: "4.1",
            name: "The Bends - Radiohead",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F67890%2F1280x1280.jpg/image.jpg",
          },
        ],
        2,
      );

      const result = await whenGettingTidalAlbums(0, 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.albums).toHaveLength(2);
        expect(result.value.count).toBe(2);
        // name field is returned as-is (parsing done in service layer)
        expect(result.value.albums[0]?.name).toBe("Pablo Honey - Radiohead");
        expect(result.value.albums[0]?.id).toBe("4.0");
      }
    });

    it("returns empty albums array when LMS responds with no albums", async () => {
      givenTidalAlbumsReturns([], 0);

      const result = await whenGettingTidalAlbums(0, 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.albums).toHaveLength(0);
        expect(result.value.count).toBe(0);
      }
    });

    it("returns NetworkError when LMS is unreachable", async () => {
      givenTidalAlbumsCommandFails();

      const result = await whenGettingTidalAlbums(0, 10);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });

    it("sends tidal items command with correct offset and limit", async () => {
      givenTidalAlbumsReturns([], 0);

      await whenGettingTidalAlbums(50, 25);

      const body = getJsonRpcRequestBodyAt(0);
      const command = body.params[1];
      expect(command[0]).toBe("tidal");
      expect(command[1]).toBe("items");
      expect(command[2]).toBe(50); // offset
      expect(command[3]).toBe(25); // limit
    });
  });

  // Story 8.6: Tidal Artist Album Browse
  describe("Rule 15: getTidalArtistAlbums — Tidal Artist Album Browse (Story 8.6)", () => {
    const givenArtistAlbumsReturns = (
      albums: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly image?: string;
        readonly isaudio?: number;
        readonly hasitems?: number;
      }>,
      count: number,
    ): void => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: albums.map((a) => ({
              id: a.id,
              name: a.name,
              type: "playlist",
              image: a.image,
              isaudio: a.isaudio ?? 1,
              hasitems: a.hasitems ?? 1,
            })),
            count,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenArtistAlbumsCommandFails = (): void => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    };

    const whenGettingTidalArtistAlbums = async (
      artistId: string = "6.0",
      offset: number = 0,
      limit: number = 10,
    ): Promise<Awaited<ReturnType<LmsClient["getTidalArtistAlbums"]>>> => {
      const client = createLmsClient(defaultConfig);
      return await client.getTidalArtistAlbums(artistId, offset, limit);
    };

    it("returns list of artist albums when LMS responds with albums", async () => {
      givenArtistAlbumsReturns(
        [
          {
            id: "6.0.1.0",
            name: "When I Fall In Love",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F3f99c29c%2F1280x1280.jpg/image.jpg",
          },
          {
            id: "6.0.1.1",
            name: "Waltz for Debby",
          },
        ],
        2,
      );

      const result = await whenGettingTidalArtistAlbums("6.0");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.albums).toHaveLength(2);
        expect(result.value.count).toBe(2);
        // name = album title ONLY (no "Title - Artist" split — differs from getTidalAlbums)
        expect(result.value.albums[0]?.name).toBe("When I Fall In Love");
        expect(result.value.albums[0]?.id).toBe("6.0.1.0");
        expect(result.value.albums[1]?.name).toBe("Waltz for Debby");
      }
    });

    it("returns empty albums array when artist has no albums", async () => {
      givenArtistAlbumsReturns([], 0);

      const result = await whenGettingTidalArtistAlbums("6.0");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.albums).toHaveLength(0);
        expect(result.value.count).toBe(0);
      }
    });

    it("returns NetworkError when LMS is unreachable", async () => {
      givenArtistAlbumsCommandFails();

      const result = await whenGettingTidalArtistAlbums("6.0");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });

    it("sends tidal items command with item_id:{artistId}.1 (Alben submenu)", async () => {
      givenArtistAlbumsReturns([], 0);

      await whenGettingTidalArtistAlbums("6.0", 0, 250);

      const body = getJsonRpcRequestBodyAt(0);
      const command = body.params[1];
      expect(command[0]).toBe("tidal");
      expect(command[1]).toBe("items");
      expect(command[4]).toBe("item_id:6.0.1"); // {artistId}.1 = Alben submenu
    });
  });

  describe("Rule 16: searchTidalArtists — Tidal Artist Search (Story 8.8 AC2)", () => {
    const givenArtistSearchReturns = (
      artists: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly image?: string;
        readonly type?: string;
        readonly isaudio?: number;
      }>,
      count: number,
    ): void => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: artists,
            count,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenArtistSearchFails = (): void => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    };

    const whenSearchingTidalArtists = async (
      query: string = "Sabrina Carpenter",
      offset: number = 0,
      limit: number = 10,
    ): Promise<Awaited<ReturnType<LmsClient["searchTidalArtists"]>>> => {
      const client = createLmsClient(defaultConfig);
      return await client.searchTidalArtists(query, offset, limit);
    };

    it("returns list of artists when LMS responds with artist results", async () => {
      givenArtistSearchReturns(
        [
          {
            id: "7_sabrina carpenter.2.0",
            name: "Sabrina Carpenter",
            image:
              "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc%2F320x320.jpg/image.jpg",
            type: "outline",
            isaudio: 0,
          },
        ],
        1,
      );

      const result = await whenSearchingTidalArtists("Sabrina Carpenter");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.artists).toHaveLength(1);
        expect(result.value.count).toBe(1);
        expect(result.value.artists[0]?.name).toBe("Sabrina Carpenter");
        expect(result.value.artists[0]?.id).toBe("7_sabrina carpenter.2.0");
      }
    });

    it("returns empty artists array when no results found", async () => {
      givenArtistSearchReturns([], 0);

      const result = await whenSearchingTidalArtists("unknownartist");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.artists).toHaveLength(0);
        expect(result.value.count).toBe(0);
      }
    });

    it("returns NetworkError when LMS is unreachable", async () => {
      givenArtistSearchFails();

      const result = await whenSearchingTidalArtists("Sabrina Carpenter");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });

    it("returns EmptyQueryError when query is empty string", async () => {
      const result = await whenSearchingTidalArtists("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("EmptyQueryError");
      }
    });

    it("sends tidal items command with item_id:7_{query}.2 and search:{query} params", async () => {
      givenArtistSearchReturns([], 0);

      await whenSearchingTidalArtists("Sabrina Carpenter", 0, 10);

      const body = getJsonRpcRequestBodyAt(0);
      const command = body.params[1];
      expect(command[0]).toBe("tidal");
      expect(command[1]).toBe("items");
      expect(command[4]).toBe("item_id:7_Sabrina Carpenter.2"); // .2 = Interpreten (artists)
      expect(command[5]).toBe("search:Sabrina Carpenter");
      expect(command[6]).toBe("want_url:1");
    });

    it("sends correct offset and limit in command", async () => {
      givenArtistSearchReturns([], 0);

      await whenSearchingTidalArtists("Pink Floyd", 5, 20);

      const body = getJsonRpcRequestBodyAt(0);
      const command = body.params[1];
      expect(command[2]).toBe(5); // offset
      expect(command[3]).toBe(20); // limit
    });
  });

  // Rule 17: addAlbumToQueue — local album (Story 9.4)
  describe("Rule 17: addAlbumToQueue — local album queue (Story 9.4)", () => {
    it("sends playlistcontrol cmd:add album_id:X to LMS", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { count: 10 }, id: 1, error: null }),
      });

      const client = createLmsClient(defaultConfig);
      const result = await client.addAlbumToQueue("92");

      expect(result.ok).toBe(true);
      const body = getJsonRpcRequestBodyAt(0);
      expect(body.params[1]).toEqual([
        "playlistcontrol",
        "cmd:add",
        "album_id:92",
      ]);
    });

    it("returns EmptyQueryError for empty album ID", async () => {
      const client = createLmsClient(defaultConfig);
      const result = await client.addAlbumToQueue("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("EmptyQueryError");
      }
    });

    it("returns NetworkError when LMS is unreachable", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("ECONNREFUSED"));

      const client = createLmsClient(defaultConfig);
      const result = await client.addAlbumToQueue("42");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });
  });

  // Rule 18: addTidalAlbumToQueue — Tidal album sequential add (Story 9.4)
  describe("Rule 18: addTidalAlbumToQueue — Tidal album queue (Story 9.4)", () => {
    it("fetches tracks and adds each sequentially without clearing or playing", async () => {
      // Mock: tidal items fetch
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              {
                id: "4.0.0",
                name: "Track 1",
                url: "tidal://111.flc",
                isaudio: 1,
                type: "audio",
                hasitems: 0,
              },
              {
                id: "4.0.1",
                name: "Track 2",
                url: "tidal://222.flc",
                isaudio: 1,
                type: "audio",
                hasitems: 0,
              },
            ],
            count: 2,
          },
          id: 1,
          error: null,
        }),
      });
      // Mock: add track 1
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: {}, id: 1, error: null }),
      });
      // Mock: add track 2
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: {}, id: 1, error: null }),
      });

      const client = createLmsClient(defaultConfig);
      const result = await client.addTidalAlbumToQueue("4.0");

      expect(result.ok).toBe(true);
      // 3 total fetch calls: 1 tidal items + 2 add
      expect(fetchMock.mock.calls).toHaveLength(3);
      // No clear or play command was sent (only add)
      const addCall1 = getJsonRpcRequestBodyAt(1);
      const addCall2 = getJsonRpcRequestBodyAt(2);
      expect(addCall1.params[1][0]).toBe("playlist");
      expect(addCall1.params[1][1]).toBe("add");
      expect(addCall1.params[1][2]).toBe("tidal://111.flc");
      expect(addCall2.params[1][2]).toBe("tidal://222.flc");
    });

    it("returns LmsApiError when album has no playable tracks", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { loop_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });

      const client = createLmsClient(defaultConfig);
      const result = await client.addTidalAlbumToQueue("4.99");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("LmsApiError");
      }
    });

    it("returns NetworkError when track fetch fails", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("ECONNREFUSED"));

      const client = createLmsClient(defaultConfig);
      const result = await client.addTidalAlbumToQueue("4.0");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });
  });

  // Rule 19: findTidalSearchAlbumId — Tidal search album browse ID lookup (Story 9.6)
  describe("Rule 19: findTidalSearchAlbumId — Tidal Search Album Lookup (Story 9.6)", () => {
    const mockAlbumsResponse = (
      albums: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
      }>,
    ): {
      readonly ok: true;
      readonly json: () => Promise<unknown>;
    } => ({
      ok: true,
      json: async (): Promise<unknown> => ({
        result: {
          loop_loop: albums.map((a) => ({
            ...a,
            type: "playlist",
            isaudio: 1,
            hasitems: 1,
          })),
          count: albums.length,
          title: "Alben",
        },
        id: 1,
        error: null,
      }),
    });

    it("returns browse ID when album title matches first result (case-insensitive startsWith)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockAlbumsResponse([
          { id: "7_sabrina carpenter.3.0", name: "Short n' Sweet [E]" },
          { id: "7_sabrina carpenter.3.1", name: "emails i can't send [E]" },
        ]),
      );

      const client = createLmsClient(defaultConfig);
      const result = await client.findTidalSearchAlbumId(
        "Short n' Sweet",
        "Sabrina Carpenter",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("7_sabrina carpenter.3.0");
      }
      // Verify LMS was queried with item_id:7_{title}.3
      const body = getJsonRpcRequestBodyAt(0);
      expect(body.params[1]).toContain("item_id:7_Short n' Sweet.3");
    });

    it("returns null when no album title matches", async () => {
      fetchMock.mockResolvedValueOnce(
        mockAlbumsResponse([
          { id: "7_some query.3.0", name: "Totally Different Album" },
        ]),
      );

      const client = createLmsClient(defaultConfig);
      const result = await client.findTidalSearchAlbumId(
        "Non-Existent Album",
        "Some Artist",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("returns null when LMS returns empty album list", async () => {
      fetchMock.mockResolvedValueOnce(mockAlbumsResponse([]));

      const client = createLmsClient(defaultConfig);
      const result = await client.findTidalSearchAlbumId(
        "Some Album",
        "Some Artist",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("propagates LMS network error as err result", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("ECONNREFUSED"));

      const client = createLmsClient(defaultConfig);
      const result = await client.findTidalSearchAlbumId(
        "Short n' Sweet",
        "Sabrina Carpenter",
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NetworkError");
      }
    });
  });

  // Rule 20: Tidal Track Cover Art from .4 browse — Story 9.11
  // Live probe (2026-03-20): item_id:7_{query}.4 (Tracks) already returns `image` field per track.
  // Each image is the album cover for that track (relative LMS proxy URL, e.g. "/imageproxy/...").
  // coverArtUrl is constructed in searchTidal() and preserved through enrichTidalTracks() via spread.
  // No separate .3 (Albums) browse needed — simpler and one fewer LMS call.
  describe("Rule 20: Tidal Track Cover Art from .4 browse (Story 9.11)", () => {
    const givenLocalEmpty20 = (): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { titles_loop: [], count: 0 },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalTrackSearch20 = (track: {
      readonly name: string;
      readonly url: string;
      readonly image?: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              {
                id: "7_q.4.0",
                name: track.name,
                url: track.url,
                isaudio: 1,
                type: "audio",
                ...(track.image !== undefined ? { image: track.image } : {}),
              },
            ],
            count: 1,
          },
          id: 1,
          error: null,
        }),
      });
    };

    const givenTidalInfoSucceeds20 = (info: {
      readonly artist: string;
      readonly album: string;
    }): void => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            loop_loop: [
              { id: "0", name: "Zu TIDAL Favoriten hinzufügen", type: "link" },
              {
                id: "1",
                name: "Zu TIDAL Wiedergabeliste hinzufügen",
                type: "link",
              },
              { id: "2", name: `Album: ${info.album}`, type: "link" },
              { id: "3", name: `Interpret: ${info.artist}`, type: "link" },
            ],
            count: 4,
          },
          id: 1,
          error: null,
        }),
      });
    };

    it("AC1: image field in .4 track result is mapped to coverArtUrl", async () => {
      // Mock order: local, .4 (with image), tidal_info — N+2 = 3 fetch calls total
      givenLocalEmpty20();
      givenTidalTrackSearch20({
        name: "Creep",
        url: "tidal://58990486.flc",
        image: "/imageproxy/tidal/abc123.jpg",
      });
      givenTidalInfoSucceeds20({ artist: "Radiohead", album: "Pablo Honey" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.source).toBe("tidal");
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/imageproxy/tidal/abc123.jpg",
        );
      }
      // N+2 = local + .4 + tidal_info = 3 fetch calls (no .3 browse needed)
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("AC2: coverArtUrl constructed as http://{host}:{port}{image}", async () => {
      givenLocalEmpty20();
      givenTidalTrackSearch20({
        name: "Wish You Were Here",
        url: "tidal://12345.flc",
        image: "/imageproxy/tidal/xyz789.jpg",
      });
      givenTidalInfoSucceeds20({
        artist: "Pink Floyd",
        album: "Wish You Were Here",
      });

      const result = await whenSearchingForTracks("pink floyd");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/imageproxy/tidal/xyz789.jpg",
        );
      }
    });

    it("AC3: Tidal track without image field → undefined coverArtUrl (graceful degradation)", async () => {
      givenLocalEmpty20();
      // No image field in the track result
      givenTidalTrackSearch20({
        name: "Comfortably Numb",
        url: "tidal://99999.flc",
      });
      givenTidalInfoSucceeds20({ artist: "Pink Floyd", album: "The Wall" });

      const result = await whenSearchingForTracks("pink floyd");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.coverArtUrl).toBeUndefined();
      }
    });

    it("AC4: coverArtUrl from .4 is preserved after tidal_info enrichment (spread does not overwrite)", async () => {
      givenLocalEmpty20();
      givenTidalTrackSearch20({
        name: "Karma Police",
        url: "tidal://58990516.flc",
        image:
          "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fe77e4cc0%2F1280x1280.jpg/image.jpg",
      });
      givenTidalInfoSucceeds20({ artist: "Radiohead", album: "OK Computer" });

      const result = await whenSearchingForTracks("radiohead");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // coverArtUrl from .4 is preserved despite enrichment adding artist/album
        expect(result.value[0]?.coverArtUrl).toBe(
          "http://localhost:9000/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fe77e4cc0%2F1280x1280.jpg/image.jpg",
        );
        expect(result.value[0]?.artist).toBe("Radiohead");
        expect(result.value[0]?.album).toBe("OK Computer");
      }
    });
  });
});
