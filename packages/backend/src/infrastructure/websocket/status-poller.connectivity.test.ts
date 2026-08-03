import fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { err, ok, type Result } from "@signalform/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";
import { startStatusPolling } from "./status-poller.js";
import type { TypedSocketIOServer } from "./server.js";
import {
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_LMS_RECONNECTED,
  SYSTEM_PLAYER_STATUS_RESTORED,
  SYSTEM_PLAYER_STATUS_UNAVAILABLE,
} from "./events.js";
import type {
  LmsError,
  PlayerStatus,
} from "../../adapters/lms-client/index.js";

const { recordDelay } = vi.hoisted(() => ({
  recordDelay: vi.fn<(ms: number) => void>(),
}));

// The failure path backs off to 5s/30s — keep the real waits short so the
// backoff does not turn into test runtime.
vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: (
      ms?: number,
      value?: unknown,
      options?: { readonly signal?: AbortSignal },
    ): Promise<unknown> => {
      recordDelay(ms ?? 0);
      return actual.setTimeout(1, value, options);
    },
  };
});

const POLL_INTERVAL_MS = 5;

const pollCount = (): number => recordDelay.mock.calls.length;

type EmitFn = (event: string, ...args: readonly unknown[]) => void;

type PollerLmsClient = Parameters<typeof startStatusPolling>[1];

const makeMockIo = (): {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn<EmitFn>>;
} => {
  const mockEmit = vi.fn<EmitFn>();
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

const makePlayerStatus = (): PlayerStatus => ({
  mode: "play",
  playerConnected: true,
  time: 0,
  duration: 0,
  volume: 50,
  currentTrack: null,
  queuePreview: [],
  shuffle: "off",
  repeat: "off",
});

// LMS 9.1.1 lets ["status", …] run into the timeout when the player is not
// connected, while the server itself keeps answering — this is that shape.
const statusTimedOut = (): Result<PlayerStatus, LmsError> =>
  err({ type: "TimeoutError", message: "LMS connection timeout (5s)" });

const serverGone = (): Result<PlayerStatus, LmsError> =>
  err({ type: "NetworkError", message: "ECONNREFUSED" });

const sequentialGetStatus = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): PollerLmsClient["getStatus"] => {
  const responseIterator = responses[Symbol.iterator]();
  const fallbackResponse = responses.at(-1);
  return vi.fn().mockImplementation(async () => {
    const nextResponse = responseIterator.next();
    return nextResponse.done ? fallbackResponse : nextResponse.value;
  });
};

const makeMockLmsClient = (
  getStatus: PollerLmsClient["getStatus"],
  pingServer: PollerLmsClient["pingServer"],
): PollerLmsClient => ({
  getStatus,
  pingServer,
  getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  nextTrack: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true }),
});

const reachableServer = (): PollerLmsClient["pingServer"] =>
  vi.fn().mockResolvedValue({ ok: true });

const unreachableServer = (): PollerLmsClient["pingServer"] =>
  vi.fn().mockResolvedValue({ ok: false });

const emittedEvents = (
  emit: ReturnType<typeof vi.fn<EmitFn>>,
): readonly string[] => emit.mock.calls.map(([event]) => event);

const countEmits = (
  emit: ReturnType<typeof vi.fn<EmitFn>>,
  event: string,
): number => emittedEvents(emit).filter((emitted) => emitted === event).length;

const isLogEventNamed = (logFields: unknown, event: string): boolean =>
  typeof logFields === "object" &&
  logFields !== null &&
  "event" in logFields &&
  logFields.event === event;

