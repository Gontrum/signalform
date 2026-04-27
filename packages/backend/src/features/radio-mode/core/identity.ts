import type { QueueTrack } from "@signalform/shared";
import type { SearchResult } from "../../../adapters/lms-client/index.js";

const normalizeIdentityPart = (value: string | undefined): string =>
  (value ?? "").trim().toLowerCase();

export const getQueueTrackSignature = (track: QueueTrack): string =>
  [
    track.id,
    normalizeIdentityPart(track.title),
    normalizeIdentityPart(track.artist),
    normalizeIdentityPart(track.album),
    track.source ?? "",
  ].join("::");

export const getQueueTrackRepeatKey = (track: {
  readonly title: string;
  readonly artist: string;
}): string =>
  [
    normalizeIdentityPart(track.artist),
    normalizeIdentityPart(track.title),
  ].join("::");

export const getSearchResultRepeatKey = (result: SearchResult): string =>
  [
    normalizeIdentityPart(result.artist),
    normalizeIdentityPart(result.title),
  ].join("::");
