import Fastify from "fastify";
import type { Result } from "@signalform/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLastFmAuthRoute } from "./route.js";
import type {
  AppConfig,
  ConfigError,
} from "../../../infrastructure/config/index.js";

type JsonRecord = { readonly [key: string]: unknown };
type ConfigModule = typeof import("../../../infrastructure/config/index.js");
type LoadConfigFn = (configPath?: string) => Result<AppConfig, ConfigError>;
type SaveConfigFn = (
  config: AppConfig,
  configPath?: string,
) => Result<void, ConfigError>;

type MockedConfigModule = ConfigModule & {
  readonly loadConfig: ReturnType<typeof vi.fn<LoadConfigFn>>;
  readonly saveConfig: ReturnType<typeof vi.fn<SaveConfigFn>>;
};

const isMockFunction = (value: unknown): value is ReturnType<typeof vi.fn> => {
  return typeof value === "function" && "mock" in value;
};

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMockedConfigModule = (
  value: ConfigModule,
): value is MockedConfigModule => {
  return isMockFunction(value.loadConfig) && isMockFunction(value.saveConfig);
};

const readJsonRecord = (body: string): JsonRecord => {
  const parsed: unknown = JSON.parse(body);
  expect(isJsonRecord(parsed)).toBe(true);
  return isJsonRecord(parsed) ? parsed : {};
};

vi.mock("../../../infrastructure/config", async (importOriginal) => {
  const actual = await importOriginal<ConfigModule>();
  return {
    ...actual,
    loadConfig: vi.fn<LoadConfigFn>(),
    saveConfig: vi.fn<SaveConfigFn>(),
  } satisfies Partial<MockedConfigModule>;
});

// Mock core functions so the route test does not depend on @core-dev implementation
vi.mock("../core/service.js", () => ({
  buildSignature: vi.fn(
    (_params: Record<string, string>, _secret: string) => "mock-sig",
  ),
  buildAuthUrl: vi.fn(
    (apiKey: string, token: string) =>
      `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`,
  ),
}));

const getConfigModule = async (): Promise<MockedConfigModule> => {
  const module = await import("../../../infrastructure/config/index.js");
  expect(isMockedConfigModule(module)).toBe(true);
  return isMockedConfigModule(module)
    ? module
    : {
        ...module,
        loadConfig: vi.fn<LoadConfigFn>(),
        saveConfig: vi.fn<SaveConfigFn>(),
      };
};

const makeBaseConfig = (): AppConfig => ({
  lmsHost: "localhost",
  lmsPort: 9000,
  playerId: "00:00:00:00:00:00",
  lastFmApiKey: "test-api-key",
  fanartApiKey: "",
  language: "en",
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
  users: [
    { id: "u1", name: "Alice" },
    {
      id: "u2",
      name: "Bob",
      lastFmUsername: "bob",
      lastFmSessionKey: "sk-bob",
    },
  ],
  lastFmSharedSecret: "test-secret",
});

const makeServer = (onConfigChange = vi.fn()): ReturnType<typeof Fastify> => {
  const server = Fastify({ logger: false });
  createLastFmAuthRoute(server, onConfigChange);
  return server;
};

describe("GET /api/lastfm/auth/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when no lastFmApiKey in config", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: { ...makeBaseConfig(), lastFmApiKey: "" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/lastfm/auth/request",
    });

    expect(response.statusCode).toBe(400);
    const body = readJsonRecord(response.body);
    expect(typeof body["error"]).toBe("string");
  });

  it("calls Last.fm and returns { token, authUrl } on success", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: "abc123" }),
      }),
    );

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/lastfm/auth/request",
    });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["token"]).toBe("abc123");
    expect(typeof body["authUrl"]).toBe("string");
    expect(
      typeof body["authUrl"] === "string" &&
        body["authUrl"].includes("last.fm"),
    ).toBe(true);
  });

  it("returns 502 on Last.fm failure (non-ok response)", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/lastfm/auth/request",
    });

    expect(response.statusCode).toBe(502);
    const body = readJsonRecord(response.body);
    expect(body["error"]).toBe("Failed to obtain Last.fm auth token");
  });

  it("returns 502 when fetch throws", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    const server = makeServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/lastfm/auth/request",
    });

    expect(response.statusCode).toBe(502);
  });
});

describe("POST /api/lastfm/auth/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when token body is missing", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/auth/complete",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when lastFmSharedSecret is missing", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: { ...makeBaseConfig(), lastFmSharedSecret: undefined },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/auth/complete",
      payload: { token: "sometoken", userId: "u1" },
    });

    expect(response.statusCode).toBe(400);
    const body = readJsonRecord(response.body);
    expect(typeof body["error"]).toBe("string");
  });

  it("writes the session into the matching user and returns { username }", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: { key: "session-key-123", name: "testuser" },
          }),
      }),
    );

    const onConfigChange = vi.fn();
    const server = makeServer(onConfigChange);
    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/auth/complete",
      payload: { token: "mytoken", userId: "u1" },
    });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["username"]).toBe("testuser");

    const expectedUsers = [
      {
        id: "u1",
        name: "Alice",
        lastFmUsername: "testuser",
        lastFmSessionKey: "session-key-123",
      },
      {
        id: "u2",
        name: "Bob",
        lastFmUsername: "bob",
        lastFmSessionKey: "sk-bob",
      },
    ];
    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ users: expectedUsers }),
    );
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ users: expectedUsers }),
    );
  });

  it("returns 404 for an unknown userId", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            session: { key: "session-key-123", name: "testuser" },
          }),
      }),
    );

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/auth/complete",
      payload: { token: "mytoken", userId: "ghost" },
    });

    expect(response.statusCode).toBe(404);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });

  it("returns 502 when Last.fm session request fails", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    );

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lastfm/auth/complete",
      payload: { token: "mytoken", userId: "u1" },
    });

    expect(response.statusCode).toBe(502);
    const body = readJsonRecord(response.body);
    expect(body["error"]).toBe("Failed to complete Last.fm authentication");
  });
});

describe("DELETE /api/lastfm/auth/:userId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the user's session and disables scrobbling when it was the last session", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: { ...makeBaseConfig(), scrobblingEnabled: true },
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const onConfigChange = vi.fn();
    const server = makeServer(onConfigChange);
    const response = await server.inject({
      method: "DELETE",
      url: "/api/lastfm/auth/u2",
    });

    expect(response.statusCode).toBe(204);

    const expectedUsers = [
      { id: "u1", name: "Alice" },
      { id: "u2", name: "Bob" },
    ];
    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        users: expectedUsers,
        scrobblingEnabled: false,
      }),
    );
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        users: expectedUsers,
        scrobblingEnabled: false,
      }),
    );
  });

  it("keeps scrobbling enabled when another user still has a session", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: {
        ...makeBaseConfig(),
        scrobblingEnabled: true,
        users: [
          {
            id: "u1",
            name: "Alice",
            lastFmUsername: "alice",
            lastFmSessionKey: "sk-alice",
          },
          {
            id: "u2",
            name: "Bob",
            lastFmUsername: "bob",
            lastFmSessionKey: "sk-bob",
          },
        ],
      },
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/lastfm/auth/u2",
    });

    expect(response.statusCode).toBe(204);
    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ scrobblingEnabled: true }),
    );
  });

  it("returns 404 for an unknown userId", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/lastfm/auth/ghost",
    });

    expect(response.statusCode).toBe(404);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });

  it("returns 500 when save fails", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({
      ok: false,
      error: { type: "WRITE_ERROR", message: "disk full" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/lastfm/auth/u2",
    });

    expect(response.statusCode).toBe(500);
  });
});
