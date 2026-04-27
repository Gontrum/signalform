/**
 * Imperative Shell state persistence for the radio boundary index.
 * Used by server.ts route handlers to track radioBoundaryIndex for `player.queue.updated` events.
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

import type { QueueTrack } from "@signalform/shared";
import { getQueueTrackSignature } from "../core/identity.js";

type RadioQueueProjection = {
  readonly tracks: readonly QueueTrack[];
  readonly radioModeActive: boolean;
  readonly radioBoundaryIndex: number | null;
};

type RadioQueueState = {
  readonly isEnabled: boolean;
  readonly radioBoundaryIndex: number | null;
  readonly radioTrackSignatures: readonly string[];
  readonly recentArtists: readonly string[];
  readonly isProcessing: boolean;
};

type SignatureCounts = Readonly<Record<string, number>>;

const INITIAL_STATE: RadioQueueState = {
  isEnabled: true,
  radioBoundaryIndex: null,
  radioTrackSignatures: [],
  recentArtists: [],
  isProcessing: false,
};

type RadioState = {
  readonly get: () => RadioQueueState;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setBoundaryIndex: (index: number | null) => void;
  readonly setTrackSignatures: (trackSignatures: readonly string[]) => void;
  readonly setRecentArtists: (artists: readonly string[]) => void;
  readonly setProcessing: (processing: boolean) => void;
  readonly reset: () => void;
};

const createRadioState = (): RadioState => {
  const ref = { current: INITIAL_STATE };
  return {
    get: (): RadioQueueState => ref.current,
    setEnabled: (isEnabled: boolean): void => {
      ref.current = { ...ref.current, isEnabled };
    },
    setBoundaryIndex: (radioBoundaryIndex: number | null): void => {
      ref.current = { ...ref.current, radioBoundaryIndex };
    },
    setTrackSignatures: (radioTrackSignatures: readonly string[]): void => {
      ref.current = { ...ref.current, radioTrackSignatures };
    },
    setRecentArtists: (recentArtists: readonly string[]): void => {
      ref.current = { ...ref.current, recentArtists };
    },
    setProcessing: (isProcessing: boolean): void => {
      ref.current = { ...ref.current, isProcessing };
    },
    reset: (): void => {
      ref.current = INITIAL_STATE;
    },
  };
};

const radioState = createRadioState();

const getSignatureCount = (
  counts: SignatureCounts,
  signature: string,
): number => counts[signature] ?? 0;

const incrementSignatureCount = (
  counts: SignatureCounts,
  signature: string,
): SignatureCounts => ({
  ...counts,
  [signature]: getSignatureCount(counts, signature) + 1,
});

const decrementSignatureCount = (
  counts: SignatureCounts,
  signature: string,
): SignatureCounts => {
  const nextCount = getSignatureCount(counts, signature) - 1;
  return nextCount > 0
    ? { ...counts, [signature]: nextCount }
    : Object.fromEntries(
        Object.entries(counts).filter(([key]) => key !== signature),
      );
};

const getPresentRadioTrackSignatures = (
  tracks: readonly QueueTrack[],
  radioTrackSignatures: readonly string[],
): readonly string[] => {
  const availableCounts = tracks.reduce<SignatureCounts>(
    (counts, track) =>
      incrementSignatureCount(counts, getQueueTrackSignature(track)),
    {},
  );

  return radioTrackSignatures.reduce<{
    readonly availableCounts: SignatureCounts;
    readonly present: readonly string[];
  }>(
    (state, signature) => {
      const remaining = getSignatureCount(state.availableCounts, signature);
      if (remaining <= 0) {
        return state;
      }

      return {
        availableCounts: decrementSignatureCount(
          state.availableCounts,
          signature,
        ),
        present: [...state.present, signature],
      };
    },
    {
      availableCounts,
      present: [],
    },
  ).present;
};

const consumeRadioTrackSignatures = (
  tracks: readonly QueueTrack[],
  radioTrackSignatures: readonly string[],
): readonly boolean[] => {
  const availableCounts = radioTrackSignatures.reduce<SignatureCounts>(
    (counts, signature) => incrementSignatureCount(counts, signature),
    {},
  );

  return tracks.reduceRight<{
    readonly availableCounts: SignatureCounts;
    readonly isRadioTrack: readonly boolean[];
  }>(
    (state, track, index) => {
      const signature = getQueueTrackSignature(track);
      const remaining = getSignatureCount(state.availableCounts, signature);
      if (remaining <= 0) {
        return state;
      }

      return {
        availableCounts: decrementSignatureCount(
          state.availableCounts,
          signature,
        ),
        isRadioTrack: state.isRadioTrack.map((value, currentIndex) =>
          currentIndex === index ? true : value,
        ),
      };
    },
    {
      availableCounts,
      isRadioTrack: tracks.map(() => false),
    },
  ).isRadioTrack;
};

const buildRadioQueueProjection = (
  tracks: readonly QueueTrack[],
  radioTrackSignatures: readonly string[],
): RadioQueueProjection => {
  const isRadioTrack = consumeRadioTrackSignatures(
    tracks,
    radioTrackSignatures,
  );
  const radioBoundaryIndex = isRadioTrack.findIndex(Boolean);

  return {
    tracks: tracks.map((track, index) => ({
      ...track,
      addedBy: isRadioTrack[index] ? "radio" : "user",
    })),
    radioModeActive: getRadioQueueState().isEnabled,
    radioBoundaryIndex: radioBoundaryIndex >= 0 ? radioBoundaryIndex : null,
  };
};

export const getRadioQueueState = (): RadioQueueState => radioState.get();
export const setRadioModeEnabledState = (isEnabled: boolean): void =>
  radioState.setEnabled(isEnabled);
export const setRadioBoundaryIndex = (
  radioBoundaryIndex: number | null,
): void => {
  radioState.setBoundaryIndex(radioBoundaryIndex);
  if (radioBoundaryIndex === null) {
    radioState.setTrackSignatures([]);
  }
};
export const setRadioTrackSignatures = (
  radioTrackSignatures: readonly string[],
): void => radioState.setTrackSignatures(radioTrackSignatures);
export const resetRadioRuntimeState = (): void => radioState.reset();
export const setRadioRecentArtists = (recentArtists: readonly string[]): void =>
  radioState.setRecentArtists(recentArtists);
export const setRadioProcessing = (isProcessing: boolean): void =>
  radioState.setProcessing(isProcessing);

export const annotateRadioQueueTracks = (
  tracks: readonly QueueTrack[],
): RadioQueueProjection => {
  const presentRadioTrackSignatures = getPresentRadioTrackSignatures(
    tracks,
    getRadioQueueState().radioTrackSignatures,
  );
  const projection = buildRadioQueueProjection(
    tracks,
    presentRadioTrackSignatures,
  );

  setRadioTrackSignatures(presentRadioTrackSignatures);
  setRadioBoundaryIndex(projection.radioBoundaryIndex);

  return projection;
};

export const recordRadioQueueBoundary = (
  tracks: readonly QueueTrack[],
  radioBoundaryIndex: number | null,
): RadioQueueProjection => {
  if (radioBoundaryIndex === null) {
    setRadioTrackSignatures([]);
    setRadioBoundaryIndex(null);
    return buildRadioQueueProjection(tracks, []);
  }

  const presentRadioTrackSignatures = getPresentRadioTrackSignatures(
    tracks,
    getRadioQueueState().radioTrackSignatures,
  );
  const appendedRadioTrackSignatures = tracks
    .slice(radioBoundaryIndex)
    .map((track) => getQueueTrackSignature(track));
  const nextRadioTrackSignatures = [
    ...presentRadioTrackSignatures,
    ...appendedRadioTrackSignatures,
  ];
  const projection = buildRadioQueueProjection(
    tracks,
    nextRadioTrackSignatures,
  );

  setRadioTrackSignatures(nextRadioTrackSignatures);
  setRadioBoundaryIndex(projection.radioBoundaryIndex);

  return projection;
};
