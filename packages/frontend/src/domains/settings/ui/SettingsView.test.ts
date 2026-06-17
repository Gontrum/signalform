import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import SettingsView from '@/domains/settings/ui/SettingsView.vue'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/platform/api/configApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    getConfig: vi.fn().mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        hasLastFmSession: false,
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
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        hasLastFmSession: false,
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
    vi.clearAllMocks()
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
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        language: 'de',
        hasLastFmSession: false,
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
  // Last.fm section
  // ---------------------------------------------------------------------------

  it('renders the Last.fm section', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)
    expect(wrapper.find('[data-testid="lastfm-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lastfm-connect-button"]').exists()).toBe(true)
  })

  it('connect button triggers auth flow and shows pending prompt', async () => {
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
    expect(wrapper.find('[data-testid="lastfm-connect-button"]').exists()).toBe(false)

    vi.unstubAllGlobals()
  })

  it('confirm button shown after connect, completes auth and shows connected state', async () => {
    const { requestLastFmAuth, completeLastFmAuth } = await import('@/platform/api/lastFmAuthApi')
    vi.mocked(requestLastFmAuth).mockResolvedValueOnce({
      token: 'tok123',
      authUrl: 'https://www.last.fm/api/auth/?api_key=key&token=tok123',
    })
    vi.mocked(completeLastFmAuth).mockResolvedValueOnce({ username: 'radiohead_fan' })

    vi.stubGlobal('open', vi.fn())

    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lastfm-connect-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="lastfm-confirm-button"]').exists()).toBe(true)

    await wrapper.find('[data-testid="lastfm-confirm-button"]').trigger('click')
    await flushPromises()

    expect(completeLastFmAuth).toHaveBeenCalledWith('tok123')
    expect(wrapper.find('[data-testid="lastfm-connected-row"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lastfm-disconnect-button"]').exists()).toBe(true)

    vi.unstubAllGlobals()
  })

  it('connected state shows username and disconnect button', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: true,
        hasFanartKey: false,
        isConfigured: true,
        language: 'en' as const,
        lastFmUsername: 'radiohead_fan',
        hasLastFmSession: true,
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )

    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="lastfm-connected-row"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lastfm-disconnect-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lastfm-connected-row"]').text()).toContain('radiohead_fan')
  })

  it('disconnect button calls disconnectLastFm and resets to idle', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { disconnectLastFm } = await import('@/platform/api/lastFmAuthApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: true,
        hasFanartKey: false,
        isConfigured: true,
        language: 'en' as const,
        lastFmUsername: 'radiohead_fan',
        hasLastFmSession: true,
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )
    vi.mocked(disconnectLastFm).mockResolvedValueOnce(true)

    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="lastfm-disconnect-button"]').trigger('click')
    await flushPromises()

    expect(disconnectLastFm).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="lastfm-connect-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lastfm-connected-row"]').exists()).toBe(false)
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

  it('scrobbling toggle is disabled when no session key', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const scrobblingToggle = wrapper.find('[data-testid="scrobbling-toggle"]')
    expect(scrobblingToggle.exists()).toBe(true)
    expect(scrobblingToggle.attributes('disabled')).toBeDefined()
  })

  it('scrobbling toggle is enabled when session key exists', async () => {
    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValueOnce(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: true,
        hasFanartKey: false,
        isConfigured: true,
        language: 'en' as const,
        lastFmUsername: 'testuser',
        hasLastFmSession: true,
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )

    const router = await createRouter()
    const wrapper = await mountView(router)

    const scrobblingToggle = wrapper.find('[data-testid="scrobbling-toggle"]')
    expect(scrobblingToggle.attributes('disabled')).toBeUndefined()
  })
})
