/**
 * Status Poller — queue push after a track change
 *
 * The queue push is the only way the queue view learns about a track change,
 * and it depends on a second LMS call that can fail on its own. Failing that
 * call must not turn into a queue update: an emitted-but-empty queue would
 * clear the client's queue view for a purely transient LMS hiccup.
 */

import fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { describe, expect, test, vi } from "vitest";
import { err, ok, type Result } from "@signalform/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";
import { startStatusPolling } from "./status-poller.js";
import type { TypedSocketIOServer } from "./server.js";
import { PLAYER_QUEUE_UPDATED } from "./events.js";
import type {
  LmsError,
  PlayerStatus,
} from "../../adapters/lms-client/index.js";

type EmitFn = (event: string, ...args: readonly unknown[]) => void;
type MockEmit = ReturnType<typeof vi.fn<EmitFn>>;
type LmsClient = Parameters<typeof startStatusPolling>[1];
type QueueResult = Awaited<ReturnType<LmsClient["getQueue"]>>;

const makeMockIo = (): {
  readonly io: TypedSocketIOServer;
  readonly emit: MockEmit;
} => {
  const emit = vi.fn<EmitFn>();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockImplementation((event, ...args) => {
    emit(event, ...args);
    return true;
  });
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return { io, emit };
};

const makeMockApp = (): FastifyInstance => fastify({ logger: false });

const makeTrack = (
  id: string,
  title: string,
): NonNullable<PlayerStatus["currentTrack"]> => ({
  id,
  title,
  artist: "Miles Davis",
  album: "Kind of Blue",
  url: `http://lms.local/stream/${id}.flac`,
  source: "local",
  type: "track",
});

const makePlayerStatus = (
  overrides: Partial<PlayerStatus> = {},
): PlayerStatus => ({
  mode: "play",
  playerConnected: true,
  time: 30,
  duration: 240,
  volume: 50,
  currentTrack: makeTrack("4711", "So What"),
  queuePreview: [{ id: "4712", title: "Blue in Green", artist: "Miles Davis" }],
  shuffle: "off",
  repeat: "off",
  ...overrides,
});

// Poll 1 has no predecessor, so it never fetches the queue; poll 2 is the
// track change that does. Every later poll repeats poll 2 and must stay quiet.
const trackChangeStatuses: ReadonlyArray<Result<PlayerStatus, LmsError>> = [
  ok(makePlayerStatus()),
  ok(
    makePlayerStatus({
      currentTrack: makeTrack("4712", "Blue in Green"),
      queuePreview: [
        { id: "4713", title: "Flamenco Sketches", artist: "Miles Davis" },
      ],
    }),
  ),
];

const sequentialGetStatus = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): LmsClient["getStatus"] => {
  const iterator = responses[Symbol.iterator]();
  const last = responses.at(-1);
  return vi.fn().mockImplementation(async () => {
    const next = iterator.next();
    return next.done ? last : next.value;
  });
};

const makeMockLmsClient = (getQueue: LmsClient["getQueue"]): LmsClient => ({
  getStatus: sequentialGetStatus(trackChangeStatuses),
  getQueue,
  nextTrack: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true }),
});

const queueUpdatesFrom = (emit: MockEmit): readonly unknown[] =>
  emit.mock.calls
    .filter((call) => call[0] === PLAYER_QUEUE_UPDATED)
    .map((call) => call[1]);

const isLogEventNamed = (logFields: unknown, event: string): boolean =>
  typeof logFields === "object" &&
  logFields !== null &&
  "event" in logFields &&
  logFields.event === event;

describe("startStatusPolling - queue push on track change", () => {
  test("pushes the fetched queue when getQueue succeeds after a track change", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const getQueue = vi.fn<LmsClient["getQueue"]>().mockResolvedValue({
      ok: true,
      value: [
        {
          id: "4712",
          position: 0,
          title: "Blue in Green",
          artist: "Miles Davis",
          album: "Kind of Blue",
          duration: 327,
          isCurrent: true,
        },
      ],
    } satisfies QueueResult);

    const stopPolling = startStatusPolling(
      mockIo.io,
      makeMockLmsClient(getQueue),
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(queueUpdatesFrom(mockIo.emit).length).toBeGreaterThan(0);
    });

    stopPolling();

    expect(queueUpdatesFrom(mockIo.emit)[0]).toMatchObject({
      playerId: "player-1",
      tracks: [expect.objectContaining({ id: "4712", position: 0 })],
    });
  });

  test("logs queue_fetch_failed_in_poller and pushes no queue update when getQueue fails after a track change", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const getQueue = vi
      .fn<LmsClient["getQueue"]>()
      .mockResolvedValue(
        err({ type: "NetworkError", message: "ECONNREFUSED" }) as QueueResult,
      );

    const stopPolling = startStatusPolling(
      mockIo.io,
      makeMockLmsClient(getQueue),
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(
        warnSpy.mock.calls.filter((call) =>
          isLogEventNamed(call[0], "queue_fetch_failed_in_poller"),
        ),
      ).toHaveLength(1);
    });

    stopPolling();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "queue_fetch_failed_in_poller",
        error: expect.objectContaining({ message: "ECONNREFUSED" }),
      }),
      expect.any(String),
    );
    // The failed fetch must not degrade into an empty-queue push: the branch
    // was entered (getQueue ran) and still nothing went out to the clients.
    expect(getQueue).toHaveBeenCalled();
    expect(queueUpdatesFrom(mockIo.emit)).toHaveLength(0);
  });

  test("keeps polling after a failed queue fetch instead of stalling", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const warnSpy = vi.spyOn(mockApp.log, "warn");
    const getQueue = vi
      .fn<LmsClient["getQueue"]>()
      .mockResolvedValue(
        err({ type: "NetworkError", message: "ECONNREFUSED" }) as QueueResult,
      );
    const lmsClient = makeMockLmsClient(getQueue);

    const stopPolling = startStatusPolling(
      mockIo.io,
      lmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(
        warnSpy.mock.calls.some((call) =>
          isLogEventNamed(call[0], "queue_fetch_failed_in_poller"),
        ),
      ).toBe(true);
    });
    const pollsWhenQueueFetchFailed = vi.mocked(lmsClient.getStatus).mock.calls
      .length;
    await vi.waitFor(() => {
      expect(vi.mocked(lmsClient.getStatus).mock.calls.length).toBeGreaterThan(
        pollsWhenQueueFetchFailed,
      );
    });

    stopPolling();
  });
});
