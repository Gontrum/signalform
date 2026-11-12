import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok } from "@signalform/shared";
import { createGenreRadioRoute } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
} from "../../../adapters/lms-client/index.js";
import {
  createLastFmClient,
  type LastFmClient,
} from "../../../adapters/lastfm-client/index.js";
import {
  getRadioQueueState,
  resetRadioRuntimeState,
  setLovedRadioContext,
  setPersonalRadioContext,
} from "../../radio-mode/shell/radio-state.js";

const createMockLmsClient = (): LmsClient => ({
  ...createLmsClient({
    host: "localhost",
    port: 9000,
    playerId: "00:00:00:00:00:00",
    timeout: 5000,
  }),
  search: vi.fn<LmsClient["search"]>().mockResolvedValue(
    ok({
      tracks: [
        {
          id: "1",
          title: "Take Five",
          artist: "Dave Brubeck",
          album: "Time Out",
          url: "file:///take_five.flac",
          source: "local",
          type: "track",
        },
      ],
      tidalAvailable: true,
    }),
  ),
  play: vi.fn<LmsClient["play"]>().mockResolvedValue(ok(undefined)),
  addToQueue: vi.fn<LmsClient["addToQueue"]>().mockResolvedValue(ok(undefined)),
});

const createMockLastFmClient = (): LastFmClient => ({
  ...createLastFmClient({
    apiKey: "test-key",
    timeout: 5000,
    baseUrl: "https://ws.audioscrobbler.com/2.0/",
    language: "en",
  }),
  getTagTopTracks: vi.fn<LastFmClient["getTagTopTracks"]>().mockResolvedValue(
    ok([
      {
        name: "Take Five",
        artist: "Dave Brubeck",
        url: "https://last.fm/Dave Brubeck/Take Five",
      },
    ]),
  ),
});

describe("POST /api/genre-radio/start and stale radio mode contexts", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetRadioRuntimeState();
    server = Fastify({ logger: false });
    createGenreRadioRoute(
      server,
      createMockLmsClient(),
      createMockLastFmClient(),
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    resetRadioRuntimeState();
  });

  it("leaves only the genre context set when a personal and a loved context are stale", async () => {
    setPersonalRadioContext({
      username: "testuser",
      seedArtists: ["Misfits"],
      neighbours: [],
      cycle: 1,
    });
    setLovedRadioContext({ username: "testuser" });

    const response = await server.inject({
      method: "POST",
      url: "/api/genre-radio/start",
      payload: { genreName: "jazz" },
    });

    expect(response.statusCode).toBe(200);
    const state = getRadioQueueState();
    expect(state.genreRadioContext).toEqual({ genreName: "jazz", page: 2 });
    expect(state.personalRadioContext).toBeUndefined();
    expect(state.lovedRadioContext).toBeUndefined();
  });
});
