/**
 * Settings — the Discogs token field: rendering, the configured badge, and
 * its save payload. Own file because SettingsView.test.ts is already 36 KB
 * (over the 20 KB guideline in AGENTS.md).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import SettingsView from '@/domains/settings/ui/SettingsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

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

const baseConfig = {
  lmsHost: '192.168.1.100',
  lmsPort: 9000,
  playerId: 'aa:bb:cc:dd:ee:ff',
  hasLastFmKey: false,
  hasLastFmSharedSecret: false,
  hasFanartKey: false,
  hasDiscogsToken: false,
  isConfigured: true,
  configuredAt: '2024-01-01T00:00:00Z',
  language: 'en' as const,
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
}

vi.mock('@/platform/api/configApi', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}))

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
    getUsers: vi.fn().mockResolvedValue(ok({ users: [], activeListenerId: undefined })),
    createUser: vi.fn(),
    renameUser: vi.fn(),
    deleteUser: vi.fn(),
  }
})

const settingsRoutes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
  { path: '/settings', name: 'settings', component: { template: '<div />' } },
  { path: '/setup', name: 'setup', component: { template: '<div />' } },
] as const

describe('SettingsView — Discogs token field', () => {
  beforeEach(async () => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
    isPhone.value = false

    const { ok } = await import('@signalform/shared')
    const { getConfig, updateConfig } = await import('@/platform/api/configApi')
    vi.mocked(getConfig).mockResolvedValue(ok(baseConfig))
    vi.mocked(updateConfig).mockResolvedValue(ok(baseConfig))
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([...settingsRoutes], '/settings')
  }

  const mountView = async (router: Router): Promise<VueWrapper> => {
    const wrapper = mount(SettingsView, {
      global: { plugins: [router] },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
  }

  it('renders the Discogs token field', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="discogs-token-input"]').exists()).toBe(true)
  })

  it('masks the token: a personal access token is a secret, not a public key', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="discogs-token-input"]').attributes('type')).toBe('password')
  })

  it('does not show the configured badge when no token is stored', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="discogs-token-configured"]').exists()).toBe(false)
  })

  it('shows the configured badge when a token is stored', async () => {
    const { ok } = await import('@signalform/shared')
    const { getConfig } = await import('@/platform/api/configApi')
    vi.mocked(getConfig).mockResolvedValueOnce(ok({ ...baseConfig, hasDiscogsToken: true }))

    const router = await createRouter()
    const wrapper = await mountView(router)

    expect(wrapper.find('[data-testid="discogs-token-configured"]').exists()).toBe(true)
  })

  it('sends the entered token in the update payload on save', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="discogs-token-input"]').setValue('my-secret-discogs-token')
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ discogsToken: 'my-secret-discogs-token' }),
    )
  })

  it('omits discogsToken from the payload when the field is left empty, mirroring the Fanart field', async () => {
    const { updateConfig } = await import('@/platform/api/configApi')
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    const payload = vi.mocked(updateConfig).mock.calls[0]?.[0]
    expect(payload).toBeDefined()
    expect(payload !== undefined && 'discogsToken' in payload).toBe(false)
    expect(payload !== undefined && 'fanartApiKey' in payload).toBe(false)
  })

  it('clears the discogsToken input after a successful save', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="discogs-token-input"]').setValue('my-secret-discogs-token')
    await wrapper.find('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()

    const input = wrapper.find('[data-testid="discogs-token-input"]').element
    expect(input).toBeInstanceOf(HTMLInputElement)
    if (input instanceof HTMLInputElement) {
      expect(input.value).toBe('')
    }
  })
})
