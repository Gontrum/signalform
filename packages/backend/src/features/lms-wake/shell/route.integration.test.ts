import Fastify, { type FastifyInstance } from "fastify";
import type { Result } from "@signalform/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLmsWakeRoute } from "./route.js";
import type {
  AppConfig,
  ConfigError,
} from "../../../infrastructure/config/index.js";

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

const isMockedConfigModule = (
  value: ConfigModule,
): value is MockedConfigModule => {
  return isMockFunction(value.loadConfig) && isMockFunction(value.saveConfig);
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

type SendCallback = (error: Error | null) => void;
type SendFn = (
  msg: Uint8Array,
  port: number,
  address: string,
  callback?: SendCallback,
) => void;

const { socketMock, createSocketMock } = vi.hoisted(() => {
  const socket = {
    bind: vi.fn((callback?: () => void) => {
      callback?.();
    }),
    setBroadcast: vi.fn(),
    send: vi.fn(
      (
        _msg: Uint8Array,
        _port: number,
        _address: string,
        callback?: SendCallback,
      ) => {
        callback?.(null);
      },
    ),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  };
  return {
    socketMock: socket,
    createSocketMock: vi.fn(() => socket),
  };
});

vi.mock("node:dgram", () => ({
  createSocket: createSocketMock,
  default: { createSocket: createSocketMock },
}));

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  lmsHost: "192.168.1.100",
  lmsPort: 9000,
  playerId: "aa:bb:cc:dd:ee:ff",
  lastFmApiKey: "test-lastfm",
  fanartApiKey: "test-fanart",
  language: "en",
  users: [],
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
  ...overrides,
});

const makeServer = (): FastifyInstance => {
  const server = Fastify({ logger: false });
  createLmsWakeRoute(server);
  return server;
};

describe("POST /api/lms/wake", () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    socketMock.bind.mockImplementation((callback?: () => void) => {
      callback?.();
    });
    socketMock.send.mockImplementation(
      (
        _msg: Uint8Array,
        _port: number,
        _address: string,
        callback?: SendCallback,
      ) => {
        callback?.(null);
      },
    );
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it("returns 204 without sending a packet when no MAC is configured", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig(),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lms/wake",
    });

    expect(response.statusCode).toBe(204);
    expect(createSocketMock).not.toHaveBeenCalled();
    expect(socketMock.send).not.toHaveBeenCalled();
  });

  it("returns 204 and sends the magic packet to unicast and broadcast targets", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig({ lmsMacAddress: "00:11:22:33:44:55" }),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lms/wake",
    });

    expect(response.statusCode).toBe(204);
    expect(createSocketMock).toHaveBeenCalledWith("udp4");
    // A persistent error listener must guard the socket's whole lifetime so a
    // late "error" event can never crash the process as unhandled.
    expect(socketMock.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(socketMock.setBroadcast).toHaveBeenCalledWith(true);
    expect(socketMock.send).toHaveBeenCalledTimes(2);

    const sendCalls = socketMock.send.mock.calls as ReadonlyArray<
      Parameters<SendFn>
    >;
    const targets = sendCalls.map((call) => call[2]);
    expect(targets).toContain("192.168.1.100");
    expect(targets).toContain("255.255.255.255");
    sendCalls.forEach(([packet, port]) => {
      expect(packet).toHaveLength(102);
      expect(port).toBe(9);
    });
    expect(socketMock.close).toHaveBeenCalled();
  });

  it("returns 204 even when every send reports an error", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig({ lmsMacAddress: "00:11:22:33:44:55" }),
    });
    socketMock.send.mockImplementation(
      (
        _msg: Uint8Array,
        _port: number,
        _address: string,
        callback?: SendCallback,
      ) => {
        callback?.(new Error("EHOSTUNREACH"));
      },
    );

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lms/wake",
    });

    expect(response.statusCode).toBe(204);
  });

  it("returns 400 when the stored MAC address is malformed", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: true,
      value: makeConfig({ lmsMacAddress: "not-a-mac" }),
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lms/wake",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Not a valid MAC address: "not-a-mac"',
    });
    expect(socketMock.send).not.toHaveBeenCalled();
  });

  it("returns 500 when the config cannot be loaded", async () => {
    const configModule = await getConfigModule();
    configModule.loadConfig.mockReturnValue({
      ok: false,
      error: { type: "PARSE_ERROR", message: "bad json" },
    });

    const server = makeServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/lms/wake",
    });

    expect(response.statusCode).toBe(500);
  });
});
