/**
 * Failure reporting for the four playlist commands that write to disk
 * (`playlist save`, `playlists rename`, `playlists delete`, `playlists edit`).
 *
 * Measured on LMS 9.1.1: with the `playlistdir` pref empty, LMS drops the HTTP
 * connection on every one of them without answering and logs "Bad Lyrion Music
 * Server config" internally. The adapter sees only `fetch failed`, so without
 * this the user is told the music server is unreachable while it is serving
 * every read request just fine.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  LmsClient,
  LmsError,
} from "../../../adapters/lms-client/index.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";

/**
 * 409 rather than 503 or 400: the server is up and the request is well formed,
 * the write conflicts with the server's own configuration. Nothing the caller
 * can fix by retrying or by sending different input — someone has to set the
 * folder in LMS.
 */
const PLAYLIST_DIR_NOT_CONFIGURED_STATUS = 409;

const PLAYLIST_DIR_NOT_CONFIGURED_ERROR = "PLAYLIST_DIR_NOT_CONFIGURED";

const PLAYLIST_DIR_NOT_CONFIGURED_MESSAGE =
  "Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.";

type PlaylistDirProbe = Pick<LmsClient, "getPlaylistDir">;

/**
 * The dropped connection is the only shape the missing folder takes; every
 * other error already says what it means and is passed through untouched.
 */
const isMissingPlaylistDir = async (
  lmsClient: PlaylistDirProbe,
  error: LmsError,
): Promise<boolean> => {
  if (error.type !== "NetworkError") {
    return false;
  }

  const playlistDir = await lmsClient.getPlaylistDir();
  // A failing probe means LMS really is unreachable — keep the original error.
  return playlistDir.ok && playlistDir.value === "";
};

/**
 * Report a failed playlist write, asking LMS for the `playlistdir` pref first
 * when the failure could be the missing folder.
 *
 * The pref is asked for only on the way into a failure, never before the write
 * — same load rule as the player probe in 36fa28cf: a preflight on every save,
 * rename and delete would double the request count of an operation that
 * normally succeeds, to learn something that normally does not matter.
 */
export const sendPlaylistWriteFailure = async (
  reply: FastifyReply,
  request: FastifyRequest,
  lmsClient: PlaylistDirProbe,
  error: LmsError,
  logMessage: string,
  extraContext?: Record<string, unknown>,
): Promise<ReturnType<FastifyReply["send"]>> => {
  if (!(await isMissingPlaylistDir(lmsClient, error))) {
    return sendLmsError(
      reply,
      request,
      error,
      getUserFriendlyErrorMessage,
      logMessage,
      extraContext,
    );
  }

  request.log.error(
    {
      ...extraContext,
      lmsErrorType: error.type,
      lmsErrorMessage: error.message,
      httpStatus: PLAYLIST_DIR_NOT_CONFIGURED_STATUS,
      errorType: PLAYLIST_DIR_NOT_CONFIGURED_ERROR,
    },
    logMessage,
  );

  return reply.code(PLAYLIST_DIR_NOT_CONFIGURED_STATUS).send({
    error: PLAYLIST_DIR_NOT_CONFIGURED_ERROR,
    message: PLAYLIST_DIR_NOT_CONFIGURED_MESSAGE,
  });
};
