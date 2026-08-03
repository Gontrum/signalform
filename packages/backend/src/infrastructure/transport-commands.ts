/**
 * When the user last told the player to leave the track it was playing.
 *
 * Process-wide runtime state in the same spirit as radio-state.ts: written by
 * the route handlers that carry such a command to LMS, read by the status
 * poller, which otherwise cannot tell a pressed "next" from a track that broke
 * off on its own. State is encapsulated in a closure — no module-level `let`.
 *
 * It lives in infrastructure/ rather than in a feature because four features
 * (playback, queue, playlists, the radio starts) write it and the poller reads
 * it; homing it in any one of them would make the others — and infrastructure —
 * depend on that feature's shell.
 */

type TransportCommandState = {
  readonly lastCommandAtMs?: number;
};

const INITIAL_STATE: TransportCommandState = {};

type TransportCommandLog = {
  readonly record: (atMs: number) => void;
  readonly lastAtMs: () => number | undefined;
  readonly reset: () => void;
};

const createTransportCommandLog = (): TransportCommandLog => {
  const ref = { current: INITIAL_STATE };
  return {
    record: (lastCommandAtMs: number): void => {
      ref.current = { lastCommandAtMs };
    },
    lastAtMs: (): number | undefined => ref.current.lastCommandAtMs,
    reset: (): void => {
      ref.current = INITIAL_STATE;
    },
  };
};

const transportCommandLog = createTransportCommandLog();

/**
 * Marks "the user just asked to leave the current track" — call it in the
 * handler before the command goes to LMS, so the window also covers the time
 * LMS needs to act on it.
 */
export const recordUserTransportCommand = (): void =>
  transportCommandLog.record(Date.now());

export const lastUserTransportCommandAt = (): number | undefined =>
  transportCommandLog.lastAtMs();

export const resetUserTransportCommands = (): void =>
  transportCommandLog.reset();
