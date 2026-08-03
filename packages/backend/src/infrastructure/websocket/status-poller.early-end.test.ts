import fastify from "fastify";
import { Server } from "socket.io";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ok, type Result } from "@signalform/shared";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@signalform/shared";
import { startStatusPolling } from "./status-poller.js";
import type { TypedSocketIOServer } from "./server.js";
import { resetRadioRuntimeState } from "../../features/radio-mode/shell/radio-state.js";
import type {
  LmsError,
  PlayerStatus,
  SearchResult,
} from "../../adapters/lms-client/index.js";

const POLL_INTERVAL_MS = 1;

const TRACK_DURATION = 240;

type PollerLmsClient = Parameters<typeof startStatusPolling>[1];

const makeMockIo = (): TypedSocketIOServer => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockReturnValue(true);
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return io;
};

const makeTrack = (id: string): SearchResult => ({
  id,
  title: `title of ${id}`,
  artist: "Miles Davis",
  album: "Kind of Blue",
  url: "tidal://track/1",
  source: "tidal",
  type: "track",
});

const playingAt = (
  time: number,
  trackId: string,
): Result<PlayerStatus, LmsError> =>
  ok({
    mode: "play",
    playerConnected: true,
    time,
    duration: TRACK_DURATION,
    volume: 50,
    currentTrack: makeTrack(trackId),
    queuePreview: [],
    shuffle: "off",
    repeat: "off",
  });

/** Replays the given responses, then repeats the last one for every further poll. */
const sequentialGetStatus = (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
): PollerLmsClient["getStatus"] => {
  const remaining = responses[Symbol.iterator]();
  const fallback = responses.at(-1);
  return vi.fn().mockImplementation(async () => {
    const next = remaining.next();
    return next.done ? fallback : next.value;
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

type EarlyEndLogFields = {
  readonly event: string;
  readonly playerId: string;
  readonly trackId: string;
  readonly time: number;
  readonly duration: number;
  readonly remainingSeconds: number;
  readonly nextTrackId: string;
};

const isEarlyEndLog = (fields: unknown): fields is EarlyEndLogFields =>
  typeof fields === "object" &&
  fields !== null &&
  "event" in fields &&
  fields.event === "track_ended_early";

const earlyEndLogs = (warnSpy: {
  readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> };
}): readonly EarlyEndLogFields[] =>
  warnSpy.mock.calls.map((call) => call[0]).filter(isEarlyEndLog);

/** Runs the poller over the given status sequence and returns the warn lines. */
const runPoller = async (
  responses: ReadonlyArray<Result<PlayerStatus, LmsError>>,
  pollCount: number,
): Promise<readonly EarlyEndLogFields[]> => {
  const getStatus = sequentialGetStatus(responses);
  const app = fastify({ logger: false });
  const warnSpy = vi.spyOn(app.log, "warn");

  const stopPolling = startStatusPolling(
    makeMockIo(),
    makeMockLmsClient(getStatus),
    app,
    "player-1",
    POLL_INTERVAL_MS,
  );

  await vi.waitFor(() => {
    expect(vi.mocked(getStatus).mock.calls.length).toBeGreaterThanOrEqual(
      pollCount,
    );
  });
  stopPolling();

  return earlyEndLogs(warnSpy);
};

describe("startStatusPolling - early track end detection", () => {
  beforeEach(() => {
    resetRadioRuntimeState();
  });

  test("warns once when a track is replaced halfway through", async () => {
    const logs = await runPoller(
      [
        playingAt(30, "track-a"),
        playingAt(118, "track-a"),
        playingAt(0, "track-b"),
      ],
      8,
    );

    expect(logs).toEqual([
      {
        event: "track_ended_early",
        playerId: "player-1",
        trackId: "track-a",
        time: 118,
        duration: TRACK_DURATION,
        remainingSeconds: TRACK_DURATION - 118,
        nextTrackId: "track-b",
      },
    ]);
  });

  test("stays quiet when the track runs out and the next one starts", async () => {
    const logs = await runPoller(
      [
        playingAt(237, "track-a"),
        playingAt(238, "track-a"),
        playingAt(0, "track-b"),
      ],
      8,
    );

    expect(logs).toEqual([]);
  });
});
