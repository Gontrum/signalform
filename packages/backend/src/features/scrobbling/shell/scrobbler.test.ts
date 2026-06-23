import { describe, it, expect, vi, beforeEach } from "vitest";
import { createScrobbler } from "./scrobbler.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { LmsPlayerStatus } from "../../../infrastructure/websocket/handlers.js";
import type { Track } from "@signalform/shared";
import { ok } from "@signalform/shared";

vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../core/scrobble-decider.js", () => ({
  shouldScrobble: vi.fn(),
}));

import { loadConfig } from "../../../infrastructure/config/index.js";
import { shouldScrobble } from "../core/scrobble-decider.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";

const makeConfig = (
  overrides: Partial<AppConfig> = {},
): { readonly ok: true; readonly value: AppConfig } => ({
  ok: true as const,
  value: {
    lmsHost: "localhost",
    lmsPort: 9000,
    playerId: "00:00:00:00:00:00",
    lastFmApiKey: "key",
    fanartApiKey: "",
    language: "en" as const,
    personalRadioEnabled: false,
    scrobblingEnabled: true,
    lastFmSessionKey: "session-key",
    lastFmSharedSecret: "shared-secret",
    personalRadioDiscovery: 50,
    ...overrides,
  },
});

const makeTrack = (id = "1"): Track => ({
  id,
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  duration: 300,
  sources: [],
});

const makeStatus = (
  overrides: Partial<LmsPlayerStatus> = {},
): LmsPlayerStatus => ({
  playerId: "00:00:00:00:00:00",
  mode: "play",
  currentTrack: makeTrack(),
  volume: 80,
  time: 10,
  ...overrides,
});

const createMockLastFmClient = (): LastFmClient =>
  ({
    getSimilarTracks: vi.fn(),
    getSimilarArtists: vi.fn(),
    getArtistInfo: vi.fn(),
    getAlbumInfo: vi.fn(),
    getArtistTopTracks: vi.fn(),
    getArtistTopAlbums: vi.fn(),
    getTagTopTracks: vi.fn(),
    searchTags: vi.fn(),
    getUserTopArtists: vi.fn(),
    getUserTopTracks: vi.fn(),
    getUserLovedTracks: vi.fn(),
    getUserRecentTracks: vi.fn(),
    getUserNeighbours: vi.fn(),
    getRecommendedTracks: vi.fn(),
    nowPlaying: vi.fn().mockResolvedValue(ok(undefined)),
    scrobble: vi.fn().mockResolvedValue(ok(undefined)),
    love: vi.fn(),
    unlove: vi.fn(),
    getCircuitState: vi.fn().mockReturnValue("CLOSED"),
  }) as LastFmClient;

