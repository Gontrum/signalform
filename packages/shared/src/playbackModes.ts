import type { RepeatMode, ShuffleMode } from "./types/playback.js";

// Total by construction: another LMS client can set a mode our buttons never
// produced, and the next press still has to land somewhere defined.
const SHUFFLE_SUCCESSOR: Readonly<Record<ShuffleMode, ShuffleMode>> = {
  off: "songs",
  songs: "albums",
  albums: "off",
};

// Not LMS order (1 = track, 2 = playlist): players step "repeat all" before
// "repeat one", so do not renumber this to match the adapter's mapping.
const REPEAT_SUCCESSOR: Readonly<Record<RepeatMode, RepeatMode>> = {
  off: "playlist",
  playlist: "track",
  track: "off",
};

export const nextShuffleMode = (current: ShuffleMode): ShuffleMode =>
  SHUFFLE_SUCCESSOR[current];

export const nextRepeatMode = (current: RepeatMode): RepeatMode =>
  REPEAT_SUCCESSOR[current];
