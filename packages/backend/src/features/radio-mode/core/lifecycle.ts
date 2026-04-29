import type { QueueTrack } from "@signalform/shared";
import {
  reconcileRadioQueueEntries,
  type RadioQueueEntry,
} from "./provenance.js";

export const getUpcomingRadioRemovalIndexes = (
  tracks: readonly QueueTrack[],
  radioQueueEntries: readonly RadioQueueEntry[],
): readonly number[] => {
  const currentPosition =
    tracks.find((track) => track.isCurrent)?.position ?? 0;
  const upcomingEntries = reconcileRadioQueueEntries(tracks, radioQueueEntries)
    .filter((entry) => entry.position > currentPosition)
    .sort((left, right) => right.position - left.position);

  return upcomingEntries.map((entry) => entry.position - 1);
};
