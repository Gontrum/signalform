/**
 * Imperative Shell state persistence for the radio boundary index.
 * Used by server.ts route handlers to track radioBoundaryIndex for `player.queue.updated` events.
 *
 * State is encapsulated in a closure — no module-level mutable variables.
 */

type RadioQueueState = {
  readonly radioBoundaryIndex: number | null;
  readonly recentArtists: readonly string[];
  readonly isProcessing: boolean;
};

const INITIAL_STATE: RadioQueueState = {
  radioBoundaryIndex: null,
  recentArtists: [],
  isProcessing: false,
};

type RadioState = {
  readonly get: () => RadioQueueState;
  readonly setBoundaryIndex: (index: number | null) => void;
  readonly setRecentArtists: (artists: readonly string[]) => void;
  readonly setProcessing: (processing: boolean) => void;
  readonly reset: () => void;
};

const createRadioState = (): RadioState => {
  const ref = { current: INITIAL_STATE };
  return {
    get: (): RadioQueueState => ref.current,
    setBoundaryIndex: (radioBoundaryIndex: number | null): void => {
      ref.current = { ...ref.current, radioBoundaryIndex };
    },
    setRecentArtists: (recentArtists: readonly string[]): void => {
      ref.current = { ...ref.current, recentArtists };
    },
    setProcessing: (isProcessing: boolean): void => {
      ref.current = { ...ref.current, isProcessing };
    },
    reset: (): void => {
      ref.current = INITIAL_STATE;
    },
  };
};

const radioState = createRadioState();

export const getRadioQueueState = (): RadioQueueState => radioState.get();
export const setRadioBoundaryIndex = (
  radioBoundaryIndex: number | null,
): void => radioState.setBoundaryIndex(radioBoundaryIndex);
export const resetRadioRuntimeState = (): void => radioState.reset();
export const setRadioRecentArtists = (recentArtists: readonly string[]): void =>
  radioState.setRecentArtists(recentArtists);
export const setRadioProcessing = (isProcessing: boolean): void =>
  radioState.setProcessing(isProcessing);
