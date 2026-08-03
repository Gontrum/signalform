import fastify, { type FastifyInstance } from "fastify";
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

const TRACK_DURATION = 200;

type PollerLmsClient = Parameters<typeof startStatusPolling>[1];

const makeMockIo = (): TypedSocketIOServer => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>();
  const roomEmitter = io.to("test-room");
  vi.spyOn(roomEmitter, "emit").mockReturnValue(true);
  vi.spyOn(io, "to").mockReturnValue(roomEmitter);
  return io;
};

const makeMockApp = (): FastifyInstance => fastify({ logger: false });

const makeTrack = (id: string): SearchResult => ({
  id,
  title: "So What",
  artist: "Miles Davis",
  album: "Kind of Blue",
  url: "tidal://track/1",
  source: "tidal",
  type: "track",
});

const playingAt = (
  time: number,
  overrides: Partial<PlayerStatus> = {},
): Result<PlayerStatus, LmsError> =>
  ok({
    mode: "play",
    playerConnected: true,
    time,
    duration: TRACK_DURATION,
    volume: 50,
    currentTrack: makeTrack("track-a"),
    queuePreview: [],
    shuffle: "off",
    repeat: "off",
    ...overrides,
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
  // These fixtures fail status polls by taking LMS itself down, so the
  // server-level probe has to fail with it.
  pingServer: vi.fn().mockResolvedValue({ ok: false }),
});

const waitForPolls = async (
  getStatus: PollerLmsClient["getStatus"],
  count: number,
): Promise<void> => {
  await vi.waitFor(() => {
    expect(vi.mocked(getStatus).mock.calls.length).toBeGreaterThanOrEqual(
      count,
    );
  });
};

type AbandonLogFields = {
  readonly event: string;
  readonly trackId: string;
  readonly stallCount: number;
  readonly time: number;
  readonly duration: number;
};

const isAbandonLog = (fields: unknown): fields is AbandonLogFields =>
  typeof fields === "object" &&
  fields !== null &&
  "event" in fields &&
  fields.event === "stall_count_abandoned";

const abandonLogs = (infoSpy: {
  readonly mock: { readonly calls: ReadonlyArray<readonly unknown[]> };
}): readonly AbandonLogFields[] =>
  infoSpy.mock.calls.map((call) => call[0]).filter(isAbandonLog);

describe("startStatusPolling - track-end stall recovery", () => {
  beforeEach(() => {
    resetRadioRuntimeState();
  });

  test("forces a single track advance after five frozen polls at the track end", async () => {
    const frozen = playingAt(TRACK_DURATION);
    const getStatus = sequentialGetStatus([
      frozen,
      frozen,
      frozen,
      frozen,
      frozen,
      // getStatus() issued by the recovery itself, then the advanced track.
      playingAt(0, { currentTrack: makeTrack("track-b") }),
    ]);
    const mockLmsClient = makeMockLmsClient(getStatus);

    const stopPolling = startStatusPolling(
      makeMockIo(),
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(mockLmsClient.nextTrack).toHaveBeenCalledTimes(1);
    });
    await waitForPolls(getStatus, 10);
    stopPolling();

    expect(mockLmsClient.nextTrack).toHaveBeenCalledTimes(1);
    // Recovery poll reported "play", so no resume was needed.
    expect(mockLmsClient.resume).not.toHaveBeenCalled();
  });

  test("does not intervene while the position keeps moving at the track end", async () => {
    const getStatus = sequentialGetStatus([
      playingAt(199.5),
      playingAt(199.75),
      playingAt(200),
      playingAt(200.25),
      playingAt(200.5),
      playingAt(200.75),
      // Track ends normally: LMS moves on without any help from the poller.
      playingAt(0, { currentTrack: makeTrack("track-b") }),
    ]);
    const mockLmsClient = makeMockLmsClient(getStatus);

    const stopPolling = startStatusPolling(
      makeMockIo(),
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await waitForPolls(getStatus, 8);
    stopPolling();

    expect(mockLmsClient.nextTrack).not.toHaveBeenCalled();
    expect(mockLmsClient.resume).not.toHaveBeenCalled();
  });

  test("resumes when the player is not playing after the forced advance", async () => {
    const frozen = playingAt(TRACK_DURATION);
    const getStatus = sequentialGetStatus([
      frozen,
      frozen,
      frozen,
      frozen,
      frozen,
      playingAt(0, { mode: "stop", currentTrack: makeTrack("track-b") }),
    ]);
    const mockLmsClient = makeMockLmsClient(getStatus);

    const stopPolling = startStatusPolling(
      makeMockIo(),
      mockLmsClient,
      makeMockApp(),
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(mockLmsClient.resume).toHaveBeenCalledTimes(1);
    });
    stopPolling();

    expect(mockLmsClient.nextTrack).toHaveBeenCalledTimes(1);
  });

  test("logs the near miss when a freeze count of two ends in progress", async () => {
    const frozen = playingAt(TRACK_DURATION);
    const getStatus = sequentialGetStatus([
      frozen,
      frozen,
      playingAt(TRACK_DURATION + 0.4),
      playingAt(0, { currentTrack: makeTrack("track-b") }),
    ]);
    const mockLmsClient = makeMockLmsClient(getStatus);
    const mockApp = makeMockApp();
    const infoSpy = vi.spyOn(mockApp.log, "info");

    const stopPolling = startStatusPolling(
      makeMockIo(),
      mockLmsClient,
      mockApp,
      "player-1",
      POLL_INTERVAL_MS,
    );

    await vi.waitFor(() => {
      expect(abandonLogs(infoSpy)).toHaveLength(1);
    });
    await waitForPolls(getStatus, 8);
    stopPolling();

    expect(abandonLogs(infoSpy)).toEqual([
      {
        event: "stall_count_abandoned",
        playerId: "player-1",
        trackId: "track-a",
        stallCount: 2,
        time: TRACK_DURATION + 0.4,
        duration: TRACK_DURATION,
      },
    ]);
    expect(mockLmsClient.nextTrack).not.toHaveBeenCalled();
  });

  test("stays quiet about a freeze count of one that ends in progress", async () => {
    const getStatus = sequentialGetStatus([
      playingAt(TRACK_DURATION),
      playingAt(TRACK_DURATION + 0.4),
      playingAt(TRACK_DURATION + 0.8),
      playingAt(0, { currentTrack: makeTrack("track-b") }),
    ]);
    const mockLmsClient = makeMockLmsClient(getStatus);
    const mockApp = makeMockApp();
    const infoSpy = vi.spyOn(mockApp.log, "info");

    const stopPolling = startStatusPolling(
      makeMockIo(),
      mockLmsClient,
      mockApp,
      "player-1",
      POLL_INTERVAL_MS,
    );

    await waitForPolls(getStatus, 8);
    stopPolling();

    expect(abandonLogs(infoSpy)).toEqual([]);
    expect(mockLmsClient.nextTrack).not.toHaveBeenCalled();
  });
});
