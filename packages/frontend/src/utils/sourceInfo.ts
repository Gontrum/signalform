/**
 * Source information constants for display labels and tooltip text.
 * Shared between SearchResultsList.vue and NowPlayingPanel.vue.
 */
export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  local: 'Local',
  qobuz: 'Qobuz',
  tidal: 'Tidal',
  unknown: 'Unknown',
}

export const SOURCE_TOOLTIP_TEXT: Readonly<Record<string, string>> = {
  local: 'Playing from Local library',
  qobuz: 'Streaming from Qobuz',
  tidal: 'Streaming from Tidal',
  unknown: 'Source unknown',
}
