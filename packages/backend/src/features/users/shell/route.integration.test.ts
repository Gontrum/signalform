import Fastify, { type FastifyInstance } from "fastify";
import type { Result } from "@signalform/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUsersRoute } from "./route.js";
import {
  getActiveListenerId,
  registerActiveListenerClaim,
  resetActiveListener,
  setActiveListenerId,
} from "./active-listener.js";
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
    {
      id: "u1",
      name: "Alice",
      lastFmUsername: "alice",
      lastFmSessionKey: "sk-alice",
    },
    { id: "u2", name: "Bob" },
  ],
  lastFmSharedSecret: "test-secret",
});

const makeServer = (): FastifyInstance => {
  const server = Fastify({ logger: false });
  createUsersRoute(server);
  return server;
};

// onResponse hooks run after the response is dispatched — flush pending
// callbacks before asserting on active-listener state.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  resetActiveListener();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/users", () => {
  it("returns masked users without activeListenerId when unset", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({ method: "GET", url: "/api/users" });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["users"]).toEqual([
      {
        id: "u1",
        name: "Alice",
        lastFmUsername: "alice",
        hasLastFmSession: true,
      },
      { id: "u2", name: "Bob", hasLastFmSession: false },
    ]);
    expect("activeListenerId" in body).toBe(false);
  });

  it("includes activeListenerId when set", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    setActiveListenerId("u2");

    const server = makeServer();
    const response = await server.inject({ method: "GET", url: "/api/users" });

    expect(response.statusCode).toBe(200);
    expect(readJsonRecord(response.body)["activeListenerId"]).toBe("u2");
  });
});

describe("POST /api/users", () => {
  it("creates a user and returns 201 with id and name", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "  Carol  " },
    });

    expect(response.statusCode).toBe(201);
    const body = readJsonRecord(response.body);
    expect(typeof body["id"]).toBe("string");
    expect(body["name"]).toBe("Carol");

    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [...makeBaseConfig().users, { id: body["id"], name: "Carol" }],
      }),
    );
  });

  it("returns 400 for an empty name", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "   " },
    });

    expect(response.statusCode).toBe(400);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });
});

describe("PUT /api/users/:id", () => {
  it("renames a user and returns 200", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/users/u2",
      payload: { name: "Robert" },
    });

    expect(response.statusCode).toBe(200);
    expect(readJsonRecord(response.body)).toEqual({
      id: "u2",
      name: "Robert",
    });
    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [makeBaseConfig().users[0], { id: "u2", name: "Robert" }],
      }),
    );
  });

  it("returns 404 for an unknown user", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/users/ghost",
      payload: { name: "Robert" },
    });

    expect(response.statusCode).toBe(404);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty name", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/users/u2",
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/:id", () => {
  it("removes the user and returns 204", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/users/u2",
    });

    expect(response.statusCode).toBe(204);
    expect(configModule.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ users: [makeBaseConfig().users[0]] }),
    );
  });

  it("returns 404 for an unknown user", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/users/ghost",
    });

    expect(response.statusCode).toBe(404);
    expect(configModule.saveConfig).not.toHaveBeenCalled();
  });

  it("clears the active listener when the deleted user was active", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });
    setActiveListenerId("u2");

    const server = makeServer();
    const response = await server.inject({
      method: "DELETE",
      url: "/api/users/u2",
    });

    expect(response.statusCode).toBe(204);
    expect(getActiveListenerId()).toBeUndefined();
  });

  it("keeps the active listener when a different user is deleted", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });
    configModule.saveConfig.mockReturnValue({ ok: true, value: undefined });
    setActiveListenerId("u1");

    const server = makeServer();
    await server.inject({ method: "DELETE", url: "/api/users/u2" });

    expect(getActiveListenerId()).toBe("u1");
  });
});

describe("PUT /api/users/active", () => {
  it("sets the active listener and returns 204", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/users/active",
      payload: { userId: "u2" },
    });

    expect(response.statusCode).toBe(204);
    expect(getActiveListenerId()).toBe("u2");
  });

  it("returns 400 for an unknown user", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/users/active",
      payload: { userId: "ghost" },
    });

    expect(response.statusCode).toBe(400);
    expect(getActiveListenerId()).toBeUndefined();
  });
});

describe("active listener claim hook", () => {
  const makeClaimServer = (): FastifyInstance => {
    const server = Fastify({ logger: false });
    registerActiveListenerClaim(server);
    server.post("/api/playback/play", async (_request, reply) =>
      reply.code(200).send({ ok: true }),
    );
    server.post("/api/queue/jump", async (_request, reply) =>
      reply.code(400).send({ error: "bad request" }),
    );
    server.post("/api/not-a-claim-path", async (_request, reply) =>
      reply.code(200).send({ ok: true }),
    );
    return server;
  };

  it("sets the active listener on a successful POST to a claim path", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/playback/play",
      headers: { "x-signalform-user": "u1" },
      payload: {},
    });
    await flush();

    expect(response.statusCode).toBe(200);
    expect(getActiveListenerId()).toBe("u1");
  });

  it("does not claim on a 4xx response", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    await server.inject({
      method: "POST",
      url: "/api/queue/jump",
      headers: { "x-signalform-user": "u1" },
      payload: {},
    });
    await flush();

    expect(getActiveListenerId()).toBeUndefined();
  });

  it("does not claim on a non-claim path", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    await server.inject({
      method: "POST",
      url: "/api/not-a-claim-path",
      headers: { "x-signalform-user": "u1" },
      payload: {},
    });
    await flush();

    expect(getActiveListenerId()).toBeUndefined();
  });

  it("does not claim for an unknown user id", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    await server.inject({
      method: "POST",
      url: "/api/playback/play",
      headers: { "x-signalform-user": "ghost" },
      payload: {},
    });
    await flush();

    expect(getActiveListenerId()).toBeUndefined();
  });

  it("does not claim without the header", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    await server.inject({
      method: "POST",
      url: "/api/playback/play",
      payload: {},
    });
    await flush();

    expect(getActiveListenerId()).toBeUndefined();
  });

  it("ignores the query string when matching claim paths", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeBaseConfig(),
    });

    const server = makeClaimServer();
    await server.inject({
      method: "POST",
      url: "/api/playback/play?foo=bar",
      headers: { "x-signalform-user": "u1" },
      payload: {},
    });
    await flush();

    expect(getActiveListenerId()).toBe("u1");
  });
});
