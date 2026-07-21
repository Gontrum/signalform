import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import SettingsView from '@/domains/settings/ui/SettingsView.vue'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Module-level ref so individual tests can flip isPhone before mounting; reset
// to false in beforeEach so phone-mode leaks never bleed into other tests.
const isPhone = ref(false)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(true),
  }),
}))

vi.mock('@/platform/api/configApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    getConfig: vi.fn().mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    ),
    updateConfig: vi.fn().mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    ),
  }
})

vi.mock('@/platform/api/setupApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    discoverServers: vi.fn().mockResolvedValue(ok([])),
    getPlayers: vi.fn().mockResolvedValue(ok([])),
  }
})

vi.mock('@/platform/api/lastFmAuthApi', () => ({
  requestLastFmAuth: vi.fn().mockResolvedValue(null),
  completeLastFmAuth: vi.fn().mockResolvedValue(null),
  disconnectLastFm: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/platform/api/usersApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    getUsers: vi.fn().mockResolvedValue(
      ok({
        users: [
          { id: 'u1', name: 'Ada', lastFmUsername: 'ada_fm', hasLastFmSession: true },
          { id: 'u2', name: 'Ben', hasLastFmSession: false },
        ],
        activeListenerId: 'u1',
      }),
    ),
    createUser: vi.fn().mockResolvedValue(ok({ id: 'u3', name: 'Cleo' })),
    renameUser: vi.fn().mockResolvedValue(ok(undefined)),
    deleteUser: vi.fn().mockResolvedValue(ok(undefined)),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const settingsRoutes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
  { path: '/settings', name: 'settings', component: { template: '<div />' } },
  { path: '/setup', name: 'setup', component: { template: '<div />' } },
] as const

const expectInputValue = (wrapper: VueWrapper, selector: string, expected: string): void => {
  const element = wrapper.find(selector).element
  expect(element).toBeInstanceOf(HTMLInputElement)
  if (!(element instanceof HTMLInputElement)) {
    return
  }
  expect(element.value).toBe(expected)
}

const expectSelectValue = (wrapper: VueWrapper, selector: string, expected: string): void => {
  const element = wrapper.find(selector).element
  expect(element).toBeInstanceOf(HTMLSelectElement)
  if (!(element instanceof HTMLSelectElement)) {
    return
  }
  expect(element.value).toBe(expected)
}

describe('SettingsView', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
    isPhone.value = false
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([...settingsRoutes], '/settings')
  }

  const mountView = async (router: Router): Promise<VueWrapper> => {
    const wrapper = mount(SettingsView, {
      global: { plugins: [router] },
    })
    // drain onMounted async
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
  }

  // ---------------------------------------------------------------------------
  // Loading config on mount
  // ---------------------------------------------------------------------------

  it('loads config on mount and populates fields', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)
    expect(getConfig).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="main-nav"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-settings"]').attributes('aria-current')).toBe('page')
    expectInputValue(wrapper, '[data-testid="lms-host-input"]', '192.168.1.100')
    expectInputValue(wrapper, '[data-testid="lms-port-input"]', '9000')
    expectInputValue(wrapper, '[data-testid="player-id-input"]', 'aa:bb:cc:dd:ee:ff')
  })

  it('renders a PageHeader with the settings title and no back button', async () => {
    isPhone.value = true
    const router = await createRouter()
    const wrapper = await mountView(router)

    const header = wrapper.find('[data-testid="page-header"]')
    expect(header.exists()).toBe(true)
    expect(header.text()).toContain('Settings')
    expect(wrapper.find('[data-testid="page-header-back"]').exists()).toBe(false)
  })

  it('hides MainNavBar on phone and shows the PageHeader regardless of breakpoint', async () => {
    isPhone.value = true
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="main-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(true)
  })

  it('populates the MAC address field from the loaded config', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        lmsMacAddress: '00:11:22:33:44:55',
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        language: 'en',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )

    const router = await createRouter()
    const wrapper = await mountView(router)
    expectInputValue(wrapper, '[data-testid="lms-mac-input"]', '00:11:22:33:44:55')
  })

  it('shows load error when getConfig fails', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { err } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(err({ type: 'NETWORK_ERROR', message: 'timeout' }))
    const router = await createRouter()
    const wrapper = await mountView(router)
    expect(wrapper.find('[data-testid="settings-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-form"]').exists()).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  it('calls updateConfig with form values on save', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lms-host-input"]').setValue('10.0.0.1')
    await wrapper.find('[data-testid="lms-port-input"]').setValue('9001')
    await wrapper.find('[data-testid="player-id-input"]').setValue('11:22:33:44:55:66')

    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        lmsHost: '10.0.0.1',
        lmsPort: 9001,
        playerId: '11:22:33:44:55:66',
      }),
    )
  })

  it('sends the entered MAC address on save', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lms-mac-input"]').setValue('00:11:22:33:44:55')
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lmsMacAddress: '00:11:22:33:44:55' }),
    )
  })

  it('clears the MAC address with null when the field is empty on save', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lms-mac-input"]').setValue('')
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(expect.objectContaining({ lmsMacAddress: null }))
  })

  it('shows success message after successful save', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="save-success"]').text()).toBe('Settings saved')
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(false)
  })

  it('updates language field from config on load', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        language: 'de',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )

    const router = await createRouter()
    const wrapper = await mountView(router)
    expectSelectValue(wrapper, '[data-testid="language-select"]', 'de')
  })

  it('includes language in updateConfig payload and updates i18n store', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const i18nStore = useI18nStore()

    const router = await createRouter()
    const wrapper = await mountView(router)
    const select = wrapper.find('[data-testid="language-select"]')
    await select.setValue('de')

    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'de',
      }),
    )

    expect(i18nStore.currentLanguage).toBe('de')
  })

  it('shows error message after failed save', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const { err } = await import('@signalform/shared')
    vi.mocked(updateConfig).mockResolvedValueOnce(
      err({ type: 'SERVER_ERROR', status: 500, message: 'Internal error' }),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-success"]').exists()).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Discover servers
  // ---------------------------------------------------------------------------

  it('shows discovered servers in dropdown after discover', async () => {
    const { discoverServers } = await import('@/platform/api/setupApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(discoverServers).mockResolvedValueOnce(
      ok([{ host: '192.168.1.50', port: 9000, name: 'My LMS', version: '8.5.0' }]),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="discover-button"]').trigger('click')
    await vi.dynamicImportSettled()
    expect(wrapper.find('[data-testid="server-dropdown"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="server-option"]').text()).toContain('My LMS')
  })

  it('shows discover error when no servers found', async () => {
    const { discoverServers } = await import('@/platform/api/setupApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(discoverServers).mockResolvedValueOnce(ok([]))
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="discover-button"]').trigger('click')
    await vi.dynamicImportSettled()
    expect(wrapper.find('[data-testid="discover-error"]').exists()).toBe(true)
  })

  it('populates host/port fields when server is selected from dropdown', async () => {
    const { discoverServers } = await import('@/platform/api/setupApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(discoverServers).mockResolvedValueOnce(
      ok([{ host: '192.168.1.50', port: 9000, name: 'My LMS', version: '8.5.0' }]),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="discover-button"]').trigger('click')
    await vi.dynamicImportSettled()
    await wrapper.find('[data-testid="server-option"]').trigger('click')
    expectInputValue(wrapper, '[data-testid="lms-host-input"]', '192.168.1.50')
  })

  // ---------------------------------------------------------------------------
  // List players
  // ---------------------------------------------------------------------------

  it('shows player dropdown after list-players', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getPlayers).mockResolvedValueOnce(
      ok([{ id: 'bb:bb:c4:1e:ea:48', name: 'Living Room', model: 'squeezelite', connected: true }]),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="list-players-button"]').trigger('click')
    await vi.dynamicImportSettled()
    expect(wrapper.find('[data-testid="player-dropdown"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="player-option"]').text()).toContain('Living Room')
  })

  it('populates player ID when player is selected from dropdown', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getPlayers).mockResolvedValueOnce(
      ok([{ id: 'bb:bb:c4:1e:ea:48', name: 'Living Room', model: 'squeezelite', connected: true }]),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="list-players-button"]').trigger('click')
    await vi.dynamicImportSettled()
    await wrapper.find('[data-testid="player-option"]').trigger('click')
    expectInputValue(wrapper, '[data-testid="player-id-input"]', 'bb:bb:c4:1e:ea:48')
  })

  // ---------------------------------------------------------------------------
  // Run setup wizard link
  // ---------------------------------------------------------------------------

  it('navigates to /setup when run-setup-button is clicked', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="run-setup-button"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('setup')
  })

  // ---------------------------------------------------------------------------
  // Top-level navigation
  // ---------------------------------------------------------------------------

  it('navigates to home when the Search nav item is clicked', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)
    await wrapper.find('[data-testid="nav-search"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })

  // ---------------------------------------------------------------------------
  // App version footer
  // ---------------------------------------------------------------------------

  it('renders the app version footer', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const footer = wrapper.find('[data-testid="app-version"]')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('Signalform v')
  })

  // ---------------------------------------------------------------------------
  // API key configured indicators
  // ---------------------------------------------------------------------------

  it('shows the shared-secret configured badge and placeholder when a secret is stored', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: true,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        language: 'en',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )

    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('label[for="lastfm-secret"]').text()).toContain('✓ configured')
    expect(wrapper.find('[data-testid="lastfm-secret-input"]').attributes('placeholder')).toBe(
      'Enter new key to replace',
    )
    // hasLastFmKey stays false — the secret badge must not leak onto the key field
    expect(wrapper.find('label[for="lastfm-key"]').text()).not.toContain('configured')
  })

  it('hides the shared-secret badge and shows the empty placeholder when no secret is stored', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('label[for="lastfm-secret"]').text()).not.toContain('configured')
    expect(wrapper.find('[data-testid="lastfm-secret-input"]').attributes('placeholder')).toBe(
      'Optional — enables artist enrichment',
    )
  })

  // ---------------------------------------------------------------------------
  // Users section
  // ---------------------------------------------------------------------------

  it('stacks user rows on mobile and wraps the action buttons', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const row = wrapper.findAll('[data-testid="user-row"]')[0]!
    // Column layout on mobile, single line from sm: upward
    expect(row.classes()).toContain('flex-col')
    expect(row.classes()).toContain('sm:flex-row')
    // Action buttons live in a wrapping container so they never force overflow
    const buttonGroup = row.find('div.flex-wrap')
    expect(buttonGroup.exists()).toBe(true)
    expect(buttonGroup.find('[data-testid="user-delete-button"]').exists()).toBe(true)
  })

  it('renders the users section with one row per user and Last.fm status', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="users-section"]').exists()).toBe(true)
    const rows = wrapper.findAll('[data-testid="user-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('[data-testid="user-name"]').text()).toBe('Ada')
    expect(rows[0]!.find('[data-testid="user-lastfm-status"]').text()).toContain('ada_fm')
    expect(rows[0]!.find('[data-testid="lastfm-disconnect-button"]').exists()).toBe(true)
    expect(rows[1]!.find('[data-testid="user-name"]').text()).toBe('Ben')
    expect(rows[1]!.find('[data-testid="user-lastfm-status"]').text()).toContain(
      'Not connected to Last.fm',
    )
    expect(rows[1]!.find('[data-testid="lastfm-connect-button"]').exists()).toBe(true)
  })

  it('adds a user and reloads the user list', async () => {
    const { createUser, getUsers } = await import('@/platform/api/usersApi')
    const router = await createRouter()
    const wrapper = await mountView(router)
    const loadsBeforeAdd = vi.mocked(getUsers).mock.calls.length

    await wrapper.find('[data-testid="new-user-input"]').setValue('Cleo')
    await wrapper.find('[data-testid="add-user-button"]').trigger('click')
    await flushPromises()

    expect(createUser).toHaveBeenCalledWith('Cleo')
    expect(vi.mocked(getUsers).mock.calls.length).toBe(loadsBeforeAdd + 1)
    expectInputValue(wrapper, '[data-testid="new-user-input"]', '')
  })

  it('does not call createUser for a blank name', async () => {
    const { createUser } = await import('@/platform/api/usersApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="new-user-input"]').setValue('   ')
    await wrapper.find('[data-testid="add-user-button"]').trigger('click')
    await flushPromises()

    expect(createUser).not.toHaveBeenCalled()
  })

  it('renames a user through the inline rename flow', async () => {
    const { renameUser } = await import('@/platform/api/usersApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper
      .findAll('[data-testid="user-row"]')[1]!
      .find('[data-testid="user-rename-button"]')
      .trigger('click')
    await wrapper.find('[data-testid="user-rename-input"]').setValue('Benjamin')
    await wrapper.find('[data-testid="user-rename-save"]').trigger('click')
    await flushPromises()

    expect(renameUser).toHaveBeenCalledWith('u2', 'Benjamin')
    expect(wrapper.find('[data-testid="user-rename-input"]').exists()).toBe(false)
  })

  it('deletes a user and reloads the user list', async () => {
    const { deleteUser, getUsers } = await import('@/platform/api/usersApi')
    const router = await createRouter()
    const wrapper = await mountView(router)
    const loadsBeforeDelete = vi.mocked(getUsers).mock.calls.length

    await wrapper
      .findAll('[data-testid="user-row"]')[1]!
      .find('[data-testid="user-delete-button"]')
      .trigger('click')
    await flushPromises()

    expect(deleteUser).toHaveBeenCalledWith('u2')
    expect(vi.mocked(getUsers).mock.calls.length).toBe(loadsBeforeDelete + 1)
  })

  it('shows an error when a user action fails', async () => {
    const { createUser } = await import('@/platform/api/usersApi')
    const { err } = await import('@signalform/shared')
    vi.mocked(createUser).mockResolvedValueOnce(
      err({ type: 'SERVER_ERROR', status: 500, message: 'boom' }),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="new-user-input"]').setValue('Cleo')
    await wrapper.find('[data-testid="add-user-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="user-action-error"]').exists()).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // "This is me" selection + scrobble target display
  // ---------------------------------------------------------------------------

  it('selects and persists the user when "This is me" is clicked', async () => {
    const { useUserStore } = await import('@/domains/user/shell/useUserStore')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper
      .findAll('[data-testid="user-row"]')[1]!
      .find('[data-testid="this-is-me-button"]')
      .trigger('click')
    await flushPromises()

    const userStore = useUserStore()
    expect(userStore.selectedUserId).toBe('u2')
    const { SELECTED_USER_KEY } = await import('@/platform/api/userHeader')
    expect(localStorage.getItem(SELECTED_USER_KEY)).toBe('u2')
  })

  it('shows the marker on the selected row and buttons on the others', async () => {
    localStorage.setItem('selected-user-id', 'u1')
    const router = await createRouter()
    const wrapper = await mountView(router)

    const rows = wrapper.findAll('[data-testid="user-row"]')
    expect(rows[0]!.find('[data-testid="this-is-me-marker"]').exists()).toBe(true)
    expect(rows[0]!.find('[data-testid="this-is-me-button"]').exists()).toBe(false)
    expect(rows[1]!.find('[data-testid="this-is-me-marker"]').exists()).toBe(false)
    expect(rows[1]!.find('[data-testid="this-is-me-button"]').exists()).toBe(true)
  })

  it('shows the scrobble target line with the active listener name', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const target = wrapper.find('[data-testid="scrobble-target"]')
    expect(target.exists()).toBe(true)
    expect(target.text()).toContain('Ada')
  })

  it('falls back to the first user when no active listener is set', async () => {
    const { getUsers } = await import('@/platform/api/usersApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getUsers).mockResolvedValueOnce(
      ok({
        users: [
          { id: 'u1', name: 'Ada', lastFmUsername: 'ada_fm', hasLastFmSession: true },
          { id: 'u2', name: 'Ben', hasLastFmSession: false },
        ],
      }),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="scrobble-target"]').text()).toContain('Ada')
  })

  it('hides the scrobble target line when only one user exists', async () => {
    const { getUsers } = await import('@/platform/api/usersApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getUsers).mockResolvedValueOnce(
      ok({
        users: [{ id: 'u1', name: 'Ada', lastFmUsername: 'ada_fm', hasLastFmSession: true }],
        activeListenerId: 'u1',
      }),
    )
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="scrobble-target"]').exists()).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Per-user Last.fm connect flow
  // ---------------------------------------------------------------------------

  it('connect button triggers auth flow for the target user and shows pending prompt', async () => {
    const { requestLastFmAuth } = await import('@/platform/api/lastFmAuthApi')
    vi.mocked(requestLastFmAuth).mockResolvedValueOnce({
      token: 'tok123',
      authUrl: 'https://www.last.fm/api/auth/?api_key=key&token=tok123',
    })

    // Mock window.open
    const openMock = vi.fn()
    vi.stubGlobal('open', openMock)

    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lastfm-connect-button"]').trigger('click')
    await flushPromises()

    expect(requestLastFmAuth).toHaveBeenCalledOnce()
    expect(openMock).toHaveBeenCalledWith(
      'https://www.last.fm/api/auth/?api_key=key&token=tok123',
      '_blank',
    )
    expect(wrapper.find('[data-testid="lastfm-confirm-button"]').exists()).toBe(true)

    vi.unstubAllGlobals()
  })

  it('confirm completes auth with the target userId and reloads users', async () => {
    const { requestLastFmAuth, completeLastFmAuth } = await import('@/platform/api/lastFmAuthApi')
    const { getUsers } = await import('@/platform/api/usersApi')
    vi.mocked(requestLastFmAuth).mockResolvedValueOnce({
      token: 'tok123',
      authUrl: 'https://www.last.fm/api/auth/?api_key=key&token=tok123',
    })
    vi.mocked(completeLastFmAuth).mockResolvedValueOnce({ username: 'ben_fm' })

    vi.stubGlobal('open', vi.fn())

    const router = await createRouter()
    const wrapper = await mountView(router)
    const loadsBeforeConfirm = vi.mocked(getUsers).mock.calls.length

    // Only Ben (u2) has no session — his row shows the connect button
    await wrapper.find('[data-testid="lastfm-connect-button"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="lastfm-confirm-button"]').trigger('click')
    await flushPromises()

    expect(completeLastFmAuth).toHaveBeenCalledWith('tok123', 'u2')
    expect(vi.mocked(getUsers).mock.calls.length).toBe(loadsBeforeConfirm + 1)
    expect(wrapper.find('[data-testid="lastfm-pending-prompt"]').exists()).toBe(false)

    vi.unstubAllGlobals()
  })

  it('disconnect calls disconnectLastFm with the userId and reloads users', async () => {
    const { disconnectLastFm } = await import('@/platform/api/lastFmAuthApi')
    const { getUsers } = await import('@/platform/api/usersApi')
    vi.mocked(disconnectLastFm).mockResolvedValueOnce(true)

    const router = await createRouter()
    const wrapper = await mountView(router)
    const loadsBeforeDisconnect = vi.mocked(getUsers).mock.calls.length

    // Only Ada (u1) has a session — her row shows the disconnect button
    await wrapper.find('[data-testid="lastfm-disconnect-button"]').trigger('click')
    await flushPromises()

    expect(disconnectLastFm).toHaveBeenCalledWith('u1')
    expect(vi.mocked(getUsers).mock.calls.length).toBe(loadsBeforeDisconnect + 1)
  })

  it('shows auth error when connect fails', async () => {
    const { requestLastFmAuth } = await import('@/platform/api/lastFmAuthApi')
    vi.mocked(requestLastFmAuth).mockResolvedValueOnce(null)

    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lastfm-connect-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="lastfm-auth-error"]').exists()).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Global toggles (Personal Radio, Scrobbling)
  // ---------------------------------------------------------------------------

  it('Personal Radio toggle calls updateConfig with personalRadioEnabled', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')

    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="personal-radio-toggle"]').trigger('click')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ personalRadioEnabled: true }),
    )
  })

  it('discovery slider only visible when Personal Radio enabled', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    // Initially hidden
    expect(wrapper.find('[data-testid="discovery-slider-section"]').exists()).toBe(false)

    // Enable Personal Radio
    await wrapper.find('[data-testid="personal-radio-toggle"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="discovery-slider-section"]').exists()).toBe(true)
  })

  it('scrobbling toggle is disabled when the selected user has no session', async () => {
    localStorage.setItem('selected-user-id', 'u2')
    const router = await createRouter()
    const wrapper = await mountView(router)

    const scrobblingToggle = wrapper.find('[data-testid="scrobbling-toggle"]')
    expect(scrobblingToggle.exists()).toBe(true)
    expect(scrobblingToggle.attributes('disabled')).toBeDefined()
  })

  it('scrobbling toggle is enabled when the selected user has a session', async () => {
    localStorage.setItem('selected-user-id', 'u1')
    const router = await createRouter()
    const wrapper = await mountView(router)

    const scrobblingToggle = wrapper.find('[data-testid="scrobbling-toggle"]')
    expect(scrobblingToggle.attributes('disabled')).toBeUndefined()
  })
})
