/**
 * useSearchPanel — displayedTags
 *
 * Sibling of useSearchPanel.test.ts — exercises `displayedTags` directly by
 * calling the composable outside a component, with all I/O dependencies
 * (router, stores, APIs) mocked. Unlike `displayedAlbums`/`displayedArtists`,
 * `displayedTags` has no core ranking function to unit-test separately: the
 * backend already returns tags matched and sorted, so the composable-level
 * pass-through is the only place this behaviour is observable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { ok } from '@signalform/shared'

// getConfig is resolved (and its vi.mock factory invoked) before this file's
// own top-level `const` statements run, so the mock function it needs must
// come from vi.hoisted rather than a plain module-level const.
const { mockGetConfig } = vi.hoisted(() => ({ mockGetConfig: vi.fn() }))

type FullResultsTagsShape = {
  readonly tags: ReadonlyArray<{
    readonly query: string
    readonly displayName: string
    readonly albumCount: number
  }>
}

// A plain ref, not vi.hoisted: mirrors the isPhone/isDesktop pattern already
// used in SearchPanel.test.ts. `.value` reassignment (not property mutation)
// is what keeps this compatible with the functional/immutable-data lint rule.
const fullResults = ref<FullResultsTagsShape | null>(null)

vi.mock('@/platform/api/lovedRadioApi', () => ({ startLovedRadio: vi.fn() }))
vi.mock('@/platform/api/personalRadioApi', () => ({ startPersonalRadio: vi.fn() }))
vi.mock('@/platform/api/genreRadioApi', () => ({ startGenreRadio: vi.fn() }))
vi.mock('@/platform/api/configApi', () => ({ getConfig: mockGetConfig }))
vi.mock('@/platform/api/playbackApi', () => ({ playAlbum: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: (): { readonly query: Record<string, string> } => ({ query: {} }),
  useRouter: (): {
    readonly push: ReturnType<typeof vi.fn>
    readonly replace: ReturnType<typeof vi.fn>
  } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock('./useSearchStore', () => ({
  useSearchStore: (): Record<string, unknown> => ({
    fullResults: fullResults.value,
    searchQuery: '',
    autocompleteSuggestions: [],
    hasSuggestions: false,
    clearAutocompleteSuggestions: vi.fn(),
    clearFullResults: vi.fn(),
  }),
}))

vi.mock('@/domains/playback/shell/usePlaybackStore', () => ({
  usePlaybackStore: (): Record<string, unknown> => ({
    play: vi.fn(),
    pause: vi.fn(),
  }),
}))

import { useSearchPanel } from './useSearchPanel'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockResolvedValue(ok({ personalRadioEnabled: false }))
  fullResults.value = null
})

describe('useSearchPanel — displayedTags', () => {
  it('returns the tags from fullResults, in server order', () => {
    fullResults.value = {
      tags: [
        { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
        { query: 'qsound', displayName: 'QSound', albumCount: 12 },
      ],
    }

    const { displayedTags } = useSearchPanel()

    expect(displayedTags.value).toEqual([
      { query: 'hi-res-audio', displayName: 'Hi-Res Audio', albumCount: 3 },
      { query: 'qsound', displayName: 'QSound', albumCount: 12 },
    ])
  })

  it('returns an empty array when fullResults is null', () => {
    fullResults.value = null

    const { displayedTags } = useSearchPanel()

    expect(displayedTags.value).toEqual([])
  })
})
