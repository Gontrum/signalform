import type { FastifyRequest, FastifyReply } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { recordUserTransportCommand } from "../../../infrastructure/transport-commands.js";

const countAppended = async (
  lmsClient: LmsClient,
  urls: readonly string[],
): Promise<number> =>
  await urls.reduce<Promise<number>>(async (prev, url) => {
    const appended = await prev;
    const result = await lmsClient.addToQueue(url);
    return result.ok ? appended + 1 : appended;
  }, Promise.resolve(0));

/**
 * Resolves to the number of tracks actually in the queue, or to a reply that
 * has already been sent when play or savePlaylist failed outright. A track
 * that fails to append is not fatal — the queue is short, not broken.
 */
export const playQueueAndMaybeSave = async (
  request: FastifyRequest,
  reply: FastifyReply,
  lmsClient: LmsClient,
  playableUrls: readonly string[],
  name: string | undefined,
): Promise<FastifyReply | number> => {
  recordUserTransportCommand();
  const playResult = await lmsClient.play(playableUrls[0]!);
  if (!playResult.ok) {
    return sendLmsError(
      reply,
      request,
      playResult.error,
      getUserFriendlyErrorMessage,
      "LMS play failed during playlist import",
    );
  }

  const rest = playableUrls.slice(1);
  const appended = await countAppended(lmsClient, rest);
  if (appended < rest.length) {
    request.log.warn(
      { appended, attempted: rest.length },
      "LMS addToQueue failed for some tracks during playlist import",
    );
  }

  if (name !== undefined) {
    const saveResult = await lmsClient.savePlaylist(name);
    if (!saveResult.ok) {
      return sendLmsError(
        reply,
        request,
        saveResult.error,
        getUserFriendlyErrorMessage,
        "LMS savePlaylist failed during playlist import",
      );
    }
  }

  return appended + 1;
};
