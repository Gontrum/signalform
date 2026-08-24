/**
 * SearchPanel — the autocomplete result count sits in an aria-live region, so
 * a screen reader speaks it out loud. A bare number says "7" and names nothing.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after the panel is on screen.
 *
 * Own file because SearchPanel.test.ts is already 61 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, nextTick } from 'vue'

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

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

vi.mock('@/platform/api/searchApi', () => ({
  searchTracks: vi.fn(),
  fetchAutocomplete: vi.fn(),
  fetchFullResults: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', async () => {
  const { mockPlaybackApiModule } = await import('@/test-utils')
  const { ok } = await import('@signalform/shared')
  return { ...(await mockPlaybackApiModule()), playAlbum: vi.fn().mockResolvedValue(ok(undefined)) }
})

vi.mock('@/platform/api/queueApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
    jumpToTrack: vi.fn().mockResolvedValue(ok(undefined)),
    getQueue: vi.fn().mockResolvedValue(ok([])),
  }
})

vi.mock('@/platform/api/configApi', () => ({ getConfig: vi.fn() }))
vi.mock('@/platform/api/lovedRadioApi', () => ({ startLovedRadio: vi.fn() }))
vi.mock('@/platform/api/personalRadioApi', () => ({ startPersonalRadio: vi.fn() }))

import SearchPanel from './SearchPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import { useSearchStore } from '../shell/useSearchStore'
import { fetchAutocomplete } from '@/platform/api/searchApi'
import { getConfig } from '@/platform/api/configApi'
import type { AutocompleteSuggestion } from '../core/types'
import type { MaskedConfig } from '@/platform/api/configApi'
import type { Language } from '@/types/i18n'

const mockFetchAutocomplete = vi.mocked(fetchAutocomplete)
const mockGetConfig = vi.mocked(getConfig)

const suggestion = (id: string, album: string): AutocompleteSuggestion => ({
  id,
  type: 'album',
  artist: 'Massive Attack',
  album,
})

// Filled through the store action rather than by typing: the debounce would
// only add 300ms of waiting to a case about wording.
const mountWithSuggestions = async (
  suggestions: readonly AutocompleteSuggestion[],
): Promise<VueWrapper> => {
  setupTestEnv()
  mockFetchAutocomplete.mockResolvedValue({ ok: true, value: { suggestions, query: 'mezzanine' } })

  await useSearchStore().fetchAutocompleteSuggestions('mezzanine')

  const router = await createTestRouter([{ path: '/', component: { template: '<div />' } }])
  const wrapper = mount(SearchPanel, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const countText = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="results-count"]').text()

const config: MaskedConfig = {
  lmsHost: '192.168.178.39',
  lmsPort: 9000,
  playerId: 'aa:bb:cc:dd:ee:ff',
  hasLastFmKey: false,
  hasLastFmSharedSecret: false,
  hasFanartKey: false,
  hasDiscogsToken: false,
  isConfigured: true,
  language: 'en',
  personalRadioEnabled: false,
}

describe('SearchPanel — the spoken suggestion count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue({ ok: true, value: config })
  })

  it('names a single suggestion in English', async () => {
    expect(countText(await mountWithSuggestions([suggestion('1', 'Mezzanine')]))).toBe(
      '1 suggestion',
    )
  })

  it('names several suggestions in English', async () => {
    const wrapper = await mountWithSuggestions([
      suggestion('1', 'Mezzanine'),
      suggestion('2', 'Blue Lines'),
      suggestion('3', 'Protection'),
    ])

    expect(countText(wrapper)).toBe('3 suggestions')
  })

  it('names a single suggestion in German after a late language switch', async () => {
    const wrapper = await mountWithSuggestions([suggestion('1', 'Mezzanine')])

    await switchTo('de')

    expect(countText(wrapper)).toBe('1 Vorschlag')
  })

  it('names several suggestions in German after a late language switch', async () => {
    const wrapper = await mountWithSuggestions([
      suggestion('1', 'Mezzanine'),
      suggestion('2', 'Blue Lines'),
      suggestion('3', 'Protection'),
    ])

    await switchTo('de')

    expect(countText(wrapper)).toBe('3 Vorschläge')
  })

  // Four digits are the first count where the languages disagree about the
  // separator, and where a host-formatted number speaks English inside German.
  it('groups a four-digit count the way each language groups it', async () => {
    const wrapper = await mountWithSuggestions(
      Array.from({ length: 1234 }, (_, index) =>
        suggestion(String(index + 1), `Album ${index + 1}`),
      ),
    )
    expect(countText(wrapper)).toBe('1,234 suggestions')

    await switchTo('de')

    expect(countText(wrapper)).toBe('1.234 Vorschläge')
  })
})
