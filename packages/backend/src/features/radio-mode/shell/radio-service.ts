/**
 * Radio Mode — Imperative Shell
 *
 * Orchestrates radio mode: detects queue-end trigger, fetches similar tracks from last.fm,
 * applies functional filters (Stories 6.2 + 6.3), searches LMS, adds to queue.
 *
 * Imperative shell: has IO, state, and side effects.
 * All pure logic lives in service.ts and diversity-service.ts (functional core).
 */

import type {
  LmsClient,
  SearchResult,
} from "../../../adapters/lms-client/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import type { TypedSocketIOServer } from "../../../infrastructure/websocket/index.js";
import { selectBestSource } from "../../source-hierarchy/index.js";
import type { SelectionError } from "../../source-hierarchy/index.js";
import type { AudioQuality, TrackSource, SourceType } from "@signalform/shared";
import {
  filterByContext,
  filterByDiversity,
  addToSlidingWindow,
  DEFAULT_DIVERSITY_CONFIG,
} from "../index.js";
import type { CandidateTrack } from "../core/types.js";
import {
  PLAYER_UPDATES_ROOM,
  PLAYER_RADIO_STARTED,
  PLAYER_QUEUE_UPDATED,
  PLAYER_RADIO_UNAVAILABLE,
} from "../../../infrastructure/websocket/index.js";
import { normalizeArtist } from "../../../infrastructure/normalizeArtist.js";
import type { RadioUnavailablePayload } from "@signalform/shared";
import {
  getRadioQueueState,
  resetRadioRuntimeState,
  setRadioBoundaryIndex,
  setRadioProcessing,
  setRadioRecentArtists,
} from "./radio-state.js";

// Number of radio tracks to add per queue-end trigger
const RADIO_BATCH_SIZE = 5;
const RADIO_REMOVAL_REPLENISH_SIZE = 1;

type ReplenishTrigger = "queue-end" | "queue-remove";

type ReplenishOutcome =
  | {
      readonly status: "success";
      readonly preRadioQueueLength: number;
      readonly postQueueTracks: readonly {
        readonly id: string;
        readonly position: number;
        readonly title: string;
        readonly artist: string;
        readonly album: string;
        readonly duration: number;
        readonly isCurrent: boolean;
        readonly source?: SourceType;
        readonly audioQuality?: AudioQuality;
      }[];
      readonly tracksAdded: number;
    }
  | {
      readonly status: "skipped";
      readonly reason:
        | "already-processing"
        | "lastfm-unavailable"
        | "no-candidates"
        | "batch-empty";
      readonly unavailableEmitted?: boolean;
    }
  | {
      readonly status: "failed";
      readonly reason: "queue-fetch-failed" | "unexpected-error";
      readonly error: string;
    };

/**
 * Result type for selectBestTrackUrl — carries the selected URL and any SelectionError
 * that occurred (so the caller can log it per AC6 while keeping the helper pure).
 */
type SelectBestTrackResult = {
  readonly url: string | undefined;
  readonly selectionError?: SelectionError;
};

/**
 * Fallback quality selection: simple lossless→bitrate comparison.
 * Used when no source has audioQuality data or when selectBestSource fails.
 * Pure function — no side effects.
 */
const computeFallbackUrl = (
  results: readonly SearchResult[],
): string | undefined => {
  if (results.length === 0) {
    return undefined;
  }
  return results.reduce((best, current) => {
    const currentLossless = current.audioQuality?.lossless ?? false;
    const bestLossless = best.audioQuality?.lossless ?? false;
    if (currentLossless && !bestLossless) {
      return current;
    }
    if (!currentLossless && bestLossless) {
      return best;
    }
    const currentBitrate = current.audioQuality?.bitrate ?? 0;
    const bestBitrate = best.audioQuality?.bitrate ?? 0;
    return currentBitrate > bestBitrate ? current : best;
  }).url;
};

