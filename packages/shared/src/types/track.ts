import type { SourceType } from "./source.js";

export type Track = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly duration: number; // seconds
  readonly coverArtUrl?: string; // LMS HTTP cover art URL
  readonly artistId?: string; // LMS numeric artist ID converted to string; undefined for streaming tracks
  readonly albumId?: string; // LMS numeric album ID converted to string; undefined for streaming tracks
  readonly sources: ReadonlyArray<TrackSource>;
};

export type TrackSource = {
  readonly source: SourceType;
  readonly url: string;
  readonly quality: AudioQuality;
  readonly available: boolean;
};

export type AudioQuality = {
  readonly format: "FLAC" | "AAC" | "MP3" | "ALAC" | "OGG";
  readonly bitrate: number; // bps (e.g., 1411200 for FLAC, 320000 for AAC 320)
  readonly sampleRate: number; // Hz (e.g., 44100, 96000)
  readonly bitDepth?: number; // bits (e.g., 16, 24) — optional: LMS search API may not provide
  readonly lossless: boolean;
};
