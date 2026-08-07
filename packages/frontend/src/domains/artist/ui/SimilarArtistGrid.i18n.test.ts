/**
 * SimilarArtistGrid — heading, the screen-reader-only "in library" marker and
 * the match label are translated and must follow a language switch that
 * happens while the grid is on screen.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import SimilarArtistGrid from './SimilarArtistGrid.vue'
import type { SimilarArtistMatch } from '../core/types'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'

const artists: readonly SimilarArtistMatch[] = [
  { name: 'Portishead', match: 0.92, inLibrary: true },
  { name: 'Tricky', match: 0.71, inLibrary: false },
]

const mountGrid = (): ReturnType<typeof mount> => mount(SimilarArtistGrid, { props: { artists } })

describe('SimilarArtistGrid – a language switch after mount', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('re-renders the heading in the new language', async () => {
    const wrapper = mountGrid()

    expect(wrapper.find('h2').text()).toBe('You might also like')

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(wrapper.find('h2').text()).toBe('Das könnte dir auch gefallen')
  })

  // The match label fills {percent}; the marker is only ever read aloud, so a
  // stale translation there is invisible to anyone not using a screen reader.
  it('re-renders the match label and the in-library marker in the new language', async () => {
    const wrapper = mountGrid()

    const matchLabels = (): readonly string[] =>
      wrapper.findAll('[data-testid="similar-artist-card"] p:last-child').map((p) => p.text())

    expect(matchLabels()).toEqual(['92% match', '71% match'])
    expect(wrapper.find('[data-testid="similar-artist-in-library"]').text()).toBe('In library')

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(matchLabels()).toEqual(['92% Übereinstimmung', '71% Übereinstimmung'])
    expect(wrapper.find('[data-testid="similar-artist-in-library"]').text()).toBe('In Bibliothek')
  })

  it('marks only the artist that is in the library', () => {
    const wrapper = mountGrid()

    const cards = wrapper.findAll('[data-testid="similar-artist-card"]')
    expect(cards[0]?.find('[data-testid="similar-artist-in-library"]').exists()).toBe(true)
    expect(cards[1]?.find('[data-testid="similar-artist-in-library"]').exists()).toBe(false)
  })
})
