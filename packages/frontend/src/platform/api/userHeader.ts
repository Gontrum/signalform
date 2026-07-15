export const SELECTED_USER_KEY = 'selected-user-id'

export const USER_HEADER_NAME = 'x-signalform-user'

export const getSelectedUserId = (): string | undefined => {
  try {
    return localStorage.getItem(SELECTED_USER_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const setSelectedUserId = (id: string): void => {
  try {
    localStorage.setItem(SELECTED_USER_KEY, id)
  } catch {
    // Storage may be unavailable (private mode, quota); selection is best-effort.
  }
}

export const removeSelectedUserId = (): void => {
  try {
    localStorage.removeItem(SELECTED_USER_KEY)
  } catch {
    // Storage may be unavailable (private mode, quota); selection is best-effort.
  }
}

export const withUserHeader = (init?: RequestInit): RequestInit => {
  const userId = getSelectedUserId()
  if (userId === undefined) {
    return init ?? {}
  }

  const headers = new Headers(init?.headers)
  headers.set(USER_HEADER_NAME, userId)

  return { ...init, headers }
}
