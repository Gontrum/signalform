import type { MessageKey } from '@/i18n'

export type SourceTranslator = (key: MessageKey) => string

const SOURCE_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  local: 'source.local',
  qobuz: 'source.qobuz',
  tidal: 'source.tidal',
  unknown: 'source.unknown',
}

const SOURCE_TOOLTIP_KEYS: Readonly<Record<string, MessageKey>> = {
  local: 'source.tooltip.local',
  qobuz: 'source.tooltip.qobuz',
  tidal: 'source.tooltip.tidal',
  unknown: 'source.tooltip.unknown',
}

export const getSourceLabel = (
  t: SourceTranslator,
  source: string | undefined,
  fallback: MessageKey = 'source.unknown',
): string => t(SOURCE_LABEL_KEYS[source ?? ''] ?? fallback)

export const getSourceTooltip = (t: SourceTranslator, source: string | undefined): string =>
  t(SOURCE_TOOLTIP_KEYS[source ?? ''] ?? 'source.tooltip.unknown')
