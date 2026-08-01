import fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { describe, expect, test, vi } from "vitest";
import { err, ok, type Result } from "@signalform/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";
import type { LmsPlayerStatus } from "./handlers.js";
import {
  getRadioQueueState,
  reconcileSuppressedQueueEnd,
  resetRadioRuntimeState,
  setSuppressedQueueEnd,
} from "../../features/radio-mode/shell/radio-state.js";
import { startStatusPolling } from "./status-poller.js";
import type { TypedSocketIOServer } from "./server.js";
import {
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_PLAYER_DISCONNECTED,
  SYSTEM_PLAYER_RECONNECTED,
} from "./events.js";
import type {
  LmsError,
  PlayerStatus,
} from "../../adapters/lms-client/index.js";

const makeStatus = (
  overrides: Partial<LmsPlayerStatus> = {},
): LmsPlayerStatus => ({
  playerId: "player-1",
  mode: "play",
  playerConnected: true,
  volume: 50,
  time: 0,
  ...overrides,
});

describe("reconcileSuppressedQueueEnd", () => {
  test("clears suppression when the queue grows again after being drained", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [
        { id: "2", title: "Freddie Freeloader", artist: "Miles Davis" },
      ],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toEqual({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
  });

  test("keeps suppression through the initial non-empty to empty drain transition", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [
        { id: "3", title: "Blue in Green", artist: "Miles Davis" },
      ],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });

  test("clears suppression when a new playback session starts later", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "99",
      artist: "Bill Evans",
      title: "Autumn Leaves",
    });
    const previousStatus = makeStatus({
      mode: "stop",
      currentTrack: undefined,
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      mode: "play",
      currentTrack: {
        id: "99",
        title: "Autumn Leaves",
        artist: "Bill Evans",
        album: "Portrait in Jazz",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });

  test("clears suppression once playback context has moved to a different track", () => {
    resetRadioRuntimeState();
    setSuppressedQueueEnd({
      trackId: "1",
      artist: "Miles Davis",
      title: "So What",
    });
    const previousStatus = makeStatus({
      currentTrack: {
        id: "1",
        title: "So What",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 240,
        sources: [],
      },
      queuePreview: [],
    });
    const currentStatus = makeStatus({
      currentTrack: {
        id: "2",
        title: "Freddie Freeloader",
        artist: "Miles Davis",
        album: "Kind of Blue",
        duration: 250,
        sources: [],
      },
      queuePreview: [],
    });

    reconcileSuppressedQueueEnd(previousStatus, currentStatus);

    expect(getRadioQueueState().suppressedQueueEnd).toBeUndefined();
  });
});

// --- startStatusPolling: player-connectivity + LMS-reachability events -----
// Fix 0 (player.playerConnected transition detection) and Fix 2 (getStatus no
// longer retries — poll loop is the retry mechanism) regression coverage.

type EmitFn = (event: string, ...args: readonly unknown[]) => void;
type MockEmit = ReturnType<typeof vi.fn<EmitFn>>;

type PollerLmsClient = {
  readonly getStatus: () => Promise<{
    readonly ok: boolean;
    readonly value?: PlayerStatus;
    readonly error?: LmsError;
  }>;
  readonly getQueue: () => Promise<{
    readonly ok: boolean;
    readonly value?: ReadonlyArray<{
      readonly id: string;
      readonly position: number;
      readonly title: string;
      readonly artist: string;
      readonly album: string;
      readonly duration: number;
      readonly isCurrent: boolean;
    }>;
    readonly error?: LmsError;
  }>;
  readonly nextTrack: () => Promise<{
    readonly ok: boolean;
    readonly error?: unknown;
  }>;
  readonly resume: () => Promise<{
    readonly ok: boolean;
    readonly error?: unknown;
  }>;
};

const makeMockEmit = (): MockEmit => vi.fn<EmitFn>();

