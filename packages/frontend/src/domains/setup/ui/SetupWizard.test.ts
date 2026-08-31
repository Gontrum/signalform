import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import type { Router } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import type { Language } from '@/types/i18n'
import SetupWizard from '@/domains/setup/ui/SetupWizardView.vue'
import { setupTestEnv } from '@/test-utils'

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
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        hasDiscogsToken: false,
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

  // a11y audit: the setup wizard is a top-level route and must expose a
  // `main` landmark for screen-reader "skip to main content" navigation.
  it('renders a main landmark as the root element', async () => {
    const context = await mountWizard()

    expect(context.wrapper.find('main').exists()).toBe(true)
    expect(context.wrapper.find('main[data-testid="setup-wizard"]').exists()).toBe(true)
  })

  // jsdom computes no layout, so these two only catch a literal edit of the
  // class strings — the behaviour they stand for is measured in
  // e2e/journeys/phone-layout.spec.ts. /setup is an immersive route that
  // App.vue renders into a fixed-height, overflow-hidden box; `min-h-screen`
  // measured the viewport instead of that box and made the wizard 57px taller
  // than its parent in landscape, with nothing scrollable anywhere.
  it('keeps h-full and overflow-y-auto on the root and no min-h-screen', async () => {
    const context = await mountWizard()

    const rootClass = context.wrapper.get('[data-testid="setup-wizard"]').attributes('class') ?? ''

    expect(rootClass).toContain('h-full')
    expect(rootClass).toContain('overflow-y-auto')
    expect(rootClass).not.toContain('min-h-screen')
  })

  // items-center inside a scroll container clips the top of an overflowing
  // child, and the step indicator and heading are what sit there.
  it('keeps m-auto on the card and no items-center/justify-center on the root', async () => {
    const context = await mountWizard()

    const rootClass = context.wrapper.get('[data-testid="setup-wizard"]').attributes('class') ?? ''
    const cardClass =
      context.wrapper.get('[data-testid="setup-wizard"] > div').attributes('class') ?? ''

    expect(rootClass).not.toContain('items-center')
    expect(rootClass).not.toContain('justify-center')
    expect(cardClass).toContain('m-auto')
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

  it('renders the Advanced label with sufficient-contrast text-neutral-600, not text-neutral-400', async () => {
    const context = await mountWizard()
    const label = context.wrapper.find('[data-testid="manual-entry"] p')
    expect(label.classes()).toContain('text-neutral-600')
    expect(label.classes()).not.toContain('text-neutral-400')
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

describe('SetupWizard — API key step in both languages', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const { discoverServers, getPlayers } = await import('@/platform/api/setupApi')
    vi.mocked(discoverServers).mockResolvedValue({ ok: true, value: [] })
    vi.mocked(getPlayers).mockResolvedValue({ ok: true, value: [makePlayer()] })
  })

  const mountKeysStep = async (language: Language): Promise<VueWrapper> => {
    const router = makeRouter()
    await router.push('/setup')
    await router.isReady()

    const i18nStore = setupTestEnv()
    i18nStore.setLanguage(language)

    const wrapper = mount(SetupWizard, { global: { plugins: [router] } })
    await wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
    await wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="player-item"]').trigger('click')
    await wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
    await nextTick()
    return wrapper
  }

  const keyFieldTexts = (
    wrapper: VueWrapper,
  ): {
    readonly lastFmLabel: string
    readonly lastFmPlaceholder: string | undefined
    readonly fanartLabel: string
    readonly fanartPlaceholder: string | undefined
  } => ({
    lastFmLabel: wrapper.find('label[for="setup-lastfm-key"]').text(),
    lastFmPlaceholder: wrapper.find('[data-testid="lastfm-key-input"]').attributes('placeholder'),
    fanartLabel: wrapper.find('label[for="setup-fanart-key"]').text(),
    fanartPlaceholder: wrapper.find('[data-testid="fanart-key-input"]').attributes('placeholder'),
  })

  it('labels both key fields in English', async () => {
    expect(keyFieldTexts(await mountKeysStep('en'))).toEqual({
      lastFmLabel: 'Last.fm API key',
      lastFmPlaceholder: 'Optional — enables artist enrichment',
      fanartLabel: 'Fanart.tv API key',
      fanartPlaceholder: 'Optional — enables artist hero images',
    })
  })

  it('labels both key fields in German while keeping the service names', async () => {
    expect(keyFieldTexts(await mountKeysStep('de'))).toEqual({
      lastFmLabel: 'Last.fm-API-Schlüssel',
      lastFmPlaceholder: 'Optional — aktiviert Künstlerinfos',
      fanartLabel: 'Fanart.tv-API-Schlüssel',
      fanartPlaceholder: 'Optional — aktiviert Künstlerbilder',
    })
  })
})
