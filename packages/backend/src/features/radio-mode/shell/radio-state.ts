/**
 * Imperative Shell state persistence for the radio boundary index.
 * Used by server.ts route handlers to track radioBoundaryIndex for `player.queue.updated` events.
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

import type { QueueTrack } from "@signalform/shared";
import {
  appendRadioQueueEntries,
  createRadioQueueEntriesFromTracks,
  moveRadioQueueEntry,
  projectRadioQueueTracks,
  reconcileRadioQueueEntries,
  removeRadioQueueEntryAtPosition,
  type RadioQueueEntry,
} from "../core/provenance.js";

type RadioQueueProjection = {
  readonly tracks: readonly QueueTrack[];
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex: number | null;
};

type SuppressionStatus = {
  readonly mode: "play" | "pause" | "stop";
  readonly currentTrack?: {
    readonly id: string;
  };
  readonly queuePreview?: readonly unknown[];
};

type SuppressedQueueEnd = {
  readonly trackId: string;
  readonly artist: string;
  readonly title: string;
};

type RadioQueueState = {
  readonly isEnabled: boolean;
  readonly requestedEnabledState?: boolean | undefined;
  readonly radioBoundaryIndex: number | null;
  readonly radioQueueEntries: readonly RadioQueueEntry[];
  readonly recentArtists: readonly string[];
  readonly isProcessing: boolean;
  readonly suppressedQueueEnd?: SuppressedQueueEnd | undefined;
};

const INITIAL_STATE: RadioQueueState = {
  isEnabled: true,
  requestedEnabledState: undefined,
  radioBoundaryIndex: null,
  radioQueueEntries: [],
  recentArtists: [],
  isProcessing: false,
  suppressedQueueEnd: undefined,
};

type RadioState = {
  readonly get: () => RadioQueueState;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setRequestedEnabledState: (enabled: boolean | undefined) => void;
  readonly setBoundaryIndex: (index: number | null) => void;
  readonly setQueueEntries: (queueEntries: readonly RadioQueueEntry[]) => void;
  readonly setRecentArtists: (artists: readonly string[]) => void;
  readonly setProcessing: (processing: boolean) => void;
  readonly setSuppressedQueueEnd: (
    suppression: SuppressedQueueEnd | undefined,
  ) => void;
  readonly reset: () => void;
};

const createRadioState = (): RadioState => {
  const ref = { current: INITIAL_STATE };
  return {
    get: (): RadioQueueState => ref.current,
    setEnabled: (isEnabled: boolean): void => {
      ref.current = { ...ref.current, isEnabled };
    },
    setRequestedEnabledState: (
      requestedEnabledState: boolean | undefined,
    ): void => {
      ref.current = { ...ref.current, requestedEnabledState };
    },
    setBoundaryIndex: (radioBoundaryIndex: number | null): void => {
      ref.current = { ...ref.current, radioBoundaryIndex };
    },
    setQueueEntries: (radioQueueEntries: readonly RadioQueueEntry[]): void => {
      ref.current = { ...ref.current, radioQueueEntries };
    },
    setRecentArtists: (recentArtists: readonly string[]): void => {
      ref.current = { ...ref.current, recentArtists };
    },
    setProcessing: (isProcessing: boolean): void => {
      ref.current = { ...ref.current, isProcessing };
    },
    setSuppressedQueueEnd: (
      suppressedQueueEnd: SuppressedQueueEnd | undefined,
    ): void => {
      ref.current = { ...ref.current, suppressedQueueEnd };
    },
    reset: (): void => {
      ref.current = INITIAL_STATE;
    },
  };
};

const radioState = createRadioState();

export const getRadioQueueState = (): RadioQueueState => radioState.get();
export const setRadioModeEnabledState = (isEnabled: boolean): void =>
  radioState.setEnabled(isEnabled);
export const setRequestedRadioModeEnabledState = (
  requestedEnabledState: boolean | undefined,
): void => radioState.setRequestedEnabledState(requestedEnabledState);
export const isRadioModeEnabledForReplenishment = (): boolean => {
  const { isEnabled, requestedEnabledState } = getRadioQueueState();
  return requestedEnabledState ?? isEnabled;
};
export const setRadioBoundaryIndex = (
  radioBoundaryIndex: number | null,
): void => {
  radioState.setBoundaryIndex(radioBoundaryIndex);
  if (radioBoundaryIndex === null) {
    radioState.setQueueEntries([]);
  }
};
export const setRadioQueueEntries = (
  radioQueueEntries: readonly RadioQueueEntry[],
): void => radioState.setQueueEntries(radioQueueEntries);
export const resetRadioRuntimeState = (): void => radioState.reset();
export const setRadioRecentArtists = (recentArtists: readonly string[]): void =>
  radioState.setRecentArtists(recentArtists);
export const setRadioProcessing = (isProcessing: boolean): void =>
  radioState.setProcessing(isProcessing);
export const setSuppressedQueueEnd = (
  suppression: SuppressedQueueEnd | undefined,
): void => radioState.setSuppressedQueueEnd(suppression);
export const clearRadioQueueRuntimeState = (): void => {
  radioState.setBoundaryIndex(null);
  radioState.setQueueEntries([]);
  radioState.setRecentArtists([]);
  radioState.setSuppressedQueueEnd(undefined);
  radioState.setRequestedEnabledState(undefined);
};

const matchesSuppressedQueueEnd = (
  track: {
    readonly trackId: string;
    readonly artist: string;
    readonly title: string;
  },
  suppressedQueueEnd: SuppressedQueueEnd | undefined,
): boolean =>
  suppressedQueueEnd?.trackId === track.trackId &&
  suppressedQueueEnd.artist === track.artist &&
  suppressedQueueEnd.title === track.title;

export const shouldSuppressQueueEnd = (track: {
  readonly trackId: string;
  readonly artist: string;
  readonly title: string;
}): boolean =>
  matchesSuppressedQueueEnd(track, getRadioQueueState().suppressedQueueEnd);

export const clearSuppressedQueueEnd = (): void => {
  radioState.setSuppressedQueueEnd(undefined);
};

const shouldClearSuppressedQueueEnd = (
  previousStatus: SuppressionStatus | null,
  currentStatus: SuppressionStatus,
  suppressionTrackId: string,
): boolean => {
  const currentTrackId = currentStatus.currentTrack?.id;
  const previousTrackId = previousStatus?.currentTrack?.id;
  const currentQueuePreviewLength = currentStatus.queuePreview?.length ?? 0;
  const previousQueuePreviewLength = previousStatus?.queuePreview?.length ?? 0;
  const suppressionTrackStillActive =
    currentTrackId === suppressionTrackId ||
    previousTrackId === suppressionTrackId;
  const playbackMovedToDifferentCurrentTrack =
    currentTrackId !== undefined && currentTrackId !== suppressionTrackId;
  const newPlaybackSessionStarted =
    previousStatus?.mode === "stop" && currentStatus.mode === "play";
  const queueRegrewAfterDrain =
    previousStatus !== null &&
    previousQueuePreviewLength === 0 &&
    currentQueuePreviewLength > 0;

  return (
    queueRegrewAfterDrain ||
    playbackMovedToDifferentCurrentTrack ||
    newPlaybackSessionStarted ||
    (currentStatus.mode === "stop" && previousStatus?.mode === "stop") ||
    !suppressionTrackStillActive
  );
};

export const reconcileSuppressedQueueEnd = (
  previousStatus: SuppressionStatus | null,
  currentStatus: SuppressionStatus,
): void => {
  const suppression = getRadioQueueState().suppressedQueueEnd;
  if (
    suppression !== undefined &&
    shouldClearSuppressedQueueEnd(
      previousStatus,
      currentStatus,
      suppression.trackId,
    )
  ) {
    clearSuppressedQueueEnd();
  }
};

const applyProjectedEntries = (
  projection: ReturnType<typeof projectRadioQueueTracks>,
): RadioQueueProjection => {
  setRadioQueueEntries(projection.entries);
  setRadioBoundaryIndex(projection.radioBoundaryIndex);

  return {
    tracks: projection.tracks,
    radioModeActive: getRadioQueueState().isEnabled,
    radioBoundaryIndex: projection.radioBoundaryIndex,
  };
};

export const annotateRadioQueueTracks = (
  tracks: readonly QueueTrack[],
): RadioQueueProjection => {
  const storedRadioQueueEntries = getRadioQueueState().radioQueueEntries;
  return applyProjectedEntries(
    projectRadioQueueTracks(
      tracks,
      storedRadioQueueEntries.length > 0
        ? storedRadioQueueEntries
        : createRadioQueueEntriesFromTracks(tracks),
    ),
  );
};

export const recordExplicitRadioTracks = (
  tracks: readonly QueueTrack[],
  appendedRadioTrackRepeatKeys: readonly string[],
): RadioQueueProjection => {
  const nextRadioQueueEntries = appendRadioQueueEntries(
    tracks,
    getRadioQueueState().radioQueueEntries,
    appendedRadioTrackRepeatKeys,
  );
  const projection = projectRadioQueueTracks(tracks, nextRadioQueueEntries);
  return applyProjectedEntries(projection);
};

export const recordQueueRemoval = (
  tracks: readonly QueueTrack[],
  removedPosition: number,
): RadioQueueProjection => {
  if (getRadioQueueState().radioQueueEntries.length === 0) {
    return annotateRadioQueueTracks(tracks);
  }

  const nextEntries = reconcileRadioQueueEntries(
    tracks,
    removeRadioQueueEntryAtPosition(
      getRadioQueueState().radioQueueEntries,
      removedPosition,
    ),
  );
  return applyProjectedEntries(projectRadioQueueTracks(tracks, nextEntries));
};

export const recordQueueReorder = (
  tracks: readonly QueueTrack[],
  fromPosition: number,
  toPosition: number,
): RadioQueueProjection => {
  if (getRadioQueueState().radioQueueEntries.length === 0) {
    return annotateRadioQueueTracks(tracks);
  }

  const nextEntries = reconcileRadioQueueEntries(
    tracks,
    moveRadioQueueEntry(
      getRadioQueueState().radioQueueEntries,
      fromPosition,
      toPosition,
    ),
  );
  return applyProjectedEntries(projectRadioQueueTracks(tracks, nextEntries));
};
