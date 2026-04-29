import type { QueueTrack } from "@signalform/shared";
import { getQueueTrackRepeatKey, getQueueTrackSignature } from "./identity.js";

export type RadioQueueEntry = {
  readonly position: number;
  readonly repeatKey: string;
  readonly signature: string;
};

type ClaimedPositions = Readonly<Record<number, true>>;

const sortEntriesByPosition = (
  entries: readonly RadioQueueEntry[],
): readonly RadioQueueEntry[] =>
  [...entries].sort((left, right) => left.position - right.position);

const claimPosition = (
  claimedPositions: ClaimedPositions,
  position: number,
): ClaimedPositions => ({
  ...claimedPositions,
  [position]: true,
});

const isClaimed = (
  claimedPositions: ClaimedPositions,
  position: number,
): boolean => claimedPositions[position] === true;

const isEntryMatch = (track: QueueTrack, entry: RadioQueueEntry): boolean =>
  getQueueTrackSignature(track) === entry.signature ||
  getQueueTrackRepeatKey(track) === entry.repeatKey;

const reconcileEntry = (
  tracks: readonly QueueTrack[],
  entry: RadioQueueEntry,
  claimedPositions: ClaimedPositions,
): RadioQueueEntry | null => {
  const trackAtStoredPosition = tracks.find(
    (track) => track.position === entry.position,
  );
  if (
    trackAtStoredPosition !== undefined &&
    !isClaimed(claimedPositions, entry.position) &&
    isEntryMatch(trackAtStoredPosition, entry)
  ) {
    return {
      position: entry.position,
      repeatKey: getQueueTrackRepeatKey(trackAtStoredPosition),
      signature: getQueueTrackSignature(trackAtStoredPosition),
    };
  }

  const laterFallbackTrack = tracks.find(
    (track) =>
      track.position > entry.position &&
      !isClaimed(claimedPositions, track.position) &&
      isEntryMatch(track, entry),
  );

  if (laterFallbackTrack !== undefined) {
    return {
      position: laterFallbackTrack.position,
      repeatKey: getQueueTrackRepeatKey(laterFallbackTrack),
      signature: getQueueTrackSignature(laterFallbackTrack),
    };
  }

  const earlierFallbackTrack = [...tracks]
    .reverse()
    .find(
      (track) =>
        track.position < entry.position &&
        !isClaimed(claimedPositions, track.position) &&
        isEntryMatch(track, entry),
    );

  if (earlierFallbackTrack === undefined) {
    return null;
  }

  return {
    position: earlierFallbackTrack.position,
    repeatKey: getQueueTrackRepeatKey(earlierFallbackTrack),
    signature: getQueueTrackSignature(earlierFallbackTrack),
  };
};

export const reconcileRadioQueueEntries = (
  tracks: readonly QueueTrack[],
  entries: readonly RadioQueueEntry[],
): readonly RadioQueueEntry[] =>
  sortEntriesByPosition(entries).reduce<{
    readonly claimedPositions: ClaimedPositions;
    readonly entries: readonly RadioQueueEntry[];
  }>(
    (state, entry) => {
      const reconciledEntry = reconcileEntry(
        tracks,
        entry,
        state.claimedPositions,
      );

      if (reconciledEntry === null) {
        return state;
      }

      return {
        claimedPositions: claimPosition(
          state.claimedPositions,
          reconciledEntry.position,
        ),
        entries: [...state.entries, reconciledEntry],
      };
    },
    { claimedPositions: {}, entries: [] },
  ).entries;

export const createRadioQueueEntriesFromTracks = (
  tracks: readonly QueueTrack[],
): readonly RadioQueueEntry[] =>
  tracks
    .filter((track) => track.addedBy === "radio")
    .map((track) => ({
      position: track.position,
      repeatKey: getQueueTrackRepeatKey(track),
      signature: getQueueTrackSignature(track),
    }));

export const appendRadioQueueEntries = (
  tracks: readonly QueueTrack[],
  existingEntries: readonly RadioQueueEntry[],
  appendedRepeatKeys: readonly string[],
): readonly RadioQueueEntry[] => {
  const reconciledEntries = reconcileRadioQueueEntries(tracks, existingEntries);
  const claimedPositions = reconciledEntries.reduce<ClaimedPositions>(
    (state, entry) => claimPosition(state, entry.position),
    {},
  );

  const appendedEntries = [...appendedRepeatKeys].reverse().reduce<{
    readonly claimedPositions: ClaimedPositions;
    readonly entries: readonly RadioQueueEntry[];
  }>(
    (state, repeatKey) => {
      const matchingTrack = [...tracks]
        .reverse()
        .find(
          (track) =>
            !isClaimed(state.claimedPositions, track.position) &&
            getQueueTrackRepeatKey(track) === repeatKey,
        );

      if (matchingTrack === undefined) {
        return state;
      }

      const entry: RadioQueueEntry = {
        position: matchingTrack.position,
        repeatKey: getQueueTrackRepeatKey(matchingTrack),
        signature: getQueueTrackSignature(matchingTrack),
      };

      return {
        claimedPositions: claimPosition(state.claimedPositions, entry.position),
        entries: [entry, ...state.entries],
      };
    },
    { claimedPositions, entries: [] },
  ).entries;

  return sortEntriesByPosition([...reconciledEntries, ...appendedEntries]);
};

export const removeRadioQueueEntryAtPosition = (
  entries: readonly RadioQueueEntry[],
  removedPosition: number,
): readonly RadioQueueEntry[] =>
  entries.flatMap((entry) => {
    if (entry.position === removedPosition) {
      return [];
    }

    if (entry.position > removedPosition) {
      return [{ ...entry, position: entry.position - 1 }];
    }

    return [entry];
  });

export const moveRadioQueueEntry = (
  entries: readonly RadioQueueEntry[],
  fromPosition: number,
  toPosition: number,
): readonly RadioQueueEntry[] =>
  sortEntriesByPosition(
    entries.map((entry) => {
      if (entry.position === fromPosition) {
        return { ...entry, position: toPosition };
      }

      if (fromPosition < toPosition) {
        if (entry.position > fromPosition && entry.position <= toPosition) {
          return { ...entry, position: entry.position - 1 };
        }
        return entry;
      }

      if (entry.position >= toPosition && entry.position < fromPosition) {
        return { ...entry, position: entry.position + 1 };
      }

      return entry;
    }),
  );

export const projectRadioQueueTracks = (
  tracks: readonly QueueTrack[],
  entries: readonly RadioQueueEntry[],
): {
  readonly tracks: readonly QueueTrack[];
  readonly radioBoundaryIndex: number | null;
  readonly entries: readonly RadioQueueEntry[];
} => {
  const reconciledEntries = reconcileRadioQueueEntries(tracks, entries);
  const radioPositions = reconciledEntries.reduce<
    Readonly<Record<number, true>>
  >(
    (state, entry) => ({
      ...state,
      [entry.position]: true,
    }),
    {},
  );

  const projectedTracks = tracks.map((track) => ({
    ...track,
    addedBy:
      radioPositions[track.position] === true
        ? ("radio" as const)
        : ("user" as const),
  }));
  const firstRadioIndex = projectedTracks.findIndex(
    (track) => track.addedBy === "radio",
  );

  return {
    tracks: projectedTracks,
    radioBoundaryIndex: firstRadioIndex >= 0 ? firstRadioIndex : null,
    entries: reconciledEntries,
  };
};
