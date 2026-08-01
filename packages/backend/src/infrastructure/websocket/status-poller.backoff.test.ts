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
import { SYSTEM_LMS_DISCONNECTED, SYSTEM_LMS_RECONNECTED } from "./events.js";
import type {
  LmsError,
  PlayerStatus,
} from "../../adapters/lms-client/index.js";

const { recordDelay } = vi.hoisted(() => ({
  recordDelay: vi.fn<(ms: number) => void>(),
}));

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
      // Assertions target the requested delay, so the real wait can stay short.
      return actual.setTimeout(1, value, options);
    },
  };
});

const POLL_INTERVAL_MS = 7;

const requestedDelays = (): readonly number[] =>
  recordDelay.mock.calls.map(([ms]) => ms);

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
});

const unreachableLms = (): Result<PlayerStatus, LmsError> =>
  err({ type: "NetworkError", message: "ECONNREFUSED" });

const createSequentialGetStatus = (
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
): PollerLmsClient => ({
  getStatus,
  getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  nextTrack: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true }),
});

const countEmits = (
  emit: ReturnType<typeof vi.fn<EmitFn>>,
  event: string,
): number => emit.mock.calls.filter(([emitted]) => emitted === event).length;

const isLogEventNamed = (logFields: unknown, event: string): boolean =>
  typeof logFields === "object" &&
  logFields !== null &&
  "event" in logFields &&
  logFields.event === event;

describe("startStatusPolling - backoff while LMS is unreachable", () => {
  beforeEach(() => {
    recordDelay.mockClear();
  });

  test("widens the gap between polls the longer LMS stays unreachable", async () => {
    const mockIo = makeMockIo();
    const mockLmsClient = makeMockLmsClient(
      vi.fn().mockResolvedValue(unreachableLms()),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(requestedDelays().length).toBeGreaterThanOrEqual(4);
    });
    stopPolling();

    expect(requestedDelays().slice(0, 4)).toEqual([5000, 5000, 30000, 30000]);
    expect(requestedDelays()).not.toContain(POLL_INTERVAL_MS);
  });

  test("returns to the configured interval on the first successful poll after failures", async () => {
    const mockIo = makeMockIo();
    const mockLmsClient = makeMockLmsClient(
      createSequentialGetStatus([
        unreachableLms(),
        unreachableLms(),
        unreachableLms(),
        ok(makePlayerStatus()),
      ]),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(requestedDelays().length).toBeGreaterThanOrEqual(5);
    });
    stopPolling();

    expect(requestedDelays().slice(0, 5)).toEqual([
      5000,
      5000,
      30000,
      POLL_INTERVAL_MS,
      POLL_INTERVAL_MS,
    ]);
  });

  test("announces the disconnect once and only logs poll failures afterwards", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const mockLmsClient = makeMockLmsClient(
      vi.fn().mockResolvedValue(unreachableLms()),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(requestedDelays().length).toBeGreaterThanOrEqual(3);
    });
    stopPolling();

    expect(countEmits(mockIo.emit, SYSTEM_LMS_DISCONNECTED)).toBe(1);
    expect(
      warnSpy.mock.calls.filter((call) =>
        isLogEventNamed(call[0], "lms_status_poll_failed"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("announces the reconnect once when LMS answers again", async () => {
    const mockIo = makeMockIo();
    const mockLmsClient = makeMockLmsClient(
      createSequentialGetStatus([
        unreachableLms(),
        unreachableLms(),
        ok(makePlayerStatus()),
      ]),
    );

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(requestedDelays().length).toBeGreaterThanOrEqual(5);
    });
    stopPolling();

    expect(countEmits(mockIo.emit, SYSTEM_LMS_RECONNECTED)).toBe(1);
    expect(countEmits(mockIo.emit, SYSTEM_LMS_DISCONNECTED)).toBe(1);
  });
});
