/**
 * Failure reporting for the four playlist commands that write to disk
 * (`playlist save`, `playlists rename`, `playlists delete`, `playlists edit`).
 *
 * Measured on LMS 9.1.1: LMS drops the HTTP connection without answering on
 * all four when its `playlistdir` pref is empty, and on the three that address
 * an existing playlist when the `playlist_id` is unknown. The adapter sees only
 * `fetch failed` in both cases — and in the third case, a server that really
 * went away. Each reading is confirmed against LMS before it is reported, so
 * neither the folder nor the id is blamed for a lost connection.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SAVED_PLAYLISTS_PAGE_LIMIT,
  type LmsClient,
  type LmsError,
} from "../../../adapters/lms-client/index.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";

type WriteFailureAnswer = {
  readonly status: number;
  readonly error: string;
  readonly message: string;
};

/**
 * 409 rather than 503 or 400: the server is up and the request is well formed,
 * the write conflicts with the server's own configuration. Nothing the caller
 * can fix by retrying or by sending different input — someone has to set the
 * folder in LMS.
 */
const PLAYLIST_DIR_NOT_CONFIGURED: WriteFailureAnswer = {
  status: 409,
  error: "PLAYLIST_DIR_NOT_CONFIGURED",
  message:
    "Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.",
};

const PLAYLIST_NOT_FOUND: WriteFailureAnswer = {
  status: 404,
  error: "PLAYLIST_NOT_FOUND",
  message:
    "That playlist no longer exists on Lyrion Music Server. Your list of playlists may be out of date — reload it and try again.",
};

/**
 * What the command addressed. `playlist save` creates a playlist, so a dropped
 * connection there can never mean a missing one; the other three name an id
 * that has to be checked against the saved playlists before it is blamed.
 */
export type PlaylistWriteTarget =
  | { readonly kind: "new-playlist" }
  | { readonly kind: "existing-playlist"; readonly playlistId: string };

type PlaylistWriteProbe = Pick<
  LmsClient,
  "getPlaylistDir" | "listSavedPlaylists"
>;

/**
 * A dropped connection is the shape both the unset folder and the unknown id
 * take; every other error already says what it means and is passed through
 * untouched. The empty pref is the unambiguous reading, so it is answered
 * before the id is blamed, and the id is only blamed once the saved playlists
 * show it gone — otherwise the answer denies a playlist that is still listed.
 */
const classifyDroppedConnection = async (
  lmsClient: PlaylistWriteProbe,
  error: LmsError,
  target: PlaylistWriteTarget,
): Promise<WriteFailureAnswer | undefined> => {
  if (error.type !== "NetworkError") {
    return undefined;
  }

  const playlistDir = await lmsClient.getPlaylistDir();
  // A failing probe means LMS really may be unreachable — keep the original error.
  if (!playlistDir.ok) {
    return undefined;
  }
  if (playlistDir.value === "") {
    return PLAYLIST_DIR_NOT_CONFIGURED;
  }
  if (target.kind !== "existing-playlist") {
    return undefined;
  }

  const savedPlaylists = await lmsClient.listSavedPlaylists();
  // Absence is unprovable while the server is not answering.
  if (!savedPlaylists.ok) {
    return undefined;
  }
  // A full page may be a truncated one, so a missing id proves nothing.
  if (savedPlaylists.value.length >= SAVED_PLAYLISTS_PAGE_LIMIT) {
    return undefined;
  }
  const stillListed = savedPlaylists.value.some(
    (playlist) => playlist.id === target.playlistId,
  );
  return stillListed ? undefined : PLAYLIST_NOT_FOUND;
};

/**
 * Report a failed playlist write, asking LMS for the `playlistdir` pref first
 * when the failure could be the unset folder rather than a lost server, and for
 * the saved playlists when it could be an id LMS no longer knows.
 *
 * Both are asked for only on the way into a failure, never before the write
 * — same load rule as the player probe in 36fa28cf: a preflight on every save,
 * rename and delete would double the request count of an operation that
 * normally succeeds, to learn something that normally does not matter.
 */
export const sendPlaylistWriteFailure = async (
  reply: FastifyReply,
  request: FastifyRequest,
  lmsClient: PlaylistWriteProbe,
  error: LmsError,
  target: PlaylistWriteTarget,
  logMessage: string,
  extraContext?: Record<string, unknown>,
): Promise<ReturnType<FastifyReply["send"]>> => {
  const answer = await classifyDroppedConnection(lmsClient, error, target);

  if (answer === undefined) {
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
      httpStatus: answer.status,
      errorType: answer.error,
    },
    logMessage,
  );

  return reply.code(answer.status).send({
    error: answer.error,
    message: answer.message,
  });
};
