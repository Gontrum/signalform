import { loadConfig } from "../../../infrastructure/config/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { LmsPlayerStatus } from "../../../infrastructure/websocket/handlers.js";
import { shouldScrobble } from "../core/scrobble-decider.js";

type ScrobbleState = {
  readonly trackId: string;
  readonly artist: string;
  readonly title: string;
  readonly duration: number;
  readonly startedAt: number;
  readonly nowPlayingSent: boolean;
  readonly scrobbled: boolean;
};

export const createScrobbler = (
  lastFmClient: LastFmClient,
): {
  readonly onStatusUpdate: (
    previousStatus: LmsPlayerStatus | null,
    currentStatus: LmsPlayerStatus,
  ) => Promise<void>;
} => {
  // Mutable ref cell — immutable-data rule disabled for this file (see eslint.config.js)
  const stateRef = { current: null as ScrobbleState | null };

  const onStatusUpdate = async (
    _previousStatus: LmsPlayerStatus | null,
    currentStatus: LmsPlayerStatus,
  ): Promise<void> => {
    const configResult = loadConfig();
    if (!configResult.ok) {
      return;
    }
    const config = configResult.value;
    if (
      !config.scrobblingEnabled ||
      config.lastFmSessionKey === undefined ||
      config.lastFmSharedSecret === undefined
    ) {
      return;
    }
    const sessionKey = config.lastFmSessionKey;
    const sharedSecret = config.lastFmSharedSecret;

    const track = currentStatus.currentTrack;
    if (currentStatus.mode !== "play" || track === undefined) {
      return;
    }

    const state = stateRef.current;
    const trackChanged = state === null || state.trackId !== track.id;

    if (trackChanged) {
      stateRef.current = {
        trackId: track.id,
        artist: track.artist,
        title: track.title,
        duration: track.duration ?? 0,
        startedAt: Math.floor(Date.now() / 1000),
        nowPlayingSent: false,
        scrobbled: false,
      };
    }

    const s = stateRef.current;
    if (s === null) {
      return;
    }

    if (!s.nowPlayingSent) {
      stateRef.current = { ...s, nowPlayingSent: true };
      void lastFmClient
        .nowPlaying({
          artist: s.artist,
          track: s.title,
          duration: s.duration > 0 ? s.duration : undefined,
          sessionKey,
          sharedSecret,
        })
        .catch(() => undefined);
    }

    if (!s.scrobbled) {
      const elapsed = currentStatus.time;
      if (
        shouldScrobble({ elapsedSeconds: elapsed, durationSeconds: s.duration })
      ) {
        const updated = stateRef.current;
        if (updated !== null) {
          stateRef.current = { ...updated, scrobbled: true };
        }
        void lastFmClient
          .scrobble({
            artist: s.artist,
            track: s.title,
            timestamp: s.startedAt,
            duration: s.duration > 0 ? s.duration : undefined,
            sessionKey,
            sharedSecret,
          })
          .catch(() => undefined);
      }
    }
  };

  return { onStatusUpdate };
};