describe("createScrobbler", () => {
  let client: LastFmClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockLastFmClient();
    vi.mocked(shouldScrobble).mockReturnValue(false);
  });

  describe("config guard", () => {
    it("does nothing when config fails to load", async () => {
      vi.mocked(loadConfig).mockReturnValue({
        ok: false,
        error: { type: "PARSE_ERROR", message: "bad" },
      });
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus());
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });

    it("does nothing when scrobblingEnabled is false", async () => {
      vi.mocked(loadConfig).mockReturnValue(
        makeConfig({ scrobblingEnabled: false }),
      );
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus());
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });

    it("does nothing when lastFmSessionKey is missing", async () => {
      vi.mocked(loadConfig).mockReturnValue(
        makeConfig({ lastFmSessionKey: undefined }),
      );
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus());
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });

    it("does nothing when lastFmSharedSecret is missing", async () => {
      vi.mocked(loadConfig).mockReturnValue(
        makeConfig({ lastFmSharedSecret: undefined }),
      );
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus());
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });
  });

  describe("mode guard", () => {
    it("does nothing when mode is not play", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus({ mode: "stop" }));
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });

    it("does nothing when currentTrack is undefined", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(
        null,
        makeStatus({ mode: "play", currentTrack: undefined }),
      );
      expect(client.nowPlaying).not.toHaveBeenCalled();
    });
  });

  describe("nowPlaying", () => {
    it("sends nowPlaying on first tick for a track", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus());
      // nowPlaying is fire-and-forget, wait for microtasks
      await Promise.resolve();
      expect(client.nowPlaying).toHaveBeenCalledOnce();
      expect(client.nowPlaying).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: "Test Artist",
          track: "Test Track",
          sessionKey: "session-key",
          sharedSecret: "shared-secret",
        }),
      );
    });

    it("sends nowPlaying with duration when track has duration > 0", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      const status = makeStatus();
      await onStatusUpdate(null, status);
      await Promise.resolve();
      expect(client.nowPlaying).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 300 }),
      );
    });

    it("omits duration when track.duration is 0", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      const track: Track = { ...makeTrack(), duration: 0 };
      await onStatusUpdate(null, makeStatus({ currentTrack: track }));
      await Promise.resolve();
      expect(client.nowPlaying).toHaveBeenCalledWith(
        expect.not.objectContaining({ duration: expect.anything() }),
      );
    });

    it("does not send nowPlaying again on subsequent ticks for same track", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      const status = makeStatus();
      await onStatusUpdate(null, status);
      await onStatusUpdate(status, makeStatus({ time: 20 }));
      await Promise.resolve();
      expect(client.nowPlaying).toHaveBeenCalledOnce();
    });

    it("sends nowPlaying again when track changes", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      const { onStatusUpdate } = createScrobbler(client);
      const status1 = makeStatus({ currentTrack: makeTrack("1") });
      const status2 = makeStatus({ currentTrack: makeTrack("2") });
      await onStatusUpdate(null, status1);
      await onStatusUpdate(status1, status2);
      await Promise.resolve();
      expect(client.nowPlaying).toHaveBeenCalledTimes(2);
    });

    it("does not throw when nowPlaying rejects", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(client.nowPlaying).mockRejectedValue(new Error("network"));
      const { onStatusUpdate } = createScrobbler(client);
      await expect(onStatusUpdate(null, makeStatus())).resolves.toBeUndefined();
    });
  });

  describe("scrobble", () => {
    it("scrobbles when shouldScrobble returns true", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(true);
      const { onStatusUpdate } = createScrobbler(client);
      const status = makeStatus({ time: 200 });
      await onStatusUpdate(null, status);
      await Promise.resolve();
      expect(client.scrobble).toHaveBeenCalledOnce();
      expect(client.scrobble).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: "Test Artist",
          track: "Test Track",
          sessionKey: "session-key",
          sharedSecret: "shared-secret",
        }),
      );
    });

    it("does not scrobble when shouldScrobble returns false", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(false);
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus({ time: 10 }));
      await Promise.resolve();
      expect(client.scrobble).not.toHaveBeenCalled();
    });

    it("scrobbles at most once per track", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(true);
      const { onStatusUpdate } = createScrobbler(client);
      const status = makeStatus({ time: 200 });
      await onStatusUpdate(null, status);
      await onStatusUpdate(status, makeStatus({ time: 201 }));
      await Promise.resolve();
      expect(client.scrobble).toHaveBeenCalledOnce();
    });

    it("scrobbles again after track changes", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(true);
      const { onStatusUpdate } = createScrobbler(client);
      const s1 = makeStatus({ currentTrack: makeTrack("1"), time: 200 });
      const s2 = makeStatus({ currentTrack: makeTrack("2"), time: 200 });
      await onStatusUpdate(null, s1);
      await onStatusUpdate(s1, s2);
      await Promise.resolve();
      expect(client.scrobble).toHaveBeenCalledTimes(2);
    });

    it("passes elapsed time to shouldScrobble", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(false);
      const { onStatusUpdate } = createScrobbler(client);
      await onStatusUpdate(null, makeStatus({ time: 150 }));
      expect(shouldScrobble).toHaveBeenCalledWith(
        expect.objectContaining({ elapsedSeconds: 150 }),
      );
    });

    it("does not throw when scrobble rejects", async () => {
      vi.mocked(loadConfig).mockReturnValue(makeConfig());
      vi.mocked(shouldScrobble).mockReturnValue(true);
      vi.mocked(client.scrobble).mockRejectedValue(new Error("network"));
      const { onStatusUpdate } = createScrobbler(client);
      await expect(
        onStatusUpdate(null, makeStatus({ time: 200 })),
      ).resolves.toBeUndefined();
    });
  });
});
