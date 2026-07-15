import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import UserSelectDialog from '@/domains/user/ui/UserSelectDialog.vue'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import { SELECTED_USER_KEY } from '@/platform/api/userHeader'
import { setupTestEnv } from '@/test-utils'
import type { ApiUser } from '@/platform/api/usersApi'

vi.mock('@/platform/api/usersApi', () => ({
  getUsers: vi.fn(),
}))

const users: readonly ApiUser[] = [
  { id: 'u1', name: 'Ada', hasLastFmSession: true, lastFmUsername: 'ada_fm' },
  { id: 'u2', name: 'Ben', hasLastFmSession: false },
]

describe('UserSelectDialog', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
  })

  const mountDialog = async (): Promise<VueWrapper> => {
    const userStore = useUserStore()
    userStore.$patch({ users: [...users] })
    const wrapper = mount(UserSelectDialog)
    await nextTick()
    return wrapper
  }

  it('renders a full-screen overlay with the title', async () => {
    const wrapper = await mountDialog()

    const overlay = wrapper.find('[data-testid="user-select-dialog"]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.classes()).toContain('fixed')
    expect(overlay.classes()).toContain('inset-0')
    expect(wrapper.text()).toContain('Who are you?')
  })

  it('renders one button per user', async () => {
    const wrapper = await mountDialog()

    const options = wrapper.findAll('[data-testid="user-select-option"]')
    expect(options).toHaveLength(2)
    expect(options[0]!.text()).toBe('Ada')
    expect(options[1]!.text()).toBe('Ben')
  })

  it('selects and persists the clicked user', async () => {
    const wrapper = await mountDialog()
    const userStore = useUserStore()

    await wrapper.findAll('[data-testid="user-select-option"]')[1]!.trigger('click')

    expect(userStore.selectedUserId).toBe('u2')
    expect(userStore.needsSelection).toBe(false)
    expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('u2')
  })
})
