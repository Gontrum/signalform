import type { Track, AudioQuality } from "./track.js";
import type { SourceType } from "./source.js";

export type QueueState = {
  readonly items: ReadonlyArray<QueueItem>;
  readonly currentIndex: number;
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex: number | null;
};

export type QueueItem = {
  readonly id: string;
  readonly track: Track;
  readonly addedBy: "user" | "radio";
};

export type QueueTrack = {
  readonly id: string;
  readonly position: number; // 1-based queue position
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: number; // seconds (may be 0 if unknown)
  readonly isCurrent: boolean;
  readonly addedBy?: "user" | "radio"; // optional: absent for legacy payloads without provenance
  readonly url?: string; // optional: LMS queue URI used for stable repeat protection
  readonly source?: SourceType; // optional: absent for legacy/unknown sources
  readonly audioQuality?: AudioQuality; // optional: absent if LMS doesn't provide quality tags
};
