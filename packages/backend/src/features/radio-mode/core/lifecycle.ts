import type { QueueTrack } from "@signalform/shared";
import { getQueueTrackSignature } from "./identity.js";

type SignatureCounts = Readonly<Record<string, number>>;

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

const isUpcomingRadioTrack = (
  track: QueueTrack,
  index: number,
  currentIndex: number,
  availableRadioTrackCounts: SignatureCounts,
): readonly [boolean, SignatureCounts] => {
  const isAfterCurrent = currentIndex < 0 || index > currentIndex;
  const signature = getQueueTrackSignature(track);
  const availableCount = getSignatureCount(
    availableRadioTrackCounts,
    signature,
  );

  if (availableCount <= 0 || track.isCurrent || !isAfterCurrent) {
    return [false, availableRadioTrackCounts];
  }

  return [true, decrementSignatureCount(availableRadioTrackCounts, signature)];
};

export const getUpcomingRadioRemovalIndexes = (
  tracks: readonly QueueTrack[],
  radioTrackSignatures: readonly string[],
): readonly number[] => {
  const currentIndex = tracks.findIndex((track) => track.isCurrent);
  const availableRadioTrackCounts =
    radioTrackSignatures.reduce<SignatureCounts>(
      (counts, signature) => incrementSignatureCount(counts, signature),
      {},
    );

  return tracks.reduceRight<{
    readonly indexes: readonly number[];
    readonly availableRadioTrackCounts: SignatureCounts;
  }>(
    (state, track, index) => {
      const [isUpcomingRadio, nextAvailableCounts] = isUpcomingRadioTrack(
        track,
        index,
        currentIndex,
        state.availableRadioTrackCounts,
      );

      return isUpcomingRadio
        ? {
            indexes: [...state.indexes, index],
            availableRadioTrackCounts: nextAvailableCounts,
          }
        : {
            indexes: state.indexes,
            availableRadioTrackCounts: nextAvailableCounts,
          };
    },
    {
      indexes: [],
      availableRadioTrackCounts,
    },
  ).indexes;
};
