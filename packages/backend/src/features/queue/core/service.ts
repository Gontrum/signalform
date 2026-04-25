import { err, ok, type Result } from "@signalform/shared";
import type { QueueError } from "./types.js";

type QueueMutationCommand =
  | {
      readonly type: "remove";
      readonly trackIndex: number;
    }
  | {
      readonly type: "reorder";
      readonly fromIndex: number;
      readonly toIndex: number;
    };

const isValidTrackIndex = (value: number): boolean => {
  return Number.isInteger(value) && value >= 0 && value <= 9999;
};

export const createRemoveQueueCommand = (
  trackIndex: number,
): Result<QueueMutationCommand, QueueError> => {
  if (!isValidTrackIndex(trackIndex)) {
    return err({
      type: "InvalidInput",
      message: "trackIndex must be a non-negative integer",
    });
  }

  return ok({
    type: "remove",
    trackIndex,
  });
};

export const createReorderQueueCommand = (
  fromIndex: number,
  toIndex: number,
): Result<QueueMutationCommand, QueueError> => {
  if (!isValidTrackIndex(fromIndex)) {
    return err({
      type: "InvalidInput",
      message: "fromIndex must be a non-negative integer",
    });
  }

  if (!isValidTrackIndex(toIndex)) {
    return err({
      type: "InvalidInput",
      message: "toIndex must be a non-negative integer",
    });
  }

  if (fromIndex === toIndex) {
    return err({
      type: "InvalidInput",
      message: "fromIndex and toIndex must be different",
    });
  }

  return ok({
    type: "reorder",
    fromIndex,
    toIndex,
  });
};
