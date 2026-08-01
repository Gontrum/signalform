/**
 * Status Poller — shuffle/repeat propagation
 *
 * The mode toggles are only as good as the change detection behind them:
 * if hasStatusChanged ignores the two fields, LMS reports the new mode, the
 * poller sees "nothing changed", no event goes out, and the UI button looks
 * like it sometimes does nothing.
 */

import fastify, { type FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { describe, expect, test, vi } from "vitest";
import { ok, type Result } from "@signalform/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";
import { startStatusPolling } from "./status-poller.js";
import type { TypedSocketIOServer } from "./server.js";
import { PLAYER_STATUS_CHANGED } from "./events.js";
import type {
  LmsError,
  PlayerStatus,
} from "../../adapters/lms-client/index.js";

type EmitFn = (event: string, ...args: readonly unknown[]) => void;

const makeMockIo = (): {
  readonly io: TypedSocketIOServer;
  readonly emit: ReturnType<typeof vi.fn<EmitFn>>;
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

const makeTrack = (): NonNullable<PlayerStatus["currentTrack"]> => ({
  id: "4711",
  title: "So What",
  artist: "Miles Davis",
  album: "Kind of Blue",
  url: "http://lms.local/stream/4711.flac",
  source: "local",
  type: "track",
});

// Everything except the modes is deliberately identical across polls: only a
// mode change can make this status "change".
const makePlayerStatus = (
  overrides: Partial<PlayerStatus> = {},
): PlayerStatus => ({
  mode: "play",
  playerConnected: true,
  time: 30,
  duration: 240,
  volume: 50,
  currentTrack: makeTrack(),
  queuePreview: [{ id: "4712", title: "Blue in Green", artist: "Miles Davis" }],
  shuffle: "off",
  repeat: "off",
  ...overrides,
});

const sequentialGetStatus = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): (() => Promise<Result<PlayerStatus, LmsError>>) => {
  const iterator = responses[Symbol.iterator]();
  const last = responses.at(-1);
  return vi.fn().mockImplementation(async () => {
    const next = iterator.next();
    return next.done ? last : next.value;
  });
};

const makeMockLmsClient = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): Parameters<typeof startStatusPolling>[1] => ({
  getStatus: sequentialGetStatus(responses),
  getQueue: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  nextTrack: vi.fn().mockResolvedValue({ ok: true }),
  resume: vi.fn().mockResolvedValue({ ok: true }),
});

const makeMockApp = (): FastifyInstance => fastify({ logger: false });

const statusPayloadsFrom = (
  emit: ReturnType<typeof vi.fn<EmitFn>>,
): readonly Record<string, unknown>[] =>
  emit.mock.calls
    .filter((call) => call[0] === PLAYER_STATUS_CHANGED)
    .map((call) => call[1])
    .filter(
      (payload): payload is Record<string, unknown> =>
        typeof payload === "object" && payload !== null,
    );

describe("startStatusPolling - shuffle and repeat", () => {
  test("emits a status update when only the shuffle mode changed", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const mockLmsClient = makeMockLmsClient([
      ok(makePlayerStatus({ shuffle: "off" })),
      ok(makePlayerStatus({ shuffle: "albums" })),
    ]);

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(
        statusPayloadsFrom(mockIo.emit).some(
          (payload) => payload["shuffle"] === "albums",
        ),
      ).toBe(true);
    });

    stopPolling();

    // The first poll always emits; the second one only if the mode counts as a change.
    expect(statusPayloadsFrom(mockIo.emit).length).toBeGreaterThanOrEqual(2);
  });

  test("emits a status update when only the repeat mode changed", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const mockLmsClient = makeMockLmsClient([
      ok(makePlayerStatus({ repeat: "off" })),
      ok(makePlayerStatus({ repeat: "track" })),
    ]);

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(
        statusPayloadsFrom(mockIo.emit).some(
          (payload) => payload["repeat"] === "track",
        ),
      ).toBe(true);
    });

    stopPolling();
  });

  test("stops emitting once the modes settle, so a mode is not a permanent change", async () => {
    const mockIo = makeMockIo();
    const mockApp = makeMockApp();
    const mockLmsClient = makeMockLmsClient([
      ok(makePlayerStatus({ shuffle: "songs", repeat: "playlist" })),
    ]);

    const stopPolling = startStatusPolling(
      mockIo.io,
      mockLmsClient,
      mockApp,
      "player-1",
      5,
    );

    await vi.waitFor(() => {
      expect(statusPayloadsFrom(mockIo.emit).length).toBeGreaterThan(0);
    });
    const afterFirstEmit = statusPayloadsFrom(mockIo.emit).length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    stopPolling();

    expect(statusPayloadsFrom(mockIo.emit)).toHaveLength(afterFirstEmit);
    expect(statusPayloadsFrom(mockIo.emit)[0]).toMatchObject({
      shuffle: "songs",
      repeat: "playlist",
    });
  });
});
