import { isConfigured } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";

type ConfigUpdate = {
  readonly lmsHost?: string;
  readonly lmsPort?: number;
  /** `null` clears the stored MAC address; absent leaves it unchanged. */
  readonly lmsMacAddress?: string | null;
  readonly playerId?: string;
  readonly lastFmApiKey?: string;
  readonly fanartApiKey?: string;
  readonly language?: AppConfig["language"];
  readonly lastFmSharedSecret?: string;
  readonly personalRadioEnabled?: boolean;
  readonly scrobblingEnabled?: boolean;
  readonly personalRadioDiscovery?: number;
};

type PublicConfig = {
  readonly lmsHost: string;
  readonly lmsPort: number;
  readonly lmsMacAddress?: string;
  readonly playerId: string;
  readonly hasLastFmKey: boolean;
  readonly hasFanartKey: boolean;
  readonly hasLastFmSharedSecret: boolean;
  readonly isConfigured: boolean;
  readonly configuredAt: AppConfig["configuredAt"];
  readonly language: AppConfig["language"];
  readonly personalRadioEnabled: boolean;
  readonly scrobblingEnabled: boolean;
  readonly personalRadioDiscovery: number;
};

/** Returns config safe to expose in API responses — API keys masked. */
export const maskConfig = (config: AppConfig): PublicConfig => ({
  lmsHost: config.lmsHost,
  lmsPort: config.lmsPort,
  ...(config.lmsMacAddress !== undefined
    ? { lmsMacAddress: config.lmsMacAddress }
    : {}),
  playerId: config.playerId,
  hasLastFmKey: config.lastFmApiKey.trim().length > 0,
  hasFanartKey: config.fanartApiKey.trim().length > 0,
  hasLastFmSharedSecret:
    config.lastFmSharedSecret !== undefined &&
    config.lastFmSharedSecret.trim().length > 0,
  isConfigured: isConfigured(config),
  configuredAt: config.configuredAt,
  language: config.language,
  personalRadioEnabled: config.personalRadioEnabled,
  scrobblingEnabled: config.scrobblingEnabled,
  personalRadioDiscovery: config.personalRadioDiscovery,
});

/** Treats an empty (or whitespace-only) MAC like `null` — a clear request. */
export const normalizeLmsMacAddress = (
  value: string | null | undefined,
): string | null | undefined =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** `null` clears the value, `undefined` keeps the existing one. */
const resolveNullable = (
  update: string | null | undefined,
  existing: string | undefined,
): string | undefined => (update === null ? undefined : (update ?? existing));

export const mergeConfigUpdate = (
  existingConfig: AppConfig,
  updates: ConfigUpdate,
): AppConfig => ({
  lmsHost: updates.lmsHost ?? existingConfig.lmsHost,
  lmsPort: updates.lmsPort ?? existingConfig.lmsPort,
  lmsMacAddress: resolveNullable(
    updates.lmsMacAddress,
    existingConfig.lmsMacAddress,
  ),
  playerId: updates.playerId ?? existingConfig.playerId,
  lastFmApiKey:
    updates.lastFmApiKey !== undefined
      ? updates.lastFmApiKey
      : existingConfig.lastFmApiKey,
  fanartApiKey:
    updates.fanartApiKey !== undefined
      ? updates.fanartApiKey
      : existingConfig.fanartApiKey,
  language: updates.language ?? existingConfig.language,
  lastFmSharedSecret:
    updates.lastFmSharedSecret !== undefined
      ? updates.lastFmSharedSecret
      : existingConfig.lastFmSharedSecret,
  users: existingConfig.users,
  personalRadioEnabled:
    updates.personalRadioEnabled ?? existingConfig.personalRadioEnabled,
  scrobblingEnabled:
    updates.scrobblingEnabled ?? existingConfig.scrobblingEnabled,
  personalRadioDiscovery:
    updates.personalRadioDiscovery ?? existingConfig.personalRadioDiscovery,
});
