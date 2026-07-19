import { err, ok, type Result } from "@signalform/shared";

export type PlaylistNameError = {
  readonly message: string;
};

export const MAX_PLAYLIST_NAME_LENGTH = 200;

/**
 * Parses and validates a playlist name. Trims surrounding whitespace and
 * rejects empty names or names longer than 200 characters (after trimming).
 * Non-string input is rejected.
 */
export const parsePlaylistName = (
  input: unknown,
): Result<string, PlaylistNameError> => {
  if (typeof input !== "string") {
    return err({ message: "Playlist name must be a string" });
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    return err({ message: "Playlist name cannot be empty" });
  }

  if (trimmed.length > MAX_PLAYLIST_NAME_LENGTH) {
    return err({
      message: `Playlist name cannot exceed ${MAX_PLAYLIST_NAME_LENGTH} characters`,
    });
  }

  return ok(trimmed);
};
