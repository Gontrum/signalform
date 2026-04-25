import type { ConfigUpdate } from './types.js'
import type { Language } from '@/types/i18n'

const DEFAULT_LMS_PORT = 9000

export const parseSettingsPort = (value: string): number => {
  const parsedPort = Number.parseInt(value, 10)

  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_LMS_PORT
}

export const resolveSettingsLanguage = (
  configuredLanguage: Language | undefined,
  fallbackLanguage: Language,
): Language => {
  return configuredLanguage === 'de' || configuredLanguage === 'en'
    ? configuredLanguage
    : fallbackLanguage
}

export const createSettingsConfigUpdate = (input: {
  readonly lmsHost: string
  readonly lmsPort: string
  readonly playerId: string
  readonly language: Language
  readonly lastFmApiKey: string
  readonly fanartApiKey: string
}): ConfigUpdate => {
  return {
    lmsHost: input.lmsHost.trim(),
    lmsPort: parseSettingsPort(input.lmsPort),
    playerId: input.playerId.trim(),
    language: input.language,
    ...(input.lastFmApiKey ? { lastFmApiKey: input.lastFmApiKey } : {}),
    ...(input.fanartApiKey ? { fanartApiKey: input.fanartApiKey } : {}),
  }
}
