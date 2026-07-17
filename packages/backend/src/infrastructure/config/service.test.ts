import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isConfigured,
  loadConfig,
  saveConfig,
  type AppConfig,
} from "./service.js";

type JsonRecord = { readonly [key: string]: unknown };

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const makeTestConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  lmsHost: "192.168.1.100",
  lmsPort: 9000,
  playerId: "aa:bb:cc:dd:ee:ff",
  lastFmApiKey: "test-lastfm-key",
  fanartApiKey: "test-fanart-key",
  language: "en",
  users: [],
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
  ...overrides,
});

const readJsonRecord = (filePath: string): JsonRecord => {
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  expect(isJsonRecord(raw)).toBe(true);

  return isJsonRecord(raw) ? raw : {};
};

describe("ConfigService", () => {
  const paths = {
    current: (): { readonly tmpDir: string; readonly configPath: string } => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "signalform-config-test-"),
      );
      return {
        tmpDir,
        configPath: path.join(tmpDir, "config.json"),
      };
    },
  };

  beforeEach((): void => {
    vi.stubEnv("LMS_HOST", "");
    vi.stubEnv("LMS_PORT", "");
    vi.stubEnv("LMS_PLAYER_ID", "");
    vi.stubEnv("LASTFM_API_KEY", "");
    vi.stubEnv("FANART_API_KEY", "");
    vi.stubEnv("APP_LANGUAGE", "");
  });

  afterEach((): void => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("loadConfig", () => {
    it("returns env var defaults when config.json does not exist", () => {
      vi.stubEnv("LMS_HOST", "192.168.1.200");
      vi.stubEnv("LMS_PORT", "9001");
      vi.stubEnv("LMS_PLAYER_ID", "ff:ee:dd:cc:bb:aa");
      vi.stubEnv("APP_LANGUAGE", "de");

      const testPaths = paths.current();
      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.lmsHost).toBe("192.168.1.200");
      expect(result.value.lmsPort).toBe(9001);
      expect(result.value.playerId).toBe("ff:ee:dd:cc:bb:aa");
      expect(result.value.language).toBe("de");
    });

    it("defaults language to 'en' when APP_LANGUAGE is not set", () => {
      const testPaths = paths.current();
      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.language).toBe("en");
    });

    it("returns config from file when config.json exists", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify(makeTestConfig({ language: "de" })),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.lmsHost).toBe("192.168.1.100");
      expect(result.value.lmsPort).toBe(9000);
      expect(result.value.playerId).toBe("aa:bb:cc:dd:ee:ff");
      expect(result.value.language).toBe("de");
    });

    it("falls back to env var for missing keys in config file including language", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          lmsHost: "192.168.1.100",
          lmsPort: 9000,
          playerId: "aa:bb:cc:dd:ee:ff",
        }),
        "utf-8",
      );
      vi.stubEnv("LASTFM_API_KEY", "env-lastfm-key");
      vi.stubEnv("APP_LANGUAGE", "de");

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.lmsHost).toBe("192.168.1.100");
      expect(result.value.lastFmApiKey).toBe("env-lastfm-key");
      expect(result.value.language).toBe("de");
    });

    it("returns PARSE_ERROR for invalid JSON", () => {
      const testPaths = paths.current();
      fs.writeFileSync(testPaths.configPath, "not valid json", "utf-8");

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.type).toBe("PARSE_ERROR");
    });

    it("returns PARSE_ERROR when config.json is not a JSON object", () => {
      const testPaths = paths.current();
      fs.writeFileSync(testPaths.configPath, '"just a string"', "utf-8");

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.type).toBe("PARSE_ERROR");
    });

    it("preserves configuredAt timestamp from file", () => {
      const testPaths = paths.current();
      const config = makeTestConfig();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({ ...config, configuredAt: "2026-01-01T00:00:00.000Z" }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.configuredAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("migrates legacy lastFmUsername and lastFmSessionKey to a single user", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          lmsHost: "192.168.1.100",
          lmsPort: 9000,
          playerId: "aa:bb:cc:dd:ee:ff",
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([
        {
          id: "u1",
          name: "legacy-user",
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        },
      ]);
    });

    it("falls back to 'User 1' when legacy config has only lastFmSessionKey", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          lmsHost: "192.168.1.100",
          lmsPort: 9000,
          playerId: "aa:bb:cc:dd:ee:ff",
          lastFmSessionKey: "legacy-session-key",
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([
        {
          id: "u1",
          name: "User 1",
          lastFmUsername: undefined,
          lastFmSessionKey: "legacy-session-key",
        },
      ]);
    });

    it("prefers the users array over legacy lastFm keys", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          ...makeTestConfig(),
          users: [{ id: "u7", name: "Modern User" }],
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([
        {
          id: "u7",
          name: "Modern User",
          lastFmUsername: undefined,
          lastFmSessionKey: undefined,
        },
      ]);
    });

    it("prefers an empty users array over legacy lastFm keys", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          ...makeTestConfig(),
          users: [],
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([]);
    });

    it("skips malformed entries in the users array", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          ...makeTestConfig(),
          users: [
            { id: "u1", name: "Valid User" },
            { id: "u2" },
            { name: "No Id" },
            { id: "", name: "Empty Id" },
            { id: "u3", name: 42 },
            "not an object",
            null,
          ],
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([
        {
          id: "u1",
          name: "Valid User",
          lastFmUsername: undefined,
          lastFmSessionKey: undefined,
        },
      ]);
    });

    it("returns empty users when neither users array nor legacy keys exist", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          lmsHost: "192.168.1.100",
          lmsPort: 9000,
          playerId: "aa:bb:cc:dd:ee:ff",
        }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([]);
    });

    it("returns empty users when config.json does not exist", () => {
      const testPaths = paths.current();

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.users).toEqual([]);
    });

    it("reads lmsMacAddress as undefined when absent from the file", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify(makeTestConfig()),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.lmsMacAddress).toBeUndefined();
    });

    it("reads an empty lmsMacAddress string as undefined", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({ ...makeTestConfig(), lmsMacAddress: "" }),
        "utf-8",
      );

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.lmsMacAddress).toBeUndefined();
    });

    it("falls back to env default language when file has invalid language", () => {
      const testPaths = paths.current();
      const config = makeTestConfig();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({ ...config, language: "fr" }),
        "utf-8",
      );
      vi.stubEnv("APP_LANGUAGE", "de");

      const result = loadConfig(testPaths.configPath);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.language).toBe("de");
    });
  });

  describe("saveConfig", () => {
    it("writes config to file and can be read back including language", () => {
      const testPaths = paths.current();
      const config = makeTestConfig({ language: "de" });

      const saveResult = saveConfig(config, testPaths.configPath);

      expect(saveResult.ok).toBe(true);
      expect(fs.existsSync(testPaths.configPath)).toBe(true);

      const loadResult = loadConfig(testPaths.configPath);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) {
        return;
      }
      expect(loadResult.value.lmsHost).toBe(config.lmsHost);
      expect(loadResult.value.lmsPort).toBe(config.lmsPort);
      expect(loadResult.value.playerId).toBe(config.playerId);
      expect(loadResult.value.language).toBe("de");
    });

    it("round-trips the users array through saveConfig and loadConfig", () => {
      const testPaths = paths.current();
      const config = makeTestConfig({
        users: [
          {
            id: "u1",
            name: "Alice",
            lastFmUsername: "alice-fm",
            lastFmSessionKey: "alice-session-key",
          },
          { id: "u2", name: "Bob" },
        ],
      });

      const saveResult = saveConfig(config, testPaths.configPath);
      expect(saveResult.ok).toBe(true);

      const loadResult = loadConfig(testPaths.configPath);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) {
        return;
      }
      expect(loadResult.value.users).toEqual(config.users);
    });

    it("round-trips lmsMacAddress through saveConfig and loadConfig", () => {
      const testPaths = paths.current();
      const config = makeTestConfig({ lmsMacAddress: "00:11:22:33:44:55" });

      const saveResult = saveConfig(config, testPaths.configPath);
      expect(saveResult.ok).toBe(true);

      const loadResult = loadConfig(testPaths.configPath);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) {
        return;
      }
      expect(loadResult.value.lmsMacAddress).toBe("00:11:22:33:44:55");
    });

    it("keeps lmsMacAddress undefined through save and load when not set", () => {
      const testPaths = paths.current();

      const saveResult = saveConfig(makeTestConfig(), testPaths.configPath);
      expect(saveResult.ok).toBe(true);

      const loadResult = loadConfig(testPaths.configPath);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) {
        return;
      }
      expect(loadResult.value.lmsMacAddress).toBeUndefined();
    });

    it("drops legacy lastFm keys on the next save", () => {
      const testPaths = paths.current();
      fs.writeFileSync(
        testPaths.configPath,
        JSON.stringify({
          lmsHost: "192.168.1.100",
          lmsPort: 9000,
          playerId: "aa:bb:cc:dd:ee:ff",
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        }),
        "utf-8",
      );

      const loadResult = loadConfig(testPaths.configPath);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) {
        return;
      }

      const saveResult = saveConfig(loadResult.value, testPaths.configPath);
      expect(saveResult.ok).toBe(true);

      const raw = readJsonRecord(testPaths.configPath);
      expect(raw["lastFmUsername"]).toBeUndefined();
      expect(raw["lastFmSessionKey"]).toBeUndefined();
      expect(raw["users"]).toEqual([
        {
          id: "u1",
          name: "legacy-user",
          lastFmUsername: "legacy-user",
          lastFmSessionKey: "legacy-session-key",
        },
      ]);
    });

    it("writes configuredAt timestamp on save", () => {
      const testPaths = paths.current();
      const config = makeTestConfig();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-03T04:05:06.000Z"));

      const saveResult = saveConfig(config, testPaths.configPath);

      expect(saveResult.ok).toBe(true);
      const raw = readJsonRecord(testPaths.configPath);
      expect(raw["configuredAt"]).toBe("2026-02-03T04:05:06.000Z");
      expect(raw["language"]).toBe("en");
    });

    it("returns VALIDATION_ERROR for invalid port", () => {
      const testPaths = paths.current();
      const result = saveConfig(
        makeTestConfig({ lmsPort: 0 }),
        testPaths.configPath,
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.type).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain(
        "lmsPort must be between 1 and 65535",
      );
    });

    it("returns VALIDATION_ERROR for port > 65535", () => {
      const testPaths = paths.current();
      const result = saveConfig(
        makeTestConfig({ lmsPort: 99999 }),
        testPaths.configPath,
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error.type).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("99999");
    });

    it("concurrent saves do not corrupt the file", async () => {
      const testPaths = paths.current();
      const configs = Array.from({ length: 5 }, (_, index) =>
        makeTestConfig({
          playerId: `aa:bb:cc:dd:ee:${String(index).padStart(2, "0")}`,
          language: index % 2 === 0 ? "en" : "de",
        }),
      );

      await Promise.all(
        configs.map((config) =>
          Promise.resolve(saveConfig(config, testPaths.configPath)),
        ),
      );

      const raw = fs.readFileSync(testPaths.configPath, "utf-8");
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("creates parent directory if it does not exist", () => {
      const testPaths = paths.current();
      const nestedPath = path.join(
        testPaths.tmpDir,
        "nested",
        "subdir",
        "config.json",
      );

      const result = saveConfig(makeTestConfig(), nestedPath);

      expect(result.ok).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe("isConfigured", () => {
    it("returns true when lmsHost, lmsPort > 0, and playerId are set", () => {
      expect(isConfigured(makeTestConfig())).toBe(true);
    });

    it("returns false when lmsHost is empty", () => {
      expect(isConfigured(makeTestConfig({ lmsHost: "" }))).toBe(false);
    });

    it("returns false when lmsPort is 0", () => {
      expect(isConfigured(makeTestConfig({ lmsPort: 0 }))).toBe(false);
    });

    it("returns false when playerId is empty", () => {
      expect(isConfigured(makeTestConfig({ playerId: "" }))).toBe(false);
    });

    it("returns false when lmsHost is only whitespace", () => {
      expect(isConfigured(makeTestConfig({ lmsHost: "   " }))).toBe(false);
    });
  });
});
