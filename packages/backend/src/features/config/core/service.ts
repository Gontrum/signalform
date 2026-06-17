import { isConfigured } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";

type ConfigUpdate = {
  readonly lmsHost?: string;
  readonly lmsPort?: number;
  readonly playerId?: string;
  readonly lastFmApiKey?: string;
  readonly fanartApiKey?: string;
  readonly language?: AppConfig["language"];
  readonly lastFmUsername?: string;
  readonly lastFmSharedSecret?: string;
  readonly lastFmSessionKey?: string | null;
  readonly personalRadioEnabled?: boolean;
  readonly scrobblingEnabled?: boolean;
  readonly personalRadioDiscovery?: number;
};

type PublicConfig = {
  readonly lmsHost: string;
  readonly lmsPort: number;
  readonly playerId: string;
  readonly hasLastFmKey: boolean;
  readonly hasFanartKey: boolean;
  readonly isConfigured: boolean;
  readonly configuredAt: AppConfig["configuredAt"];
  readonly language: AppConfig["language"];
  readonly lastFmUsername: AppConfig["lastFmUsername"];
  readonly hasLastFmSession: boolean;
  readonly personalRadioEnabled: boolean;
  readonly scrobblingEnabled: boolean;
  readonly personalRadioDiscovery: number;
};

/** Returns config safe to expose in API responses — API keys masked. */
export const maskConfig = (config: AppConfig): PublicConfig => ({
  lmsHost: config.lmsHost,
  lmsPort: config.lmsPort,
  playerId: config.playerId,
  hasLastFmKey: config.lastFmApiKey.trim().length > 0,
  hasFanartKey: config.fanartApiKey.trim().length > 0,
  isConfigured: isConfigured(config),
  configuredAt: config.configuredAt,
  language: config.language,
  lastFmUsername: config.lastFmUsername,
  hasLastFmSession:
    config.lastFmSessionKey !== undefined &&
    config.lastFmSessionKey.trim().length > 0,
  personalRadioEnabled: config.personalRadioEnabled,
  scrobblingEnabled: config.scrobblingEnabled,
  personalRadioDiscovery: config.personalRadioDiscovery,
});

const resolveSessionKey = (
  update: ConfigUpdate,
  existing: AppConfig,
): string | undefined => {
  if (!("lastFmSessionKey" in update)) {
    return existing.lastFmSessionKey;
  }
  if (update.lastFmSessionKey === null) {
    return undefined;
  }
  return update.lastFmSessionKey;
};

export const mergeConfigUpdate = (
  existingConfig: AppConfig,
  updates: ConfigUpdate,
): AppConfig => ({
  lmsHost: updates.lmsHost ?? existingConfig.lmsHost,
  lmsPort: updates.lmsPort ?? existingConfig.lmsPort,
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
  lastFmUsername:
    updates.lastFmUsername !== undefined
      ? updates.lastFmUsername
      : existingConfig.lastFmUsername,
  lastFmSharedSecret:
    updates.lastFmSharedSecret !== undefined
      ? updates.lastFmSharedSecret
      : existingConfig.lastFmSharedSecret,
  lastFmSessionKey: resolveSessionKey(updates, existingConfig),
  personalRadioEnabled:
    updates.personalRadioEnabled ?? existingConfig.personalRadioEnabled,
  scrobblingEnabled:
    updates.scrobblingEnabled ?? existingConfig.scrobblingEnabled,
  personalRadioDiscovery:
    updates.personalRadioDiscovery ?? existingConfig.personalRadioDiscovery,
});
