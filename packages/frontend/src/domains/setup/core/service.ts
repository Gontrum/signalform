const DEFAULT_LMS_PORT = 9000

export const setupSteps = ['server', 'player', 'keys', 'done'] as const

export type SetupStep = (typeof setupSteps)[number]

type ResolvedSetupServer = {
  readonly host: string
  readonly port: number
}

type SetupConfigUpdate = {
  readonly lmsHost: string
  readonly lmsPort: number
  readonly playerId: string
  readonly lastFmApiKey?: string
  readonly fanartApiKey?: string
}

const parsePort = (value: string): number => {
  const parsedPort = Number.parseInt(value, 10)

  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_LMS_PORT
}

export const resolveSetupServer = (input: {
  readonly selectedHost: string
  readonly selectedPort: number
  readonly manualHost: string
  readonly manualPort: string
}): ResolvedSetupServer | null => {
  const host = input.selectedHost || input.manualHost.trim()

  if (!host) {
    return null
  }

  return {
    host,
    port: input.selectedPort || parsePort(input.manualPort),
  }
}

export const createSetupConfigUpdate = (input: {
  readonly host: string
  readonly port: number
  readonly playerId: string
  readonly lastFmApiKey: string
  readonly fanartApiKey: string
}): SetupConfigUpdate => {
  return {
    lmsHost: input.host,
    lmsPort: input.port,
    playerId: input.playerId,
    ...(input.lastFmApiKey ? { lastFmApiKey: input.lastFmApiKey } : {}),
    ...(input.fanartApiKey ? { fanartApiKey: input.fanartApiKey } : {}),
  }
}