const makeMockIo = (
  mockEmit: MockEmit = makeMockEmit(),
): { readonly io: TypedSocketIOServer; readonly emit: MockEmit } => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockImplementation((event, ...args) => {
    mockEmit(event, ...args);
    return true;
  });
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return { io, emit: mockEmit };
};

const makeMockApp = (): FastifyInstance => fastify({ logger: false });

const makePlayerStatus = (
  overrides: Partial<PlayerStatus> = {},
): PlayerStatus => ({
  mode: "play",
  playerConnected: true,
  time: 0,
  duration: 0,
  volume: 50,
  currentTrack: null,
  queuePreview: [],
  ...overrides,
});

const createSequentialGetStatus = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): ReturnType<typeof vi.fn<PollerLmsClient["getStatus"]>> => {
  const responseIterator = responses[Symbol.iterator]();
  const fallbackResponse = responses.at(-1);
  return vi.fn().mockImplementation(async () => {
    const nextResponse = responseIterator.next();
    return nextResponse.done ? fallbackResponse! : nextResponse.value;
  });
};

const makeLmsTrack = (
  overrides: Partial<NonNullable<PlayerStatus["currentTrack"]>> = {},
): NonNullable<PlayerStatus["currentTrack"]> => ({
  id: "4711",
  title: "So What",
  artist: "Miles Davis",
  album: "Kind of Blue",
  url: "http://lms.local/stream/4711.flac",
  source: "local",
  type: "track",
  ...overrides,
});

const makeMockLmsClient = (
  overrides: Partial<PollerLmsClient> = {},
): PollerLmsClient => ({
  getStatus: vi.fn().mockResolvedValue(ok(makePlayerStatus())),
  getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  nextTrack: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true }),
  ...overrides,
});

describe("startStatusPolling - player connectivity events", () => {
  test("emits system.playerDisconnected on a true → false transition, without emitting system.lmsDisconnected", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const mockLmsClient = makeMockLmsClient({
      getStatus: createSequentialGetStatus([
        ok(makePlayerStatus({ playerConnected: true })),
        ok(makePlayerStatus({ playerConnected: false })),
      ]),
    });

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5, // fast interval for test
    );

    await vi.waitFor(() => {
      expect(mockIo.emit).toHaveBeenCalledWith(
        SYSTEM_PLAYER_DISCONNECTED,
        expect.objectContaining({ message: "Player disconnected from LMS" }),
      );
    });

    stopPolling();

    expect(mockIo.emit).not.toHaveBeenCalledWith(
      SYSTEM_LMS_DISCONNECTED,
      expect.anything(),
    );
  });

  test("emits system.playerReconnected on a follow-up poll returning playerConnected: true again", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const mockLmsClient = makeMockLmsClient({
      getStatus: createSequentialGetStatus([
        ok(makePlayerStatus({ playerConnected: true })),
        ok(makePlayerStatus({ playerConnected: false })),
        ok(makePlayerStatus({ playerConnected: true })),
      ]),
    });

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5, // fast interval for test
    );

    await vi.waitFor(() => {
      expect(mockIo.emit).toHaveBeenCalledWith(
        SYSTEM_PLAYER_RECONNECTED,
        expect.objectContaining({ message: "Player reconnected to LMS" }),
      );
    });

    stopPolling();
  });

  test("emits system.lmsDisconnected after the very first failed poll, not after a multi-attempt retry delay (Fix 2 regression)", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const getStatus = vi.fn().mockResolvedValue(
      err({
        type: "NetworkError",
        message: "ECONNREFUSED",
      }),
    );
    const mockLmsClient = makeMockLmsClient({ getStatus });

    // Production-like 1s interval: the very first poll runs immediately on
    // start (before any interval elapses), so a fast emission here proves
    // detection is not gated behind getStatus()'s (removed) internal retry
    // chain (previously up to ~18s across 3 attempts with backoff).
    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      1000,
    );

    await vi.waitFor(
      () => {
        expect(mockIo.emit).toHaveBeenCalledWith(
          SYSTEM_LMS_DISCONNECTED,
          expect.objectContaining({ message: "LMS connection lost" }),
        );
      },
      { timeout: 500 },
    );

    stopPolling();

    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});

