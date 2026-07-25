/**
 * LMS Queue Helpers
 *
 * Shared shell-facing helper for sequentially adding a list of track URLs to
 * the LMS queue, stopping at the first failure. Used by the queue and
 * playback route handlers, which each add their own error handling around
 * the result.
 */

import { ok, type Result } from "@signalform/shared";
import type { LmsClient } from "./client.js";
import type { LmsError } from "./types.js";

export const addUrlsSequentially = async (
  lmsClient: LmsClient,
  urls: readonly string[],
): Promise<Result<void, LmsError>> =>
  urls.reduce<Promise<Result<void, LmsError>>>(
    async (prevPromise, url) => {
      const prev = await prevPromise;
      if (!prev.ok) {
        return prev;
      }
      return lmsClient.addToQueue(url);
    },
    Promise.resolve(ok(undefined)),
  );
