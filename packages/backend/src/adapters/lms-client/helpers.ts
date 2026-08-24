/**
 * LMS Client Helpers
 *
 * Module-level pure functions and constants extracted from client.ts.
 * No dependency on config, executeCommand, or any runtime state.
 */

import {
  ok,
  err,
  VALID_TRACK_PROTOCOLS,
  type AudioQuality,
  type SourceType,
  type Result,
} from "@signalform/shared";
import type { LmsError } from "./types.js";

// LMS Protocol Constants
export const MAX_SEARCH_RESULTS = 999; // LMS protocol limit for search results per query
const MAX_TRACK_URL_LENGTH = 2048; // Reasonable URL length limit to prevent DoS — only used by validateTrackUrl below
export const PAUSE_ENABLED = "1"; // LMS pause command: "1" = pause, "0" = resume
export const TIDAL_SEARCH_TIMEOUT_MS = 2500; // Measured against live LMS 2026-08-18: median 536ms, max 786ms — headroom for cold token refresh; the cap only guards a hung request
export const TIDAL_ENRICH_TIMEOUT_MS = 500; // Per-track tidal_info enrichment budget (tidal_info calls Tidal REST API ~200-400ms)
export const TIDAL_ENRICH_CONCURRENCY = 5; // Caps simultaneous tidal_info calls — an OOM-Kill on 2026-08-18 traced to 13+ concurrent enrichment calls for a single broad-matching search spiking LMS Perl-process memory from 160MB to 1.2GB in under 15s.

// Tidal REST quality map: URL extension → AudioQuality with default values.
// Tidal does not return exact bitrate in track API — use per-tier defaults.
// Verified via live probe (2026-03-14): Tidal URLs use .flc for LOSSLESS, .m4a for HIGH.
const TIDAL_QUALITY_MAP: Readonly<Record<string, AudioQuality>> = {
  flc: { format: "FLAC", lossless: true, bitrate: 1411000, sampleRate: 44100 },
  m4a: { format: "AAC", lossless: false, bitrate: 320000, sampleRate: 44100 },
} as const;

// Single source of truth: LMS codec → format + lossless flag.
// Adding a new codec here automatically handles the lossless flag — no parallel structure to sync.
const LMS_FORMAT_MAP: Readonly<
  Record<
    string,
    { readonly format: AudioQuality["format"]; readonly lossless: boolean }
  >
> = {
  flc: { format: "FLAC", lossless: true },
  flac: { format: "FLAC", lossless: true },
  alc: { format: "ALAC", lossless: true },
  alac: { format: "ALAC", lossless: true },
  mp3: { format: "MP3", lossless: false },
  aac: { format: "AAC", lossless: false },
  ogg: { format: "OGG", lossless: false },
} as const;

/**
 * LMS zerlegt item_id an Punkten zu einem Menü-Navigationspfad
 * (Slim::Control::XMLBrowser: `split /\./, $item_id`). Ein Punkt im
 * Suchtext erzeugt zusätzliche, ungewollte Pfadebenen und lässt LMS in
 * einen falschen — potenziell riesigen — Katalogknoten navigieren statt
 * in die Suchergebnisse. Nur der item_id-Anteil braucht das, `search:`
 * bleibt unverändert, weil der Suchtext dort nicht als Pfad geparst wird.
 */
export const sanitizeForItemIdPath = (query: string): string =>
  query.replace(/\./g, " ");

/**
 * Validates that an id (album id, artist id, ...) is non-empty after
 * trimming, returning the trimmed id on success or an EmptyQueryError
 * (`"{label} cannot be empty"`) otherwise.
 *
 * Shared by library's playAlbum/playTidalAlbum/getAlbumTracks/getArtistAlbums
 * and queue's addAlbumToQueue/addTidalAlbumToQueue — all trim + reject-empty
 * an id the same way before building an LMS command from it.
 */
export const validateNonEmptyId = (
  value: string,
  label: string,
): Result<string, LmsError> => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return err({
      type: "EmptyQueryError",
      message: `${label} cannot be empty`,
    });
  }
  return ok(trimmed);
};

/**
 * Validates a track URL for playback/queueing: non-empty, within
 * MAX_TRACK_URL_LENGTH, and using an allowed protocol (VALID_TRACK_PROTOCOLS).
 * Returns the trimmed URL on success.
 *
 * Shared by playback's play() and queue's addToQueue() — both perform the
 * same validation, differing only in which LmsError `type` is reported for
 * the length/protocol failures (`invalidErrorType`); an empty URL is always
 * an EmptyQueryError regardless of caller.
 */
