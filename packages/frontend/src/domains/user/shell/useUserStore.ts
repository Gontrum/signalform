import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getUsers, type ApiUser } from '@/platform/api/usersApi'
import {
  getSelectedUserId,
  removeSelectedUserId,
  setSelectedUserId,
} from '@/platform/api/userHeader'
import {
  needsSelection as resolveNeedsSelection,
  resolveSelectedUser,
} from '@/domains/user/core/service'

/**
 * User Store
 *
 * Holds the household user list, the device-level selected user, and the
 * active listener. The device selection is persisted to localStorage via
 * the userHeader helpers so the `x-signalform-user` header is injected
 * on every API request.
 */
export const useUserStore = defineStore('user', () => {
  // ── State ──────────────────────────────────────────────────
  const users = ref<readonly ApiUser[]>([])
  const activeListenerId = ref<string | undefined>(undefined)
  const selectedUserId = ref<string | undefined>(undefined)

  // ── Getters (Functional Core) ─────────────────────────────
  const selectedUser = computed<ApiUser | undefined>(() =>
    users.value.find((user) => user.id === selectedUserId.value),
  )
  const hasLastFmSession = computed(() => selectedUser.value?.hasLastFmSession ?? false)
  const needsSelection = computed(() => resolveNeedsSelection(users.value, selectedUserId.value))

  // ── Actions (Imperative Shell) ────────────────────────────

  /**
   * Load users and resolve the device selection.
   * Auto-selection (stored match or single user) is persisted.
   */
  const load = async (): Promise<void> => {
    const result = await getUsers()
    if (!result.ok) {
      return
    }

    users.value = result.value.users
    activeListenerId.value = result.value.activeListenerId

    const storedId = getSelectedUserId()
    const resolvedId = resolveSelectedUser(result.value.users, storedId)
    if (resolvedId !== undefined) {
      setSelectedUserId(resolvedId)
    } else if (storedId !== undefined) {
      // The stored user no longer exists; stop sending its id as header.
      removeSelectedUserId()
    }
    selectedUserId.value = resolvedId
  }

  /**
   * Select the user this device belongs to and persist the choice.
   */
  const selectUser = (id: string): void => {
    setSelectedUserId(id)
    selectedUserId.value = id
  }

  return {
    // State
    users,
    activeListenerId,
    selectedUserId,
    // Getters
    selectedUser,
    hasLastFmSession,
    needsSelection,
    // Actions
    load,
    selectUser,
  }
})
