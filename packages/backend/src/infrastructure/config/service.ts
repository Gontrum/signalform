/**
 * Application Configuration Service
 *
 * Reads and writes config.json atomically.
 * Falls back to environment variables when config.json is missing or incomplete.
 */

import fs from "node:fs";
import path from "node:path";
import { err, fromThrowable, ok, type Result } from "@signalform/shared";
import {
  isJsonRecord,
  parseJsonObject,
  readNonEmptyString,
  readPositiveNumber,
  writeFileAtomic,
  type JsonRecord,
} from "../jsonFileStore.js";

export type Language = "en" | "de";

export type UserProfile = {
  readonly id: string;
  readonly name: string;
  readonly lastFmUsername?: string;
  readonly lastFmSessionKey?: string;
};

export type AppConfig = {
  readonly lmsHost: string;
  readonly lmsPort: number;
  readonly lmsMacAddress?: string;
  readonly playerId: string;
  readonly lastFmApiKey: string;
  readonly fanartApiKey: string;
  readonly language: Language;
  readonly configuredAt?: string;
  readonly lastFmSharedSecret?: string;
  readonly discogsToken?: string;
  readonly users: readonly UserProfile[];
  readonly personalRadioEnabled: boolean;
  readonly scrobblingEnabled: boolean;
  readonly personalRadioDiscovery: number;
};

export type ConfigError =
  | { readonly type: "READ_ERROR"; readonly message: string }
  | { readonly type: "WRITE_ERROR"; readonly message: string }
  | { readonly type: "PARSE_ERROR"; readonly message: string }
  | { readonly type: "VALIDATION_ERROR"; readonly message: string };

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "config.json");

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
  users: [],
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
});

const parseJsonRecord = (raw: string): Result<JsonRecord, ConfigError> => {
  const parsedResult = parseJsonObject(raw, "config.json");
  if (!parsedResult.ok) {
    return err({ type: "PARSE_ERROR", message: parsedResult.error });
  }

  return ok(parsedResult.value);
};

const readOptionalString = (
  record: JsonRecord,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const readBoolean = (
  record: JsonRecord,
  key: string,
  fallback: boolean,
): boolean => {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
};

const readNumberInRange = (
  record: JsonRecord,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number => {
  const value = record[key];
  return typeof value === "number" && value >= min && value <= max
    ? value
    : fallback;
};

const readLanguage = (record: JsonRecord): Language | undefined => {
  const value = record["language"];
  if (value === "en" || value === "de") {
    return value;
  }
  return undefined;
};

const toUserProfile = (value: unknown): UserProfile | undefined => {
  if (!isJsonRecord(value)) {
    return undefined;
  }

  const id = readNonEmptyString(value, "id");
  const name = readNonEmptyString(value, "name");
  if (id === undefined || name === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    lastFmUsername: readNonEmptyString(value, "lastFmUsername"),
    lastFmSessionKey: readNonEmptyString(value, "lastFmSessionKey"),
  };
};

const migrateLegacyUser = (record: JsonRecord): readonly UserProfile[] => {
  const lastFmUsername = readNonEmptyString(record, "lastFmUsername");
  const lastFmSessionKey = readNonEmptyString(record, "lastFmSessionKey");
  if (lastFmUsername === undefined && lastFmSessionKey === undefined) {
    return [];
  }

  return [
    {
      id: "u1",
      name: lastFmUsername ?? "User 1",
      lastFmUsername,
      lastFmSessionKey,
    },
  ];
};

const readUsers = (record: JsonRecord): readonly UserProfile[] => {
  const value = record["users"];
  if (Array.isArray(value)) {
    return value
      .map(toUserProfile)
      .filter((user): user is UserProfile => user !== undefined);
  }

  return migrateLegacyUser(record);
};

const toConfig = (record: JsonRecord, envDefaults: AppConfig): AppConfig => ({
  lmsHost: readNonEmptyString(record, "lmsHost") ?? envDefaults.lmsHost,
  lmsPort: readPositiveNumber(record, "lmsPort") ?? envDefaults.lmsPort,
  lmsMacAddress: readNonEmptyString(record, "lmsMacAddress"),
  playerId: readNonEmptyString(record, "playerId") ?? envDefaults.playerId,
  lastFmApiKey:
    readNonEmptyString(record, "lastFmApiKey") ?? envDefaults.lastFmApiKey,
  fanartApiKey:
    readNonEmptyString(record, "fanartApiKey") ?? envDefaults.fanartApiKey,
  language: readLanguage(record) ?? envDefaults.language,
  configuredAt: readOptionalString(record, "configuredAt"),
  lastFmSharedSecret: readNonEmptyString(record, "lastFmSharedSecret"),
  discogsToken: readNonEmptyString(record, "discogsToken"),
  users: readUsers(record),
  personalRadioEnabled: readBoolean(record, "personalRadioEnabled", false),
  scrobblingEnabled: readBoolean(record, "scrobblingEnabled", false),
  personalRadioDiscovery: readNumberInRange(
    record,
    "personalRadioDiscovery",
    0,
    100,
    50,
  ),
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

  if (
    config.personalRadioDiscovery < 0 ||
    config.personalRadioDiscovery > 100 ||
    !Number.isInteger(config.personalRadioDiscovery)
  ) {
    return err({
      type: "VALIDATION_ERROR",
      message: `personalRadioDiscovery must be an integer between 0 and 100, got ${config.personalRadioDiscovery}`,
    });
  }

  const configWithTimestamp: AppConfig = {
    ...config,
    configuredAt: new Date().toISOString(),
  };
  const json = JSON.stringify(configWithTimestamp, null, 2);
  const writeResult = writeFileAtomic(configPath, json, ".signalform-config");
  if (!writeResult.ok) {
    return err({ type: "WRITE_ERROR", message: writeResult.error });
  }

  return ok(undefined);
};
