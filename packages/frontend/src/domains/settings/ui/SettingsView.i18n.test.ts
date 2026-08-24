/**
 * Settings — the API key section heading and its four field labels.
 * "Last.fm", "Fanart.tv", "Discogs" and "API" are names and stay put; only
 * the German compound around them changes.
 *
 * Own file because SettingsView.test.ts is already 38 KB. Mirrors
 * SettingsView.userNameLayout.test.ts's mocking approach.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import SettingsView from '@/domains/settings/ui/SettingsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'

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
  const config = {
    lmsHost: '192.168.1.100',
    lmsPort: 9000,
    playerId: 'aa:bb:cc:dd:ee:ff',
    hasLastFmKey: false,
    hasLastFmSharedSecret: false,
    hasFanartKey: false,
    hasDiscogsToken: false,
    isConfigured: true,
    configuredAt: '2024-01-01T00:00:00Z',
    personalRadioEnabled: false,
    scrobblingEnabled: false,
    personalRadioDiscovery: 50,
  }
  return {
    getConfig: vi.fn().mockResolvedValue(ok(config)),
    updateConfig: vi.fn().mockResolvedValue(ok(config)),
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

const mountView = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const router = await createTestRouter([
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/setup', name: 'setup', component: { template: '<div />' } },
    { path: '/', name: 'home', component: { template: '<div />' } },
  ])

  const wrapper = mount(SettingsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const apiKeyTexts = (
  wrapper: VueWrapper,
): {
  readonly heading: string | undefined
  readonly lastFmKey: string
  readonly lastFmSecret: string
  readonly fanartKey: string
  readonly discogsToken: string
  readonly discogsHint: string
} => ({
  heading: wrapper
    .findAll('h2')
    .map((h) => h.text())
    .find((text) => text.includes('API')),
  lastFmKey: wrapper.find('label[for="lastfm-key"]').text(),
  lastFmSecret: wrapper.find('label[for="lastfm-secret"]').text(),
  fanartKey: wrapper.find('label[for="fanart-key"]').text(),
  discogsToken: wrapper.find('label[for="discogs-token"]').text(),
  discogsHint: wrapper.find('label[for="discogs-token"] ~ p').text(),
})

describe('SettingsView — API key section labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPhone.value = false
  })

  it('names the section and its fields in English', async () => {
    expect(apiKeyTexts(await mountView('en'))).toEqual({
      heading: 'API Keys',
      lastFmKey: 'Last.fm API Key',
      lastFmSecret: 'Last.fm Shared Secret',
      fanartKey: 'Fanart.tv API Key',
      discogsToken: 'Discogs Token',
      discogsHint: 'Optional. Increases the rate limit for tag imports.',
    })
  })

  it('names the section and its fields in German without renaming the services', async () => {
    expect(apiKeyTexts(await mountView('de'))).toEqual({
      heading: 'API-Schlüssel',
      lastFmKey: 'Last.fm-API-Schlüssel',
      lastFmSecret: 'Last.fm-Shared-Secret',
      fanartKey: 'Fanart.tv-API-Schlüssel',
      discogsToken: 'Discogs-Token',
      discogsHint: 'Optional. Erhöht das Rate-Limit beim Tag-Import.',
    })
  })
})

const placeholders = (
  wrapper: VueWrapper,
): {
  readonly lastFmKey: string | undefined
  readonly lastFmSecret: string | undefined
  readonly fanartKey: string | undefined
  readonly discogsToken: string | undefined
} => ({
  lastFmKey: wrapper.find('[data-testid="lastfm-key-input"]').attributes('placeholder'),
  lastFmSecret: wrapper.find('[data-testid="lastfm-secret-input"]').attributes('placeholder'),
  fanartKey: wrapper.find('[data-testid="fanart-key-input"]').attributes('placeholder'),
  discogsToken: wrapper.find('[data-testid="discogs-token-input"]').attributes('placeholder'),
})

// The empty-field placeholder is the only text in this section that no label
// repeats, so a copy of the English string here reads as English to a German
// user and nothing else on the screen contradicts it. That is what shipped.
describe('SettingsView — the placeholder of an API key field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPhone.value = false
  })

  it('invites a key in English while no key is stored', async () => {
    expect(placeholders(await mountView('en'))).toEqual({
      lastFmKey: 'Optional — enables artist enrichment',
      lastFmSecret: 'Optional — enables artist enrichment',
      fanartKey: 'Optional — enables artist hero images',
      discogsToken: 'Optional — raises the rate limit for tag imports',
    })
  })

  it('invites a key in German while no key is stored', async () => {
    expect(placeholders(await mountView('de'))).toEqual({
      lastFmKey: 'Optional – aktiviert Künstlerinfos',
      lastFmSecret: 'Optional – aktiviert Künstlerinfos',
      fanartKey: 'Optional – aktiviert Künstlerbilder',
      discogsToken: 'Optional – erhöht das Rate-Limit beim Tag-Import',
    })
  })
})

const configuredBadges = (wrapper: VueWrapper): readonly string[] => [
  wrapper.find('[data-testid="lastfm-key-configured"]').text(),
  wrapper.find('[data-testid="lastfm-secret-configured"]').text(),
  wrapper.find('[data-testid="fanart-key-configured"]').text(),
  wrapper.find('[data-testid="discogs-token-configured"]').text(),
]

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

describe('SettingsView — the badge marking a stored API key', () => {
  // The badge only renders once the server reports a stored key, so this suite
  // needs its own config; the mock factory answers "nothing stored".
  beforeEach(async () => {
    vi.clearAllMocks()
    isPhone.value = false

    const { getConfig } = await import('@/platform/api/configApi')
    const { ok } = await import('@signalform/shared')
    vi.mocked(getConfig).mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: true,
        hasLastFmSharedSecret: true,
        hasFanartKey: true,
        hasDiscogsToken: true,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        language: 'en',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    )
  })

  // The check mark is a glyph, not a word: it survives the switch untouched.
  it('marks all four fields in English and follows a later switch to German', async () => {
    const wrapper = await mountView('en')
    expect(configuredBadges(wrapper)).toEqual([
      '✓ configured',
      '✓ configured',
      '✓ configured',
      '✓ configured',
    ])

    await switchTo('de')

    expect(configuredBadges(wrapper)).toEqual([
      '✓ hinterlegt',
      '✓ hinterlegt',
      '✓ hinterlegt',
      '✓ hinterlegt',
    ])
  })

  it('swaps the placeholder for the replace hint in both languages', async () => {
    const wrapper = await mountView('en')
    expect(placeholders(wrapper)).toEqual({
      lastFmKey: 'Enter new key to replace',
      lastFmSecret: 'Enter new key to replace',
      fanartKey: 'Enter new key to replace',
      discogsToken: 'Enter new token to replace',
    })

    await switchTo('de')

    expect(placeholders(wrapper)).toEqual({
      lastFmKey: 'Neuen Schlüssel eingeben, um zu ersetzen',
      lastFmSecret: 'Neuen Schlüssel eingeben, um zu ersetzen',
      fanartKey: 'Neuen Schlüssel eingeben, um zu ersetzen',
      discogsToken: 'Neues Token eingeben, um zu ersetzen',
    })
  })
})
