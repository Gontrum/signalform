import Fastify from "fastify";
import type { Result } from "@signalform/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maskConfig, mergeConfigUpdate } from "../core/service.js";
import { createConfigRoute } from "./route.js";
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

const makeServer = (): ReturnType<typeof Fastify> => {
  const server = Fastify({ logger: false });
  createConfigRoute(server);
  return server;
};

const makeConfig = (): AppConfig => ({
  lmsHost: "192.168.1.100",
  lmsPort: 9000,
  playerId: "aa:bb:cc:dd:ee:ff",
  lastFmApiKey: "test-lastfm",
  fanartApiKey: "test-fanart",
  language: "en",
});

describe("GET /api/config", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it("returns 200 with masked config including language", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });

    const server = makeServer();
    const response = await server.inject({ method: "GET", url: "/api/config" });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["lmsHost"]).toBe("192.168.1.100");
    expect(body["lmsPort"]).toBe(9000);
    expect(body["playerId"]).toBe("aa:bb:cc:dd:ee:ff");
    expect(body["lastFmApiKey"]).toBeUndefined();
    expect(body["fanartApiKey"]).toBeUndefined();
    expect(body["hasLastFmKey"]).toBe(true);
    expect(body["hasFanartKey"]).toBe(true);
    expect(body["isConfigured"]).toBe(true);
    expect(body["language"]).toBe("en");
  });

  it("returns 500 when config cannot be loaded", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: false,
      error: { type: "PARSE_ERROR", message: "bad json" },
    });

    const server = makeServer();
    const response = await server.inject({ method: "GET", url: "/api/config" });

    expect(response.statusCode).toBe(500);
  });
});

describe("PUT /api/config", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it("returns 200 with updated masked config", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });
    configModule.saveConfig.mockReturnValue({
      ok: true,
      value: undefined,
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { playerId: "ff:ee:dd:cc:bb:aa" },
    });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["playerId"]).toBe("ff:ee:dd:cc:bb:aa");
    expect(body["lmsHost"]).toBe("192.168.1.100");
    expect(body["language"]).toBe("en");
  });

  it("returns 400 for invalid port", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { lmsPort: 99999 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 500 when save fails", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });
    configModule.saveConfig.mockReturnValue({
      ok: false,
      error: { type: "WRITE_ERROR", message: "disk full" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { lmsHost: "192.168.1.200" },
    });

    expect(response.statusCode).toBe(500);
  });

  it("allows clearing API keys by passing empty string", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });
    configModule.saveConfig.mockReturnValue({
      ok: true,
      value: undefined,
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { lastFmApiKey: "" },
    });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["hasLastFmKey"]).toBe(false);
  });

  it("allows updating language to 'de' and returns it in response", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });
    configModule.saveConfig.mockReturnValue({
      ok: true,
      value: undefined,
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { language: "de" },
    });

    expect(response.statusCode).toBe(200);
    const body = readJsonRecord(response.body);
    expect(body["language"]).toBe("de");
  });

  it("rejects invalid language values", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { language: "fr" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("config core helpers", () => {
  it("masks secrets and preserves status fields", () => {
    const masked = maskConfig(makeConfig());

    expect(masked.hasLastFmKey).toBe(true);
    expect(masked.hasFanartKey).toBe(true);
    expect(masked.language).toBe("en");
  });

  it("merges updates without overwriting untouched fields", () => {
    const merged = mergeConfigUpdate(makeConfig(), {
      playerId: "ff:ee:dd:cc:bb:aa",
      language: "de",
    });

    expect(merged.playerId).toBe("ff:ee:dd:cc:bb:aa");
    expect(merged.language).toBe("de");
    expect(merged.lmsHost).toBe("192.168.1.100");
  });
});
