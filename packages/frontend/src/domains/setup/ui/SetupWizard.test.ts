import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import type { Router } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import SetupWizard from '@/domains/setup/ui/SetupWizardView.vue'

vi.mock('@/platform/api/setupApi', () => ({
  discoverServers: vi.fn(),
  getPlayers: vi.fn(),
}))

vi.mock('@/platform/api/configApi', () => ({
  updateConfig: vi.fn(),
}))

const makeRouter = (): Router =>
  createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/setup', name: 'setup', component: SetupWizard },
      { path: '/', name: 'home', component: { template: '<div />' } },
    ],
  })

const makePlayer = (
  overrides: Partial<{
    readonly id: string
    readonly name: string
    readonly model: string
    readonly connected: boolean
  }> = {},
): {
  readonly id: string
  readonly name: string
  readonly model: string
  readonly connected: boolean
} => ({
  id: 'aa:bb:cc:dd:ee:ff',
  name: 'Living Room',
  model: 'squeezelite',
  connected: true,
  ...overrides,
})

type TestContext = {
  readonly router: ReturnType<typeof makeRouter>
  readonly wrapper: VueWrapper
}

describe('SetupWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    // Default mocks
    const { discoverServers } = await import('@/platform/api/setupApi')
    vi.mocked(discoverServers).mockResolvedValue({ ok: true, value: [] })

    const { updateConfig } = await import('@/platform/api/configApi')
    vi.mocked(updateConfig).mockResolvedValue({
      ok: true,
      value: {
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasFanartKey: false,
        isConfigured: true,
        language: 'en',
      },
    })
  })

  const mountWizard = async (): Promise<TestContext> => {
    const router = makeRouter()
    await router.push('/setup')
    await router.isReady()
    setActivePinia(createPinia())
    const wrapper = mount(SetupWizard, { global: { plugins: [router] } })
    return { router, wrapper }
  }

  it('renders step-server initially', async () => {
    const context = await mountWizard()
    expect(context.wrapper.find('[data-testid="step-server"]').exists()).toBe(true)
  })

  it('scan button calls discoverServers', async () => {
    const { discoverServers } = await import('@/platform/api/setupApi')

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="scan-button"]').trigger('click')
    await flushPromises()

    expect(discoverServers).toHaveBeenCalledOnce()
  })

  it('shows discovered servers after scan', async () => {
    const { discoverServers } = await import('@/platform/api/setupApi')
    vi.mocked(discoverServers).mockResolvedValue({
      ok: true,
      value: [{ host: '192.168.1.100', port: 9000, name: 'Living Room LMS', version: '9.0.3' }],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="scan-button"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="discovered-servers"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="discovered-server-item"]')).toHaveLength(1)
  })

  it('shows scan-error when no servers found', async () => {
    const context = await mountWizard()
    await context.wrapper.find('[data-testid="scan-button"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="scan-error"]').exists()).toBe(true)
  })

  it('proceed-to-player-button disabled when no host selected', async () => {
    const context = await mountWizard()
    const btn = context.wrapper.find('[data-testid="proceed-to-player-button"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('advances to step-player when server selected and continue clicked', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    // Enter manual host
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="step-player"]').exists()).toBe(true)
    expect(getPlayers).toHaveBeenCalledWith('192.168.1.100', 9000)
  })

  it('shows player list after loading', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer(), makePlayer({ id: 'bb:cc:dd:ee:ff:00', name: 'Kitchen' })],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.findAll('[data-testid="player-item"]')).toHaveLength(2)
  })

  it('proceed-to-keys-button disabled until player selected', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()

    expect(
      context.wrapper.find('[data-testid="proceed-to-keys-button"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('advances to step-keys when player selected and continue clicked', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()

    await context.wrapper.find('[data-testid="player-item"]').trigger('click')
    await context.wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')

    expect(context.wrapper.find('[data-testid="step-keys"]').exists()).toBe(true)
  })

  it('skip button calls updateConfig without API keys and shows done', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    const { updateConfig } = await import('@/platform/api/configApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()
    await context.wrapper.find('[data-testid="player-item"]').trigger('click')
    await context.wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
    await context.wrapper.find('[data-testid="skip-keys-button"]').trigger('click')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lmsHost: '192.168.1.100', playerId: 'aa:bb:cc:dd:ee:ff' }),
    )
    expect(context.wrapper.find('[data-testid="step-done"]').exists()).toBe(true)
  })

  it('save button calls updateConfig with API keys', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    const { updateConfig } = await import('@/platform/api/configApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()
    await context.wrapper.find('[data-testid="player-item"]').trigger('click')
    await context.wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
    await context.wrapper.find('[data-testid="lastfm-key-input"]').setValue('my-lastfm-key')
    await context.wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ lastFmApiKey: 'my-lastfm-key' }),
    )
    expect(context.wrapper.find('[data-testid="step-done"]').exists()).toBe(true)
  })

  it('finish button navigates to home', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })

    const context = await mountWizard()
    const pushSpy = vi.spyOn(context.router, 'push')
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()
    await context.wrapper.find('[data-testid="player-item"]').trigger('click')
    await context.wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
    await context.wrapper.find('[data-testid="skip-keys-button"]').trigger('click')
    await flushPromises()
    await context.wrapper.find('[data-testid="finish-button"]').trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'home' })
  })

  it('shows save-error when updateConfig fails', async () => {
    const { getPlayers } = await import('@/platform/api/setupApi')
    const { updateConfig } = await import('@/platform/api/configApi')
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [makePlayer()],
    })
    vi.mocked(updateConfig).mockResolvedValue({
      ok: false,
      error: { type: 'NETWORK_ERROR', message: 'Connection refused' },
    })

    const context = await mountWizard()
    await context.wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await context.wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()
    await context.wrapper.find('[data-testid="player-item"]').trigger('click')
    await context.wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
    await context.wrapper.find('[data-testid="skip-keys-button"]').trigger('click')
    await flushPromises()

    expect(context.wrapper.find('[data-testid="save-error"]').exists()).toBe(true)
    expect(context.wrapper.find('[data-testid="step-done"]').exists()).toBe(false)
  })
})
