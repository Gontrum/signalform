/**
 * LMS Client Registry — module-level singleton for hot-reloadable LMS client.
 *
 * Routes call registry.getLmsClient() / registry.getLmsConfig() on each request.
 * When settings change, reload() replaces the client and restarts the status poller
 * without requiring a server restart.
 */

import type { FastifyInstance } from "fastify";
import {
  createLmsClient,
  type LmsConfig,
} from "../adapters/lms-client/index.js";
import type { AppConfig } from "./config/index.js";

type LmsClientType = ReturnType<typeof createLmsClient>;
type StopPollingFn = () => void;

type RegistryState = {
  readonly lmsClient: LmsClientType;
  readonly lmsConfig: LmsConfig;
  readonly stopPolling: StopPollingFn;
};

type PollingFactory = (
  client: LmsClientType,
  config: LmsConfig,
) => StopPollingFn;

type InitializedRegistryState = {
  readonly state: RegistryState;
  readonly pollingFactory: PollingFactory;
  readonly app: FastifyInstance;
};

type LmsRegistry = {
  readonly init: (
    appConfig: AppConfig,
    pollingFactory: PollingFactory,
    app: FastifyInstance,
  ) => void;
  readonly getLmsClient: () => LmsClientType;
  readonly getLmsConfig: () => LmsConfig;
  readonly getPlayerId: () => string;
  readonly reload: (newAppConfig: AppConfig) => void;
  readonly stopAll: () => void;
};

const lmsConfigFromAppConfig = (config: AppConfig): LmsConfig => ({
  host: config.lmsHost || "localhost",
  port: config.lmsPort || 9000,
  playerId: config.playerId || "00:00:00:00:00:00",
  timeout: 5000,
});

const createUninitializedRegistryError = (): Error => {
  return new Error("LmsClientRegistry not initialized — call init() first");
};

const createRegistryState = (
  appConfig: AppConfig,
  pollingFactory: PollingFactory,
): RegistryState => {
  const lmsConfig = lmsConfigFromAppConfig(appConfig);
  const lmsClient = createLmsClient(lmsConfig);
  const stopPolling = pollingFactory(lmsClient, lmsConfig);

  return { lmsClient, lmsConfig, stopPolling };
};

const createLmsRegistry = (): LmsRegistry => {
  const ref = { current: undefined as InitializedRegistryState | undefined };

  const requireInitialized = (): InitializedRegistryState => {
    const initialized = ref.current;
    if (!initialized) {
      throw createUninitializedRegistryError();
    }
    return initialized;
  };

  const init: LmsRegistry["init"] = (appConfig, pollingFactory, app): void => {
    const state = createRegistryState(appConfig, pollingFactory);
    ref.current = { state, pollingFactory, app };
  };

  const getLmsClient: LmsRegistry["getLmsClient"] = (): LmsClientType =>
    requireInitialized().state.lmsClient;

  const getLmsConfig: LmsRegistry["getLmsConfig"] = (): LmsConfig =>
    requireInitialized().state.lmsConfig;

  const getPlayerId: LmsRegistry["getPlayerId"] = (): string =>
    getLmsConfig().playerId;

  const reload: LmsRegistry["reload"] = (newAppConfig): void => {
    const initialized = ref.current;
    if (!initialized) {
      return;
    }

    initialized.state.stopPolling();

    const nextState = createRegistryState(
      newAppConfig,
      initialized.pollingFactory,
    );
    ref.current = { ...initialized, state: nextState };

    initialized.app.log.info(
      {
        event: "lms_client_reloaded",
        lmsHost: nextState.lmsConfig.host,
        lmsPort: nextState.lmsConfig.port,
        playerId: nextState.lmsConfig.playerId,
      },
      "LMS client reloaded with new config",
    );
  };

  const stopAll: LmsRegistry["stopAll"] = (): void => {
    ref.current?.state.stopPolling();
  };

  return {
    init,
    getLmsClient,
    getLmsConfig,
    getPlayerId,
    reload,
    stopAll,
  };
};

const registry = createLmsRegistry();

export const getLmsRegistry = (): LmsRegistry => registry;
