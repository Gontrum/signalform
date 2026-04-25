/**
 * Application Configuration Service
 *
 * Reads and writes config.json atomically.
 * Falls back to environment variables when config.json is missing or incomplete.
 */

import fs from "node:fs";
import path from "node:path";
import { err, fromThrowable, ok, type Result } from "@signalform/shared";

export type Language = "en" | "de";

export type AppConfig = {
  readonly lmsHost: string;
  readonly lmsPort: number;
  readonly playerId: string;
  readonly lastFmApiKey: string;
  readonly fanartApiKey: string;
  readonly language: Language;
  readonly configuredAt?: string;
};

export type ConfigError =
  | { readonly type: "READ_ERROR"; readonly message: string }
  | { readonly type: "WRITE_ERROR"; readonly message: string }
  | { readonly type: "PARSE_ERROR"; readonly message: string }
  | { readonly type: "VALIDATION_ERROR"; readonly message: string };

export const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "config.json");

type JsonRecord = { readonly [key: string]: unknown };

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getEnvLanguage = (): Language => {
  const env = process.env["APP_LANGUAGE"]?.toLowerCase();
  return env === "de" ? "de" : "en";
};

const getEnvDefaults = (): AppConfig => ({
  lmsHost: process.env["LMS_HOST"] ?? "",
  lmsPort: Number(process.env["LMS_PORT"] ?? 9000),
  playerId: process.env["LMS_PLAYER_ID"] ?? "",
  lastFmApiKey: process.env["LASTFM_API_KEY"] ?? "",
  fanartApiKey: process.env["FANART_API_KEY"] ?? "",
  language: getEnvLanguage(),
});

const parseJsonRecord = (raw: string): Result<JsonRecord, ConfigError> => {
  const parsedResult = fromThrowable(
    () => JSON.parse(raw) as unknown,
    () =>
      ({
        type: "PARSE_ERROR",
        message: "config.json contains invalid JSON",
      }) satisfies ConfigError,
  );

  if (!parsedResult.ok) {
    return parsedResult;
  }

  if (!isJsonRecord(parsedResult.value)) {
    return err({
      type: "PARSE_ERROR",
      message: "config.json must be a JSON object",
    });
  }

  return ok(parsedResult.value);
};

const readNonEmptyString = (
  record: JsonRecord,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
};

const readPositiveNumber = (
  record: JsonRecord,
  key: string,
): number | undefined => {
  const value = record[key];
  return typeof value === "number" && value > 0 ? value : undefined;
};

const readOptionalString = (
  record: JsonRecord,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const readLanguage = (record: JsonRecord): Language | undefined => {
  const value = record["language"];
  if (value === "en" || value === "de") {
    return value;
  }
  return undefined;
};

const toConfig = (record: JsonRecord, envDefaults: AppConfig): AppConfig => ({
  lmsHost: readNonEmptyString(record, "lmsHost") ?? envDefaults.lmsHost,
  lmsPort: readPositiveNumber(record, "lmsPort") ?? envDefaults.lmsPort,
  playerId: readNonEmptyString(record, "playerId") ?? envDefaults.playerId,
  lastFmApiKey:
    readNonEmptyString(record, "lastFmApiKey") ?? envDefaults.lastFmApiKey,
  fanartApiKey:
    readNonEmptyString(record, "fanartApiKey") ?? envDefaults.fanartApiKey,
  language: readLanguage(record) ?? envDefaults.language,
  configuredAt: readOptionalString(record, "configuredAt"),
});

/**
 * Returns true if the config has the minimum required fields set.
 * lmsHost, lmsPort > 0, and playerId must all be non-empty.
 */
export const isConfigured = (config: AppConfig): boolean =>
  config.lmsHost.trim().length > 0 &&
  config.lmsPort > 0 &&
  config.playerId.trim().length > 0;

/**
 * Loads config from disk, falling back to environment variables for any missing fields.
 */
export const loadConfig = (
  configPath = DEFAULT_CONFIG_PATH,
): Result<AppConfig, ConfigError> => {
  if (!fs.existsSync(configPath)) {
    return ok({ ...getEnvDefaults() });
  }

  const rawResult = fromThrowable(
    () => fs.readFileSync(configPath, "utf-8"),
    (error): ConfigError => ({
      type: "READ_ERROR",
      message: error instanceof Error ? error.message : String(error),
    }),
  );

  if (!rawResult.ok) {
    return rawResult;
  }

  const parsedResult = parseJsonRecord(rawResult.value);
  if (!parsedResult.ok) {
    return parsedResult;
  }

  return ok(toConfig(parsedResult.value, getEnvDefaults()));
};

/**
 * Saves config to disk atomically (write to tmp file, then rename).
 * Concurrent calls are safe because rename() is atomic on POSIX systems.
 */
export const saveConfig = (
  config: AppConfig,
  configPath = DEFAULT_CONFIG_PATH,
): Result<void, ConfigError> => {
  if (config.lmsPort < 1 || config.lmsPort > 65535) {
    return err({
      type: "VALIDATION_ERROR",
      message: `lmsPort must be between 1 and 65535, got ${config.lmsPort}`,
    });
  }

  const configWithTimestamp: AppConfig = {
    ...config,
    configuredAt: new Date().toISOString(),
  };
  const json = JSON.stringify(configWithTimestamp, null, 2);
  const dir = path.dirname(configPath);
  const tmpPath = path.join(
    dir,
    `.signalform-config-${Date.now()}-${process.pid}.json`,
  );

  const writeResult = fromThrowable(
    () => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(tmpPath, json, "utf-8");
      fs.renameSync(tmpPath, configPath);
    },
    (error): ConfigError => ({
      type: "WRITE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    }),
  );

  if (!writeResult.ok) {
    if (fs.existsSync(tmpPath)) {
      void fromThrowable(
        () => fs.unlinkSync(tmpPath),
        () => undefined,
      );
    }

    return writeResult;
  }

  return ok(undefined);
};
