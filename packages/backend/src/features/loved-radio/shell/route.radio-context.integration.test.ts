import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok } from "@signalform/shared";
import { createLovedRadioRoute } from "./route.js";
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
  setGenreRadioContext,
  setPersonalRadioContext,
} from "../../radio-mode/shell/radio-state.js";

vi.mock("../../../infrastructure/config/index.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isConfigured: vi.fn(),
  DEFAULT_CONFIG_PATH: "/tmp/test-config.json",
}));

import { loadConfig } from "../../../infrastructure/config/index.js";

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
          title: "Creep",
          artist: "Radiohead",
          album: "Pablo Honey",
          url: "file:///creep.flac",
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
  getUserLovedTracks: vi
    .fn<LastFmClient["getUserLovedTracks"]>()
    .mockResolvedValue(
      ok([
        {
          name: "Creep",
          artist: "Radiohead",
          url: "https://last.fm/Radiohead/Creep",
        },
      ]),
    ),
});

describe("POST /api/loved-radio/start and stale radio mode contexts", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    resetRadioRuntimeState();
    vi.mocked(loadConfig).mockReturnValue({
      ok: true,
      value: {
        lmsHost: "localhost",
        lmsPort: 9000,
        playerId: "00:00:00:00:00:00",
        lastFmApiKey: "key",
        fanartApiKey: "",
        language: "en",
        personalRadioEnabled: true,
        users: [{ id: "u1", name: "Tester", lastFmUsername: "testuser" }],
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      },
    });
    server = Fastify({ logger: false });
    createLovedRadioRoute(
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

  it("leaves only the loved context set when a personal and a genre context are stale", async () => {
    setPersonalRadioContext({
      username: "testuser",
      seedArtists: ["Misfits"],
      neighbours: [],
      cycle: 1,
    });
    setGenreRadioContext({ genreName: "punk", page: 3 });

    const response = await server.inject({
      method: "POST",
      url: "/api/loved-radio/start",
      headers: { "x-signalform-user": "u1" },
    });

    expect(response.statusCode).toBe(200);
    const state = getRadioQueueState();
    expect(state.lovedRadioContext).toEqual({ username: "testuser" });
    expect(state.personalRadioContext).toBeUndefined();
    expect(state.genreRadioContext).toBeUndefined();
  });
});