export const validateTrackUrl = (
  trackUrl: string,
  invalidErrorType: "NetworkError" | "ValidationError",
): Result<string, LmsError> => {
  const trimmedUrl = trackUrl.trim();
  if (trimmedUrl === "") {
    return err({
      type: "EmptyQueryError",
      message: "Track URL cannot be empty",
    });
  }

  if (trimmedUrl.length > MAX_TRACK_URL_LENGTH) {
    return err({
      type: invalidErrorType,
      message: `Track URL exceeds maximum length of ${MAX_TRACK_URL_LENGTH} characters`,
    });
  }

  const hasValidProtocol = VALID_TRACK_PROTOCOLS.some((protocol) =>
    trimmedUrl.startsWith(protocol),
  );
  if (!hasValidProtocol) {
    return err({
      type: invalidErrorType,
      message: `Invalid track URL protocol. Must start with: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
    });
  }

  return ok(trimmedUrl);
};

/**
 * Parses the LMS `d` tag to seconds.
 *
 * LMS returns it as a number for local files and as a string for some remote
 * tracks; an unparsable value must yield undefined, never NaN. Shared by
 * search's local search and queue's saved-playlist tracks.
 */
export const parseDurationSeconds = (
  raw: number | string | undefined,
): number | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
};

/**
 * Splits `items` into consecutive groups of at most `size` elements,
 * preserving order. Used to bound enrichment concurrency (search.ts's
 * enrichTidalTracks) without dropping or reordering any item.
 */
export const toChunks = <T>(
  items: readonly T[],
  size: number,
): readonly (readonly T[])[] =>
  items.reduce<readonly (readonly T[])[]>((chunks, item, idx) => {
    if (idx % size === 0) {
      return [...chunks, [item]];
    }
    const lastChunk = chunks[chunks.length - 1]!;
    return [...chunks.slice(0, -1), [...lastChunk, item]];
  }, []);

// Extracts numeric Tidal track ID from URL: "tidal://58990486.flc" → "58990486"
export const extractTidalTrackId = (url: string): string | undefined => {
  const match = /^tidal:\/\/(\d+)\./.exec(url);
  return match?.[1];
};

// Infers AudioQuality from Tidal URL extension using TIDAL_QUALITY_MAP.
// Extension is lowercased before lookup — handles both .flc and .FLC (defensive).
// Returns undefined for unknown extensions (graceful degradation).
export const parseTidalAudioQuality = (
  url: string,
): AudioQuality | undefined => {
  const extMatch = /^tidal:\/\/\d+\.(\w+)$/.exec(url);
  const ext = extMatch?.[1]?.toLowerCase();
  return ext ? TIDAL_QUALITY_MAP[ext] : undefined;
};

// Parses tidal_info items response to extract artist and album.
// Live probe (2026-03-14): loop_loop[id="2"].name = "Album: {name}", loop_loop[id="3"].name = "Interpret: {name}"
// The prefix before ": " is locale-dependent; we parse by item id (stable positional identifiers).
export const parseTidalInfo = (
  loopLoop: ReadonlyArray<{
    readonly id: string;
    readonly name?: string;
  }>,
): { readonly artist: string; readonly album: string } => {
  const findAfterColon = (id: string): string => {
    const item = loopLoop.find((i) => i.id === id);
    if (!item?.name) {
      return "";
    }
    const colonIndex = item.name.indexOf(": ");
    return colonIndex >= 0 ? item.name.slice(colonIndex + 2) : "";
  };
  return { album: findAfterColon("2"), artist: findAfterColon("3") };
};

/**
 * Detect music source from track URL using protocol prefix matching.
 *
 * Protocol mappings:
 * - file:// → local (NAS/local library)
 * - qobuz:// → qobuz (Qobuz streaming service)
 * - tidal:// → tidal (Tidal streaming service)
 * - Other protocols (http://, https://, spotify://, etc.) → unknown
 *
 * Note: 'unknown' is a valid state (not an error) - future-proofs for new streaming services.
 *
 * @param url - Track URL from LMS
 * @returns Source type (local, qobuz, tidal, or unknown)
 */
export const detectSource = (
  url: string,
): "local" | "qobuz" | "tidal" | "unknown" => {
  if (url.startsWith("file://")) {
    return "local";
  }
  if (url.startsWith("qobuz://")) {
    return "qobuz";
  }
  if (url.startsWith("tidal://")) {
    return "tidal";
  }
  return "unknown";
};

// Maps a URL to SourceType, returning undefined for unknown/unrecognized sources.
// QueueTrack.source is SourceType (no "unknown") — unknown sources are represented as absent.
export const detectQueueSource = (url: string): SourceType | undefined => {
  const raw = detectSource(url);
  return raw !== "unknown" ? raw : undefined;
};

// Parst LMS bitrate-String zu bps. "2731kb/s VBR" → 2731000. Gibt 0 zurück wenn nicht parsebar.
const parseBitrate = (bitrateStr: string): number => {
  // LMS returns both "320kb/s CBR" and "320 kb/s" (space variant) — handle both
  const match = /^(\d+)\s*kb\/s/i.exec(bitrateStr.trim());
  return match ? parseInt(match[1]!, 10) * 1000 : 0;
};

// Parst LMS samplerate-String zu Hz. "96000" → 96000. Gibt 0 zurück wenn nicht parsebar.
const parseSampleRate = (srStr: string): number => {
  const parsed = parseInt(srStr.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
};

// Baut AudioQuality aus LMS-Response-Item.
// Gibt undefined zurück wenn format unbekannt, bitrate oder samplerate nicht parsebar.
// samplesize (tag 's' in status-command, tag 'T' in titles) wird als bitDepth übernommen wenn vorhanden.
export const parseAudioQuality = (item: {
  readonly type?: string;
  readonly bitrate?: string;
  readonly samplerate?: string;
  readonly samplesize?: number; // bit depth — present via status command tag 's', absent in titles command
}): AudioQuality | undefined => {
  const entry = LMS_FORMAT_MAP[item.type?.toLowerCase() ?? ""];
  if (!entry) {
    return undefined;
  }

  const bitrate = parseBitrate(item.bitrate ?? "");
  const sampleRate = parseSampleRate(item.samplerate ?? "");
  if (bitrate === 0 || sampleRate === 0) {
    return undefined;
  }

  return {
    format: entry.format,
    bitrate,
    sampleRate,
    lossless: entry.lossless,
    bitDepth:
      item.samplesize !== undefined && item.samplesize > 0
        ? item.samplesize
        : undefined,
  };
};
