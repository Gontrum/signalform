import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { createSetupRoute } from "./shell/route.js";
import { discoverLmsServers, fetchLmsPlayers } from "./shell/discovery.js";
import { loadConfig } from "../../infrastructure/config/index.js";

type MockConfigValue = {
  readonly lmsHost: string;
  readonly lmsPort: number;
  readonly playerId: string;
  readonly lastFmApiKey: string;
  readonly fanartApiKey: string;
  readonly language: import("../../infrastructure/config/service.js").Language;
};

type DiscoverResponseBody = {
  readonly servers: readonly {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly version: string;
  }[];
};

type PlayersResponseBody = {
  readonly players: readonly {
    readonly id: string;
    readonly name: string;
    readonly model: string;
    readonly connected: boolean;
  }[];
};

const DEFAULT_CONFIG: MockConfigValue = {
  lmsHost: "",
  lmsPort: 9000,
  playerId: "",
  lastFmApiKey: "",
  fanartApiKey: "",
  language: "en",
};

const parseDiscoverResponseBody = (value: string): DiscoverResponseBody => {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) {
    return { servers: [] };
  }

  const servers = Reflect.get(parsed, "servers");
  return {
    servers: Array.isArray(servers)
      ? servers.filter(
          (server): server is DiscoverResponseBody["servers"][number] => {
            return typeof server === "object" && server !== null;
          },
        )
      : [],
  };
};

const parsePlayersResponseBody = (value: string): PlayersResponseBody => {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) {
    return { players: [] };
  }

  const players = Reflect.get(parsed, "players");
  return {
    players: Array.isArray(players)
      ? players.filter(
          (player): player is PlayersResponseBody["players"][number] => {
            return typeof player === "object" && player !== null;
          },
        )
      : [],
  };
};

vi.mock("./shell/discovery.js", () => ({
  discoverLmsServers: vi.fn(),
  fetchLmsPlayers: vi.fn(),
}));

vi.mock("../../infrastructure/config", () => ({
  loadConfig: vi.fn().mockReturnValue({
    ok: true,
    value: {
      lmsHost: "",
      lmsPort: 9000,
      playerId: "",
      lastFmApiKey: "",
      fanartApiKey: "",
      language: "en",
    },
  }),
}));

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedDiscoverLmsServers = vi.mocked(discoverLmsServers);
const mockedFetchLmsPlayers = vi.mocked(fetchLmsPlayers);

const makeServer = (): ReturnType<typeof Fastify> => {
  const server = Fastify({ logger: false });
  createSetupRoute(server);
  return server;
};

describe("GET /api/setup/discover", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockedLoadConfig.mockReturnValue({
      ok: true,
      value: DEFAULT_CONFIG,
    });
  });

  it("returns 200 with discovered servers", async () => {
    mockedDiscoverLmsServers.mockResolvedValue({
      ok: true,
      value: [
        {
          host: "192.168.1.100",
          port: 9000,
          name: "Living Room LMS",
          version: "9.0.3",
        },
      ],
    });

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/setup/discover",
    });

    expect(response.statusCode).toBe(200);
    const body = parseDiscoverResponseBody(response.body);
    expect(body.servers).toHaveLength(1);
    expect(body.servers[0]?.host).toBe("192.168.1.100");
  });

  it("returns 200 with empty array when discovery fails", async () => {
    mockedDiscoverLmsServers.mockResolvedValue({
      ok: false,
      error: { type: "UDP_ERROR", message: "EPERM" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/setup/discover",
    });

    expect(response.statusCode).toBe(200);
    const body = parseDiscoverResponseBody(response.body);
    expect(body.servers).toHaveLength(0);
  });
});

describe("GET /api/setup/players", () => {
  it("returns 200 with player list", async () => {
    mockedFetchLmsPlayers.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "aa:bb:cc:dd:ee:ff",
          name: "Living Room",
          model: "squeezelite",
          connected: true,
        },
      ],
    });

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/setup/players?host=192.168.1.100&port=9000",
    });

    expect(response.statusCode).toBe(200);
    const body = parsePlayersResponseBody(response.body);
    expect(body.players).toHaveLength(1);
    expect(body.players[0]?.id).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("returns 400 when host is missing", async () => {
    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/setup/players",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 502 when LMS is unreachable", async () => {
    mockedFetchLmsPlayers.mockResolvedValue({
      ok: false,
      error: { type: "NETWORK_ERROR", message: "Connection refused" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/setup/players?host=192.168.1.100",
    });

    expect(response.statusCode).toBe(502);
  });
});
