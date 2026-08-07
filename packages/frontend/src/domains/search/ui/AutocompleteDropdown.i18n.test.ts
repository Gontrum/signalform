/**
 * AutocompleteDropdown — the listbox name and the footer CTA that repeats the
 * user's query.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this dropdown has been set up. Setting it before mounting would let a
 * label read once during setup pass.
 *
 * Own file so AutocompleteDropdown.test.ts stays about props.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

import { nextTick } from 'vue'
import { setupTestEnv } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'
import type { AutocompleteSuggestion } from '../core/types'
import AutocompleteDropdown from './AutocompleteDropdown.vue'

const suggestions: readonly AutocompleteSuggestion[] = [
  { id: '1', type: 'album', artist: 'Massive Attack', album: 'Mezzanine' },
]

const mountDropdown = async (query: string): Promise<VueWrapper> => {
  setupTestEnv()

  const wrapper = mount(AutocompleteDropdown, {
    props: { suggestions, isLoading: false, isEmpty: false, error: null, query },
  })
  await nextTick()
  return wrapper
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const listboxLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('ul[role="listbox"]').attributes('aria-label')

const footerLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[data-testid="autocomplete-footer-hint"]').attributes('aria-label')

describe('AutocompleteDropdown — translated accessible names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the listbox in English', async () => {
    expect(listboxLabel(await mountDropdown('teardrop'))).toBe('Autocomplete suggestions')
  })

  it('names the listbox in German', async () => {
    const wrapper = await mountDropdown('teardrop')

    await switchTo('de')

    expect(listboxLabel(wrapper)).toBe('Suchvorschläge')
  })

  it('keeps the query itself untranslated inside the English footer CTA', async () => {
    expect(footerLabel(await mountDropdown('teardrop'))).toBe('Search for teardrop')
    expect(footerLabel(await mountDropdown('unfinished sympathy'))).toBe(
      'Search for unfinished sympathy',
    )
  })

  // Each dropdown is switched on its own: `setupTestEnv` installs a fresh Pinia
  // per mount, so only the most recently mounted one sees a later change.
  it('keeps the query itself untranslated inside the German footer CTA', async () => {
    const short = await mountDropdown('teardrop')
    await switchTo('de')
    expect(footerLabel(short)).toBe('Nach teardrop suchen')

    const long = await mountDropdown('unfinished sympathy')
    await switchTo('de')
    expect(footerLabel(long)).toBe('Nach unfinished sympathy suchen')
  })
})
