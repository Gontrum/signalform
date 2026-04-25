import type { Track } from "./track.js";

export type PlayerStatus = {
  readonly state: PlaybackState;
  readonly currentTrack: Track | null;
  readonly position: number; // seconds
  readonly volume: number; // 0-100
  readonly repeat: RepeatMode;
  readonly shuffle: boolean;
};

export type PlaybackState = "playing" | "paused" | "stopped";
export type RepeatMode = "none" | "all" | "one";