const isLogEventNamed = (logFields: unknown, event: string): boolean =>
  typeof logFields === "object" &&
  logFields !== null &&
  "event" in logFields &&
  logFields.event === event;

describe("startStatusPolling - player connectivity diagnostics", () => {
  test("logs the playback position of the last connected poll on disconnect, not the position reported after the drop", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const mockLmsClient = makeMockLmsClient({
      getStatus: createSequentialGetStatus([
        ok(
          makePlayerStatus({
            playerConnected: true,
            time: 42,
            duration: 200,
            currentTrack: makeLmsTrack({ id: "4711" }),
          }),
        ),
        // Deliberately different from the poll before: if the implementation read
        // currentStatus, the assertion below would see time 0 / no track instead.
        ok(
          makePlayerStatus({
            playerConnected: false,
            mode: "stop",
            time: 0,
            duration: 0,
            currentTrack: null,
          }),
        ),
      ]),
    });

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(mockIo.emit).toHaveBeenCalledWith(
        SYSTEM_PLAYER_DISCONNECTED,
        expect.anything(),
      );
    });

    stopPolling();

    expect(
      warnSpy.mock.calls.filter((call) =>
        isLogEventNamed(call[0], "system_player_disconnected"),
      ),
    ).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "system_player_disconnected",
        playerId: "player-1",
        trackId: "4711",
        time: 42,
        duration: 200,
      }),
      expect.any(String),
    );
  });

  test("logs the track and position the player came back with on reconnect", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const infoSpy = vi.spyOn(mockApp.log, "info");
    const mockLmsClient = makeMockLmsClient({
      getStatus: createSequentialGetStatus([
        ok(
          makePlayerStatus({
            playerConnected: true,
            time: 42,
            duration: 200,
            currentTrack: makeLmsTrack({ id: "4711" }),
          }),
        ),
        ok(
          makePlayerStatus({
            playerConnected: false,
            mode: "stop",
            time: 0,
            duration: 0,
            currentTrack: null,
          }),
        ),
        // LMS advanced the playlist while the player was gone — the reconnect
        // line must report this new position, not the one from the drop.
        ok(
          makePlayerStatus({
            playerConnected: true,
            time: 7,
            duration: 180,
            currentTrack: makeLmsTrack({
              id: "4712",
              title: "Freddie Freeloader",
              url: "http://lms.local/stream/4712.flac",
            }),
          }),
        ),
      ]),
    });

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(mockIo.emit).toHaveBeenCalledWith(
        SYSTEM_PLAYER_RECONNECTED,
        expect.anything(),
      );
    });

    stopPolling();

    expect(
      infoSpy.mock.calls.filter((call) =>
        isLogEventNamed(call[0], "system_player_reconnected"),
      ),
    ).toHaveLength(1);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "system_player_reconnected",
        playerId: "player-1",
        trackId: "4712",
        time: 7,
      }),
      expect.any(String),
    );
  });

  test("omits track fields on disconnect when nothing was playing instead of logging placeholder values", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const mockLmsClient = makeMockLmsClient({
      getStatus: createSequentialGetStatus([
        ok(
          makePlayerStatus({
            playerConnected: true,
            mode: "stop",
            time: 0,
            duration: 0,
            currentTrack: null,
          }),
        ),
        ok(
          makePlayerStatus({
            playerConnected: false,
            mode: "stop",
            time: 0,
            duration: 0,
            currentTrack: null,
          }),
        ),
      ]),
    });

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(mockIo.emit).toHaveBeenCalledWith(
        SYSTEM_PLAYER_DISCONNECTED,
        expect.anything(),
      );
    });

    stopPolling();

    expect(
      warnSpy.mock.calls.filter((call) =>
        isLogEventNamed(call[0], "system_player_disconnected"),
      ),
    ).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "system_player_disconnected",
        trackId: undefined,
        duration: undefined,
      }),
      expect.any(String),
    );
  });
});
