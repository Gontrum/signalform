import { isConfigured } from "../../../infrastructure/config/index.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";

type ConfigUpdate = {
  readonly lmsHost?: string;
  readonly lmsPort?: number;
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
  readonly playerId: string;
  readonly hasLastFmKey: boolean;
  readonly hasFanartKey: boolean;
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
  playerId: config.playerId,
  hasLastFmKey: config.lastFmApiKey.trim().length > 0,
  hasFanartKey: config.fanartApiKey.trim().length > 0,
  isConfigured: isConfigured(config),
  configuredAt: config.configuredAt,
  language: config.language,
  personalRadioEnabled: config.personalRadioEnabled,
  scrobblingEnabled: config.scrobblingEnabled,
  personalRadioDiscovery: config.personalRadioDiscovery,
});

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
