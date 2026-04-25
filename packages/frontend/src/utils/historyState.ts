const isHistoryStateRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object'
}

export const getHistoryStateValue = (key: string): unknown => {
  const state: unknown = window.history.state
  if (!isHistoryStateRecord(state)) {
    return undefined
  }
  return state[key]
}