/**
 * Selects the best track URL from LMS search results using source hierarchy.
 * Falls back to simple lossless→bitrate comparison if no quality data is available.
 * Returns selectionError when selectBestSource fails so caller can log it (AC6).
 * Pure function — no side effects.
 */
const selectBestTrackUrl = (
  results: readonly SearchResult[],
): SelectBestTrackResult => {
  // Map to TrackSource — filter out unknown source and missing audioQuality.
  // ⚠️ CRITICAL: The type guard must narrow BOTH audioQuality AND source,
  // because SearchResult.source includes "unknown" which is not a valid SourceType.
  const sources: readonly TrackSource[] = results
    .filter(
      (
        r,
      ): r is typeof r & {
        readonly audioQuality: AudioQuality;
        readonly source: SourceType;
      } => r.audioQuality !== undefined && r.source !== "unknown",
    )
    .map((r) => ({
      source: r.source,
      url: r.url,
      quality: r.audioQuality,
      available: true,
    }));

  if (sources.length > 0) {
    const selectionResult = selectBestSource(sources);
    if (selectionResult.ok) {
      return { url: selectionResult.value.url };
    }
    // selectBestSource failed — fall back to simple lossless/bitrate comparison.
    // Return error so caller can log it (AC6: "logs a warn with the SelectionError details").
    return {
      url: computeFallbackUrl(results),
      selectionError: selectionResult.error,
    };
  }

  // No quality sources — use fallback (handles no-audioQuality or unknown-source results)
  return { url: computeFallbackUrl(results) };
};

/**
 * Accumulator for the radio batch reduce loop.
 * Tracks added artist names (intra-batch diversity) and added URLs (URL-level deduplication).
 */
type RadioAcc = {
  readonly artists: readonly string[];
  readonly urls: readonly string[];
};

/**
 * Returns true if LMS result artist plausibly matches the last.fm candidate artist.
 * Bidirectional includes-check handles: "Olivia Rodrigo feat. X" ↔ "Olivia Rodrigo",
 * case differences, and partial name matches.
 * Rejects spurious fuzzy matches (e.g. "Various Artists" for "Lisa").
 * Unicode-normalized via NFD decomposition to handle diacritics: "Björk" matches "bjork".
 */
const artistMatches = (
  resultArtist: string,
  candidateArtist: string,
): boolean => {
  const r = normalizeArtist(resultArtist);
  const c = normalizeArtist(candidateArtist);
  return r.includes(c) || c.includes(r);
};

const uniqueQueries = (queries: readonly string[]): readonly string[] => {
  return queries.reduce<readonly string[]>((acc, query) => {
    const trimmed = query.trim();
    if (trimmed === "" || acc.includes(trimmed)) {
      return acc;
    }
    return [...acc, trimmed];
  }, []);
};

const buildRadioSearchQueries = (
  artist: string,
  title: string,
): readonly string[] => {
  const normalizedTitle = title.replace(/\s*\([^)]*\)/g, " ").trim();
  return uniqueQueries([
    `${artist} ${title}`,
    `${title} ${artist}`,
    title,
    normalizedTitle,
    `${artist} ${normalizedTitle}`,
    `${normalizedTitle} ${artist}`,
  ]);
};

// Number of similar tracks to fetch from last.fm (larger pool = better filtering results)
const LASTFM_SIMILAR_LIMIT = 50;

type Logger = {
  readonly info: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly warn: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly error: (
    msg: string,
    meta?: Readonly<Record<string, unknown>>,
  ) => void;
};

export type RadioEngine = {
  readonly handleQueueEnd: (
    seedArtist: string,
    seedTitle: string,
  ) => Promise<void>;
  readonly replenishAfterRemoval: (
    seedArtist: string,
    seedTitle: string,
  ) => Promise<ReplenishOutcome>;
};

