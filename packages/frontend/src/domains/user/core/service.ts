export type UserSummary = {
  readonly id: string
  readonly name: string
  readonly lastFmUsername?: string
  readonly hasLastFmSession: boolean
}

export const resolveSelectedUser = (
  users: readonly UserSummary[],
  storedId: string | undefined,
): string | undefined => {
  if (storedId !== undefined && users.some((user) => user.id === storedId)) {
    return storedId
  }

  return users.length === 1 ? users[0]?.id : undefined
}

export const needsSelection = (
  users: readonly UserSummary[],
  selectedId: string | undefined,
): boolean => {
  return users.length > 1 && selectedId === undefined
}