describe("startStatusPolling - telling a silent player apart from a down LMS", () => {
  beforeEach(() => {
    recordDelay.mockClear();
  });

  test("announces the player, not LMS, when the status call fails but the server still answers", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const mockLmsClient = makeMockLmsClient(
      vi.fn().mockResolvedValue(statusTimedOut()),
      reachableServer(),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(countEmits(mockIo.emit, SYSTEM_PLAYER_STATUS_UNAVAILABLE)).toBe(1);
    });
    await vi.waitFor(() => {
      expect(pollCount()).toBeGreaterThanOrEqual(3);
    });
    stopPolling();

    expect(emittedEvents(mockIo.emit)).not.toContain(SYSTEM_LMS_DISCONNECTED);
    expect(countEmits(mockIo.emit, SYSTEM_PLAYER_STATUS_UNAVAILABLE)).toBe(1);
    expect(
      warnSpy.mock.calls.some((call) =>
        isLogEventNamed(call[0], "player_status_poll_failed"),
      ),
    ).toBe(true);
    expect(
      warnSpy.mock.calls.some((call) =>
        isLogEventNamed(call[0], "lms_status_poll_failed"),
      ),
    ).toBe(false);
  });

  test("announces LMS, not the player, when the server does not answer either", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const mockLmsClient = makeMockLmsClient(
      vi.fn().mockResolvedValue(serverGone()),
      unreachableServer(),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(countEmits(mockIo.emit, SYSTEM_LMS_DISCONNECTED)).toBe(1);
    });
    await vi.waitFor(() => {
      expect(pollCount()).toBeGreaterThanOrEqual(3);
    });
    stopPolling();

    expect(emittedEvents(mockIo.emit)).not.toContain(
      SYSTEM_PLAYER_STATUS_UNAVAILABLE,
    );
    expect(
      warnSpy.mock.calls.some((call) =>
        isLogEventNamed(call[0], "lms_status_poll_failed"),
      ),
    ).toBe(true);
    expect(
      warnSpy.mock.calls.some((call) =>
        isLogEventNamed(call[0], "player_status_poll_failed"),
      ),
    ).toBe(false);
  });

  test("probes the server once per failure, not once per poll", async () => {
    const mockIo = makeMockIo();
    const pingServer = reachableServer();
    const mockLmsClient = makeMockLmsClient(
      vi.fn().mockResolvedValue(statusTimedOut()),
      pingServer,
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(pollCount()).toBeGreaterThanOrEqual(5);
    });
    stopPolling();

    expect(pingServer).toHaveBeenCalledTimes(1);
  });

  test("takes the player message back when the status call succeeds again, without claiming LMS reconnected", async () => {
    const mockIo = makeMockIo();
    const pingServer = reachableServer();
    const mockLmsClient = makeMockLmsClient(
      sequentialGetStatus([
        statusTimedOut(),
        statusTimedOut(),
        ok(makePlayerStatus()),
      ]),
      pingServer,
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(countEmits(mockIo.emit, SYSTEM_PLAYER_STATUS_RESTORED)).toBe(1);
    });
    await vi.waitFor(() => {
      expect(pollCount()).toBeGreaterThanOrEqual(5);
    });
    stopPolling();

    expect(
      emittedEvents(mockIo.emit).filter((event) => event.startsWith("system.")),
    ).toEqual([
      SYSTEM_PLAYER_STATUS_UNAVAILABLE,
      SYSTEM_PLAYER_STATUS_RESTORED,
    ]);
    expect(emittedEvents(mockIo.emit)).not.toContain(SYSTEM_LMS_RECONNECTED);
    // Recovered polls are not failures, so the next failure may probe again.
    expect(pingServer).toHaveBeenCalledTimes(1);
  });

  test("probes again after a recovery, so a second outage is classified freshly", async () => {
    const mockIo = makeMockIo();
    const pingServer = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ ok: false });
    const mockLmsClient = makeMockLmsClient(
      sequentialGetStatus([
        statusTimedOut(),
        ok(makePlayerStatus()),
        serverGone(),
      ]),
      pingServer,
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(countEmits(mockIo.emit, SYSTEM_LMS_DISCONNECTED)).toBe(1);
    });
    stopPolling();

    expect(
      emittedEvents(mockIo.emit).filter((event) => event.startsWith("system.")),
    ).toEqual([
      SYSTEM_PLAYER_STATUS_UNAVAILABLE,
      SYSTEM_PLAYER_STATUS_RESTORED,
      SYSTEM_LMS_DISCONNECTED,
    ]);
    expect(pingServer).toHaveBeenCalledTimes(2);
  });
});