export const createRadioEngine = (
  lmsClient: LmsClient,
  lastFmClient: LastFmClient,
  io: TypedSocketIOServer,
  playerId: string,
  logger: Logger,
): RadioEngine => {
  resetRadioRuntimeState();

  const replenishRadioQueue = async (
    seedArtist: string,
    seedTitle: string,
    trigger: ReplenishTrigger,
  ): Promise<ReplenishOutcome> => {
    // Concurrency guard: proactive + stop triggers can both fire in edge cases.
    // Drop the second call while first is in progress to avoid duplicate queue adds
    // and recentArtists race conditions (Node.js is single-threaded but async yields allow re-entry).
    if (getRadioQueueState().isProcessing) {
      logger.info(
        "Radio: replenish skipped — radio operation already in progress",
        {
          event: "radio.replenish_skipped_busy",
          trigger,
          seedArtist,
          seedTitle,
        },
      );
      return { status: "skipped", reason: "already-processing" };
    }
    setRadioProcessing(true);
    // Top-level try/catch: guards against unexpected JS errors (TypeErrors, etc.).
    // AC6: radio must not crash the server. handleQueueEnd is called with void() from
    // status-poller — unhandled promise rejections are fatal in Node.js 15+.
    // Result-type errors (last.fm / LMS failures) are handled inline below.
    return Promise.resolve()
      .then(async (): Promise<ReplenishOutcome> => {
        logger.info("Radio replenish triggered", {
          event: "radio.replenish_started",
          trigger,
          seedArtist,
          seedTitle,
        });

        // Step 1: Fetch similar tracks from last.fm
        const similarResult = await lastFmClient.getSimilarTracks(
          seedArtist,
          seedTitle,
          LASTFM_SIMILAR_LIMIT,
        );
        if (!similarResult.ok) {
          if (similarResult.error.type === "CircuitOpenError") {
            logger.warn(
              "Radio: last.fm circuit open — radio temporarily unavailable",
              { event: "radio.circuit_open", trigger },
            );
            io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_RADIO_UNAVAILABLE, {
              playerId,
              message: "Radio mode temporarily unavailable",
              timestamp: Date.now(),
            } satisfies RadioUnavailablePayload);
            return {
              status: "skipped",
              reason: "lastfm-unavailable",
              unavailableEmitted: true,
            };
          }
          logger.warn("Radio: last.fm fetch failed — radio aborted", {
            event: "radio.lastfm_fetch_failed",
            trigger,
            error: similarResult.error,
            seedArtist,
            seedTitle,
          });
          return { status: "skipped", reason: "lastfm-unavailable" };
        }

        // Step 2: Map SimilarTrack → CandidateTrack
        // CandidateTrack.year + .genres enrichment was not implemented in Story 6.4 —
        // filterByContext with {} provides graceful degradation (passes all candidates)
        // when seedYear and seedGenres are absent (AC5 of Story 6.2).
        const candidates: readonly CandidateTrack[] = similarResult.value.map(
          (t) => ({
            name: t.name,
            artist: t.artist,
            mbid: t.mbid !== "" ? t.mbid : undefined,
            match: t.match,
            duration:
              t.duration !== undefined && t.duration > 0
                ? t.duration
                : undefined,
            // last.fm page URL — stored per CandidateTrack type contract;
            // LMS playback URL is determined separately by lmsClient.search()
            url: t.url,
          }),
        );

        // Step 3: Apply functional core filters
        // filterByContext gracefully passes all when no seedYear/seedGenres given
        const contextFiltered = filterByContext(candidates, {});
        const diversityFiltered = filterByDiversity(
          contextFiltered,
          getRadioQueueState().recentArtists,
          DEFAULT_DIVERSITY_CONFIG,
        );

        // Step 3.5: Exclude seed artist from candidates (AC5/AC6 Story 9.17).
        // Radio should recommend OTHER artists — the seed artist is already known to the user.
        // Uses existing artistMatches() for NFD-normalized bidirectional includes-check.
        const seedArtistFiltered = diversityFiltered.filter(
          (c) => !artistMatches(c.artist, seedArtist),
        );
        if (seedArtistFiltered.length < diversityFiltered.length) {
          logger.info("Radio: seed artist excluded from candidates", {
            event: "radio.seed_artist_excluded",
            trigger,
            seedArtist,
            excluded: diversityFiltered.length - seedArtistFiltered.length,
          });
        }

        // Step 4: Guard empty candidate list
        if (seedArtistFiltered.length === 0) {
          logger.warn("Radio: no candidates after filtering — radio aborted", {
            event: "radio.no_candidates",
            trigger,
            seedArtist,
            seedTitle,
            totalCandidates: candidates.length,
            afterContext: contextFiltered.length,
            afterDiversity: diversityFiltered.length,
            afterSeedExclusion: seedArtistFiltered.length,
          });
          return { status: "skipped", reason: "no-candidates" };
        }

        // Step 4.5: Capture pre-radio queue length for accurate radioBoundaryIndex.
        // LMS keeps previously played tracks in the queue even after mode→stop.
        // We must measure the length BEFORE adding radio tracks so the boundary marker
        // appears after the last user-queued track, not at position 0.
        const preRadioQueueResult = await lmsClient.getQueue();
        if (
          !preRadioQueueResult.ok ||
          preRadioQueueResult.value === undefined
        ) {
          const queueFetchError = preRadioQueueResult.ok
            ? "Unknown queue fetch failure"
            : (preRadioQueueResult.error?.message ??
              "Unknown queue fetch failure");
          logger.warn(
            "Radio: could not get pre-radio queue length — replenish aborted",
            {
              event: "radio.queue_length_fetch_failed",
              trigger,
              error: queueFetchError,
              seedArtist,
              seedTitle,
            },
          );
          return {
            status: "failed",
            reason: "queue-fetch-failed",
            error: queueFetchError,
          };
        }
        const preRadioQueueLength = preRadioQueueResult.value.length;

        // Step 5: Search LMS for each candidate and add to queue (sequential — avoids overwhelming LMS)
        // Process ALL diversity-filtered candidates (up to LASTFM_SIMILAR_LIMIT=50) until
        // RADIO_BATCH_SIZE tracks are added. Previously we sliced to top 5 before searching LMS,
        // which caused sparse libraries to yield 0-1 tracks even though 50 candidates were available.

        // Accumulator tracks both added artist names (for intra-batch diversity) and added URLs
        // (for URL-level deduplication — different last.fm candidates can resolve to the same track URL).
        const targetBatchSize =
          trigger === "queue-remove"
            ? RADIO_REMOVAL_REPLENISH_SIZE
            : RADIO_BATCH_SIZE;

        const { artists: addedArtists } = await seedArtistFiltered.reduce(
          async (
            accPromise: Promise<RadioAcc>,
            candidate,
          ): Promise<RadioAcc> => {
            const acc = await accPromise;

            // Batch is full — skip remaining candidates
            if (acc.artists.length >= targetBatchSize) {
              return acc;
            }

            // Skip if artist already added in this batch (NFD-normalized bidirectional match).
            // filterByDiversity only filters against state.recentArtists (previous batches).
            // On first run recentArtists = [] → all same-artist candidates pass diversity filter.
            // Uses artistMatches() for consistency with seed exclusion — handles collaboration
            // variants like "Adele" vs "Adele feat. James Brown" as the same artist.
            if (
              acc.artists.some((added) =>
                artistMatches(added, candidate.artist),
              )
            ) {
              logger.info(
                "Radio: skipping duplicate artist in batch — artist already queued in this batch",
                {
                  event: "radio.duplicate_artist_skipped",
                  trigger,
                  artist: candidate.artist,
                  title: candidate.name,
                },
              );
              return acc;
            }

            const queryResults = await buildRadioSearchQueries(
              candidate.artist,
              candidate.name,
            ).reduce<Promise<readonly SearchResult[]>>(
              async (resultPromise, query) => {
                const previousResults = await resultPromise;
                if (previousResults.length > 0) {
                  return previousResults;
                }

                const searchResult = await lmsClient.search(query);
                if (!searchResult.ok || searchResult.value.length === 0) {
                  return [];
                }

                const matchingResults = searchResult.value.filter((r) =>
                  artistMatches(r.artist, candidate.artist),
                );
                return matchingResults;
              },
              Promise.resolve([] as readonly SearchResult[]),
            );
            if (queryResults.length === 0) {
              logger.warn("Radio: track not found in LMS — skipped", {
                event: "radio.track_not_found",
                trigger,
                artist: candidate.artist,
                title: candidate.name,
              });
              return acc;
            }

            // Select best quality track using source hierarchy scoring + tie-breaking
            const selectResult = selectBestTrackUrl(queryResults);
            if (selectResult.selectionError !== undefined) {
              // AC6: log SelectionError details when source hierarchy falls back to simple comparison
              logger.warn(
                "Radio: source hierarchy selection failed — using fallback lossless/bitrate comparison",
                {
                  event: "radio.source_hierarchy_fallback",
                  trigger,
                  artist: candidate.artist,
                  title: candidate.name,
                  selectionError: selectResult.selectionError.type,
                  selectionMessage: selectResult.selectionError.message,
                },
              );
            }
            const bestUrl = selectResult.url;
            if (bestUrl === undefined) {
              logger.warn(
                "Radio: could not determine best track URL — skipped",
                {
                  event: "radio.no_best_url",
                  trigger,
                  artist: candidate.artist,
                  title: candidate.name,
                },
              );
              return acc;
            }

            // Skip if this URL was already added in this batch.
            // Different last.fm candidates can resolve to the same track URL (local or Tidal)
            // (e.g. "Lisa Dream" and "Adele When We Were Young" both match "Holiday.flac"),
            // causing duplicates that the artist-level check above cannot prevent.
            if (acc.urls.includes(bestUrl)) {
              logger.warn(
                "Radio: skipping duplicate URL — track already in queue batch",
                {
                  event: "radio.duplicate_url_skipped",
                  trigger,
                  artist: candidate.artist,
                  title: candidate.name,
                  url: bestUrl,
                },
              );
              return acc;
            }

            const addResult = await lmsClient.addToQueue(bestUrl);
            if (!addResult.ok) {
              logger.warn("Radio: addToQueue failed — skipped", {
                event: "radio.add_to_queue_failed",
                trigger,
                artist: candidate.artist,
                title: candidate.name,
                error: addResult.error,
              });
              return acc;
            }

            logger.info("Radio: track added to queue", {
              event: "radio.track_queued",
              trigger,
              artist: candidate.artist,
              title: candidate.name,
            });
            return {
              artists: [...acc.artists, candidate.artist],
              urls: [...acc.urls, bestUrl],
            };
          },
          Promise.resolve({
            artists: [] as readonly string[],
            urls: [] as readonly string[],
          }),
        );

        if (addedArtists.length === 0) {
          logger.warn("Radio: no tracks could be added to queue", {
            event: "radio.batch_empty",
            trigger,
            seedArtist,
            seedTitle,
          });
          return { status: "skipped", reason: "batch-empty" };
        }

        // Step 5b: Advance playback if the player stopped while we were adding tracks.
        // On queue-end, LMS can still consider the seed track current after stop; resume()
        // may replay that just-finished track instead of moving into the newly queued radio track.
        // nextTrack() advances onto the first appended radio item. For queue-remove replenishment,
        // we do not force playback movement because playback may still be progressing normally.
        const currentStatusResult = await lmsClient.getStatus();
        if (
          currentStatusResult.ok &&
          currentStatusResult.value?.mode === "stop"
        ) {
          const resumeResult =
            trigger === "queue-end"
              ? await lmsClient.nextTrack()
              : await lmsClient.resume();
          if (resumeResult.ok) {
            logger.info(
              trigger === "queue-end"
                ? "Radio: advanced to first radio track after queue-end stop"
                : "Radio: auto-resumed playback after adding tracks to stopped player",
              {
                event:
                  trigger === "queue-end"
                    ? "radio.auto_advanced"
                    : "radio.auto_resumed",
                trigger,
                seedArtist,
                seedTitle,
              },
            );
          } else {
            logger.warn(
              trigger === "queue-end"
                ? "Radio: could not advance to first radio track — player remains stopped"
                : "Radio: auto-resume failed — player remains stopped",
              {
                event:
                  trigger === "queue-end"
                    ? "radio.auto_advance_failed"
                    : "radio.auto_resume_failed",
                trigger,
                error: resumeResult.error,
                seedArtist,
                seedTitle,
              },
            );
          }
        } else if (!currentStatusResult.ok) {
          logger.warn(
            "Radio: could not check player status for auto-resume — skipping",
            {
              event: "radio.status_check_failed",
              trigger,
              error: currentStatusResult.error,
              seedArtist,
              seedTitle,
            },
          );
        }

        // Step 6: Update sliding window state
        const nextRecentArtists = addedArtists.reduce(
          (window, artist) =>
            addToSlidingWindow(
              window,
              artist,
              DEFAULT_DIVERSITY_CONFIG.windowSize,
            ),
          getRadioQueueState().recentArtists,
        );
        setRadioRecentArtists(nextRecentArtists);

        // Step 7: Fetch updated queue and emit player.queue.updated
        const queueResult = await lmsClient.getQueue();
        if (!queueResult.ok || queueResult.value === undefined) {
          const queueRefreshError = queueResult.ok
            ? "Unknown queue refresh failure"
            : (queueResult.error?.message ?? "Unknown queue refresh failure");
          logger.warn(
            "Radio: could not fetch updated queue — replenish failed after add",
            {
              event: "radio.queue_fetch_failed",
              trigger,
              error: queueRefreshError,
              seedArtist,
              seedTitle,
            },
          );
          return {
            status: "failed",
            reason: "queue-fetch-failed",
            error: queueRefreshError,
          };
        }

        setRadioBoundaryIndex(preRadioQueueLength);
        io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
          playerId,
          tracks: queueResult.value,
          radioBoundaryIndex: preRadioQueueLength,
          timestamp: Date.now(),
        });

        logger.info("Radio replenish succeeded", {
          event: "radio.replenish_succeeded",
          trigger,
          seedArtist,
          seedTitle,
          tracksAdded: addedArtists.length,
          radioBoundaryIndex: preRadioQueueLength,
        });

        return {
          status: "success",
          preRadioQueueLength,
          postQueueTracks: queueResult.value,
          tracksAdded: addedArtists.length,
        };
      })
      .catch((error: unknown): ReplenishOutcome => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          "Radio: unexpected error in replenish flow — radio aborted",
          {
            event: "radio.unexpected_error",
            trigger,
            error: message,
            seedArtist,
            seedTitle,
          },
        );
        return {
          status: "failed",
          reason: "unexpected-error",
          error: message,
        };
      })
      .finally(() => {
        setRadioProcessing(false);
      });
  };

  const handleQueueEnd = async (
    seedArtist: string,
    seedTitle: string,
  ): Promise<void> => {
    const replenishResult = await replenishRadioQueue(
      seedArtist,
      seedTitle,
      "queue-end",
    );

    if (replenishResult.status !== "success") {
      return;
    }

    // Step 8: Emit player.radio.started
    io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_RADIO_STARTED, {
      playerId,
      seedTrack: { artist: seedArtist, title: seedTitle },
      tracksAdded: replenishResult.tracksAdded,
      timestamp: Date.now(),
    });

    logger.info("Radio mode started successfully", {
      event: "radio.started",
      seedArtist,
      seedTitle,
      tracksAdded: replenishResult.tracksAdded,
    });
  };

  const replenishAfterRemoval = async (
    seedArtist: string,
    seedTitle: string,
  ): Promise<ReplenishOutcome> => {
    return replenishRadioQueue(seedArtist, seedTitle, "queue-remove");
  };

  return { handleQueueEnd, replenishAfterRemoval };
};
