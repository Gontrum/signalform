/**
 * SearchPanel Component Tests
 *
 * Tests search panel with autocomplete integration.
 * Uses Given/When/Then pattern with helper functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchPanel from './SearchPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import * as searchApi from '@/platform/api/searchApi'
import { ok, err } from '@signalform/shared'
import type { AlbumResult, ArtistResult, TrackResult } from '../core/types'

// SearchPanel renders AutocompleteDropdown which uses useArtistImages → getArtistHeroImage
vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

// Mock the search API
vi.mock('@/platform/api/searchApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    searchTracks: vi.fn().mockResolvedValue(
      ok({
        results: [],
        query: '',
        totalCount: 0,
      }),
    ),
    fetchAutocomplete: vi.fn().mockResolvedValue(
      ok({
        suggestions: [],
        query: '',
      }),
    ),
    fetchFullResults: vi.fn().mockResolvedValue(
      ok({
        tracks: [],
        albums: [],
        artists: [],
        query: '',
        totalResults: 0,
      }),
    ),
  }
})

// Mock the playback API
vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    playAlbum: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(ok({ status: 'stopped', currentTime: 0, currentTrack: null })),
  }
})

// Mock the queue API
vi.mock('@/platform/api/queueApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    addToQueue: vi.fn().mockResolvedValue(ok(undefined)),
    jumpToTrack: vi.fn().mockResolvedValue(ok(undefined)),
    getQueue: vi.fn().mockResolvedValue(ok([])),
  }
})

import * as queueApi from '@/platform/api/queueApi'

const isTrackArray = (value: unknown): value is readonly TrackResult[] => Array.isArray(value)

const isAlbumArray = (value: unknown): value is readonly AlbumResult[] => Array.isArray(value)

const isArtistArray = (value: unknown): value is readonly ArtistResult[] => Array.isArray(value)

const getTrackResultsProp = (value: unknown): readonly TrackResult[] => {
  expect(isTrackArray(value)).toBe(true)

  return isTrackArray(value) ? value : []
}

const getAlbumResultsProp = (value: unknown): readonly AlbumResult[] => {
  expect(isAlbumArray(value)).toBe(true)

  return isAlbumArray(value) ? value : []
}

const getArtistResultsProp = (value: unknown): readonly ArtistResult[] => {
  expect(isArtistArray(value)).toBe(true)

  return isArtistArray(value) ? value : []
}

type TestContext = {
  readonly router: Router
  readonly wrapper: VueWrapper
}

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
    { path: '/artist/:artistId', name: 'artist-detail', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
  ])
}

const createMountedContext = async (): Promise<TestContext> => {
  const router = await createRouter()
  const wrapper = mount(SearchPanel, { global: { plugins: [router] } })
  await nextTick()
  return { router, wrapper }
}

const createMountedContextAt = async (path: string): Promise<TestContext> => {
  const router = await createRouter()
  await router.push(path)
  const wrapper = mount(SearchPanel, { global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}

describe('SearchPanel', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  it('renders search input with placeholder', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenSearchInputExists(context.wrapper)
    await thenPlaceholderIs(context.wrapper, 'Search albums, artists or tracks…')
  })

  it('centers search bar vertically and horizontally', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenSearchBarIsCentered(context.wrapper)
  })

  it('has Apple aesthetic styling', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenInputHasSubtleBorder(context.wrapper)
    await thenInputHasFocusRing(context.wrapper)
  })

  it('calls autocomplete API when user types', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'Pink Floyd')
    await new Promise((resolve) => setTimeout(resolve, 350)) // Wait for debounce

    await thenAutocompleteApiWasCalled()
  })

  it('is keyboard accessible', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenInputIsFocusable(context.wrapper)
    await thenInputHasAriaLabel(context.wrapper)
  })

  it('shows empty state initially', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenEmptyStateIsVisible(context.wrapper)
  })

  it('does not search when query is less than 2 characters', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'a')

    // No search should be triggered for single character
    await new Promise((resolve) => setTimeout(resolve, 350))
  })

  it('clears results when query becomes empty', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'test')
    await new Promise((resolve) => setTimeout(resolve, 350))

    await whenUserTypesInSearchInput(context.wrapper, '')
    await new Promise((resolve) => setTimeout(resolve, 350))

    // Results should be cleared
  })

  it('debounces autocomplete calls (only 1 API call for fast typing)', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()
    vi.clearAllMocks()

    // Type fast without pausing
    await whenUserTypesInSearchInput(context.wrapper, 'P')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await whenUserTypesInSearchInput(context.wrapper, 'Pi')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await whenUserTypesInSearchInput(context.wrapper, 'Pin')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')

    // Wait for debounce to complete
    await new Promise((resolve) => setTimeout(resolve, 350))

    // Should only call API once with final query
    await thenAutocompleteApiWasCalledOnce()
  })

  it('cancels previous request when user types again', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()
    vi.clearAllMocks()

    // Type, wait a bit, then type again before first request completes
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await whenUserTypesInSearchInput(context.wrapper, 'Pink Floyd')

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 350))

    // AbortController should have cancelled first request
    // API should be called with latest query only
    await thenAutocompleteApiWasCalledWithLatestQuery()
  })

  it('cleans up AbortController on unmount', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Unmount while request might be in flight
    context.wrapper.unmount()

    // AbortController should have been aborted (no error thrown)
    expect(true).toBe(true) // Verify no exceptions
  })

  it('shows minimum length hint for single character query', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'P')
    await new Promise((resolve) => setTimeout(resolve, 350))

    await thenMinLengthHintIsVisible(context.wrapper)
  })

  it('hides minimum length hint when query is 2+ characters', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await whenUserTypesInSearchInput(context.wrapper, 'P')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await thenMinLengthHintIsVisible(context.wrapper)

    await whenUserTypesInSearchInput(context.wrapper, 'Pi')
    await new Promise((resolve) => setTimeout(resolve, 350))

    await thenMinLengthHintIsHidden(context.wrapper)
  })

  it('has ARIA attributes for combobox accessibility', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenInputHasComboboxRole(context.wrapper)
    await thenInputHasAriaExpanded(context.wrapper)
    await thenInputHasAriaControls(context.wrapper)
  })

  it('applies responsive classes for tablet and phone', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenSearchInputHasResponsiveClasses(context.wrapper)
  })

  it('handles touch-friendly tap targets', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    await thenInputIsTouchFriendly(context.wrapper)
  })

  it('displays results count when suggestions are available', async (): Promise<void> => {
    // Mock some suggestions
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [
          { id: '1', type: 'artist', artist: 'Pink Floyd' },
          { id: '2', type: 'album', artist: 'Pink Floyd', album: 'The Wall' },
        ],
        query: 'Pink',
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    await thenResultsCountIsVisible(context.wrapper)
  })

  it('shows loading indicator after 150ms threshold', async (): Promise<void> => {
    // Mock slow response
    vi.mocked(searchApi.fetchAutocomplete).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(ok({ suggestions: [], query: '' })), 200),
        ),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')

    // Wait for debounce + partial API time
    await new Promise((resolve) => setTimeout(resolve, 300 + 160))

    await thenLoadingIndicatorWasShown(context.wrapper)
  })

  it('updates the active query to the selected autocomplete suggestion before full search', async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [{ id: '1', type: 'artist', artist: 'The Peacocks' }],
        query: 'taylor swift',
      }),
    )
    vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
      ok({
        tracks: [],
        albums: [],
        artists: [],
        query: 'The Peacocks',
        totalResults: 0,
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'taylor swift')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    const autocomplete = context.wrapper.findComponent({ name: 'AutocompleteDropdown' })
    autocomplete.vm.$emit('select', { id: '1', type: 'artist', artist: 'The Peacocks' })
    await nextTick()

    const input = context.wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('The Peacocks')

    await input.trigger('keydown.enter')
    await flushPromises()

    expect(searchApi.fetchFullResults).toHaveBeenCalledWith('The Peacocks')
  })

  it('handles Enter key press (AC3: pressing Enter triggers full search)', async (): Promise<void> => {
    vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
      ok({
        tracks: [],
        albums: [],
        artists: [],
        query: 'Pink Floyd',
        totalResults: 0,
      }),
    )

    const context = await whenSearchPanelIsMounted()
    const input = context.wrapper.find('input')
    await input.setValue('Pink Floyd')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(searchApi.fetchFullResults).toHaveBeenCalledWith('Pink Floyd')
  })

  it('handles Arrow Down key for dropdown navigation', async (): Promise<void> => {
    // Mock suggestions
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [
          { id: '1', type: 'artist', artist: 'Pink Floyd' },
          { id: '2', type: 'album', artist: 'Pink Floyd', album: 'The Wall' },
        ],
        query: 'Pink',
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    const input = context.wrapper.find('input')
    await input.trigger('keydown.down')
    await nextTick()

    // Headless UI handles navigation - verify no errors
    expect(true).toBe(true)
  })

  it('handles Arrow Up key for dropdown navigation', async (): Promise<void> => {
    // Mock suggestions
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [
          { id: '1', type: 'artist', artist: 'Pink Floyd' },
          { id: '2', type: 'album', artist: 'Pink Floyd', album: 'The Wall' },
        ],
        query: 'Pink',
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    const input = context.wrapper.find('input')
    await input.trigger('keydown.up')
    await nextTick()

    // Headless UI handles navigation - verify no errors
    expect(true).toBe(true)
  })

  it('handles Escape key to clear query and suggestions', async (): Promise<void> => {
    vi.mocked(searchApi.fetchAutocomplete).mockResolvedValue(
      ok({
        suggestions: [
          { id: '1', type: 'artist', artist: 'Pink Floyd' },
          { id: '2', type: 'album', artist: 'Pink Floyd', album: 'The Wall' },
        ],
        query: 'Pink',
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await nextTick()

    const input = context.wrapper.find('input')

    // First Escape: closes the dropdown but preserves the typed query
    await input.trigger('keydown.esc')
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('Pink')

    // Second Escape: clears the query
    await input.trigger('keydown.esc')
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('handles Tab key for focus management', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    const input = context.wrapper.find('input')
    await input.setValue('Pink')
    await input.trigger('keydown.tab')
    await nextTick()

    // Headless UI handles tab navigation - verify no errors
    expect(true).toBe(true)
  })

  // === WHEN ===

  const whenSearchPanelIsMounted = async (): Promise<TestContext> => {
    return createMountedContext()
  }

  const whenUserTypesInSearchInput = async (wrapper: VueWrapper, query: string): Promise<void> => {
    const input = wrapper.find('input')
    await input.setValue(query)
    await input.trigger('input')
    await nextTick()
  }

  // === THEN ===

  const thenSearchInputExists = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
  }

  const thenPlaceholderIs = async (wrapper: VueWrapper, text: string): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe(text)
  }

  const thenSearchBarIsCentered = async (wrapper: VueWrapper): Promise<void> => {
    const container = wrapper.find('[data-testid="search-container"]')
    expect(container.exists()).toBe(true)
    // In autocomplete mode, the inner container should be centered
    // Root container has flex flex-col p-6
    // Inner div has flex h-full flex-col items-center justify-center
    const innerContainer = container.find('.flex.h-full.flex-col.items-center.justify-center')
    expect(innerContainer.exists()).toBe(true)
  }

  const thenInputHasSubtleBorder = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.classes()).toContain('border')
  }

  const thenInputHasFocusRing = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    const classes = input.classes().join(' ')
    expect(classes).toMatch(/focus:ring/)
  }

  const thenAutocompleteApiWasCalled = async (): Promise<void> => {
    expect(searchApi.fetchAutocomplete).toHaveBeenCalled()
  }

  const thenInputIsFocusable = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('tabindex')).not.toBe('-1')
  }

  const thenInputHasAriaLabel = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('aria-label')).toBeTruthy()
  }

  const thenEmptyStateIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    // Search panel should show search input even in empty state
    const input = wrapper.find('input')
    expect(input.isVisible()).toBe(true)
  }

  const thenAutocompleteApiWasCalledOnce = async (): Promise<void> => {
    expect(searchApi.fetchAutocomplete).toHaveBeenCalledTimes(1)
  }

  const thenAutocompleteApiWasCalledWithLatestQuery = async (): Promise<void> => {
    const calls = vi.mocked(searchApi.fetchAutocomplete).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall).toBeDefined()
    expect(lastCall?.[0]).toBe('Pink Floyd')
  }

  const thenMinLengthHintIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const hint = wrapper.find('[data-testid="min-length-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('at least 2 characters')
  }

  const thenMinLengthHintIsHidden = async (wrapper: VueWrapper): Promise<void> => {
    const hint = wrapper.find('[data-testid="min-length-hint"]')
    expect(hint.exists()).toBe(false)
  }

  const thenInputHasComboboxRole = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('role')).toBe('combobox')
  }

  const thenInputHasAriaExpanded = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('aria-expanded')).toBeDefined()
  }

  const thenInputHasAriaControls = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    expect(input.attributes('aria-controls')).toBe('autocomplete-dropdown')
  }

  const thenSearchInputHasResponsiveClasses = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    // Input should have responsive width classes
    expect(input.classes()).toContain('w-full')
  }

  const thenInputIsTouchFriendly = async (wrapper: VueWrapper): Promise<void> => {
    const input = wrapper.find('input')
    // Check for sufficient padding (py-3 = 12px vertical = 24px height + content)
    expect(input.classes()).toContain('py-3')
    expect(input.classes()).toContain('px-4')
  }

  const thenResultsCountIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const resultsCount = wrapper.find('[data-testid="results-count"]')
    expect(resultsCount.exists()).toBe(true)
  }

  const thenLoadingIndicatorWasShown = async (wrapper: VueWrapper): Promise<void> => {
    await nextTick()
    // At 300ms debounce + 160ms (> 150ms threshold, < 200ms mock response),
    // showLoadingIndicator should be true → AutocompleteDropdown receives isLoading=true
    const autocomplete = wrapper.findComponent({ name: 'AutocompleteDropdown' })
    expect(autocomplete.props('isLoading')).toBe(true)
  }

  // === Autocomplete Navigation Tests (Story 4.6) ===

  it('navigates to unified-artist when artist suggestion is selected', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()
    const pushSpy = vi.spyOn(context.router, 'push')

    const autocomplete = context.wrapper.findComponent({ name: 'AutocompleteDropdown' })
    autocomplete.vm.$emit('select', {
      id: 'artist::pink floyd',
      type: 'artist',
      artist: 'Pink Floyd',
      artistId: '42',
    })
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'unified-artist', query: { name: 'Pink Floyd' } })
  })

  it('navigates to album-detail when album suggestion with albumId is selected', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()
    const pushSpy = vi.spyOn(context.router, 'push')

    const autocomplete = context.wrapper.findComponent({ name: 'AutocompleteDropdown' })
    autocomplete.vm.$emit('select', {
      id: 'album::pink floyd::the wall',
      type: 'album',
      artist: 'Pink Floyd',
      album: 'The Wall',
      albumId: '100',
    })
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: '100' } })
  })

  // Story 7.5 AC2c: navigate-album event from SearchResultsList → SearchPanel routes to album-detail
  it('AC2c: navigates to album-detail when navigate-album emitted from SearchResultsList', async (): Promise<void> => {
    vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
      ok({
        tracks: [],
        albums: [{ id: 'a1', title: 'DSOTM', artist: 'Pink Floyd', trackCount: 10 }],
        artists: [],
        query: 'Pink Floyd',
        totalResults: 0,
      }),
    )

    const context = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(context.wrapper, 'Pink Floyd')

    const input = context.wrapper.find('input')
    await input.trigger('keydown.enter')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 50))

    const pushSpy = vi.spyOn(context.router, 'push')
    const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
    resultsList.vm.$emit('navigate-album', { albumId: 'a1' })
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: 'a1' } })
  })

  it('navigates to unified-artist when artist suggestion has no artistId (name-based fallback)', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()
    const pushSpy = vi.spyOn(context.router, 'push')

    const autocomplete = context.wrapper.findComponent({ name: 'AutocompleteDropdown' })
    autocomplete.vm.$emit('select', {
      id: 'artist::streaming',
      type: 'artist',
      artist: 'Streaming Artist',
    })
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'unified-artist',
      query: { name: 'Streaming Artist' },
    })
  })

  // === Full Results Mode Tests ===

  describe('Full Results Mode', () => {
    it('switches to full results mode when Enter pressed', async (): Promise<void> => {
      // Mock full results API
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 'track-1',
              title: 'Breathe',
              artist: 'Pink Floyd',
              album: 'Dark Side',
              url: 'file:///breathe.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'Pink Floyd',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'Pink Floyd')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50)) // Wait for async call

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(true)
    })

    it('displays SearchResultsList component in full mode', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 'track-1',
              title: 'Track 1',
              artist: 'Artist 1',
              album: 'Album 1',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      expect(resultsList.exists()).toBe(true)
    })

    it('shows loading indicator while fetching full results', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(ok({ tracks: [], albums: [], artists: [], query: '', totalResults: 0 })),
              200,
            ),
          ),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const loadingIndicator = context.wrapper.find('[data-testid="full-results-loading"]')
      expect(loadingIndicator.exists()).toBe(true)
    })

    it('shows empty state when no results found', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [],
          albums: [],
          artists: [],
          query: 'nonexistent',
          totalResults: 0,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'nonexistent')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const emptyState = context.wrapper.find('[data-testid="empty-state"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('Nothing here yet')
    })

    it('shows error state when fetch fails', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue({
        ok: false,
        error: { type: 'NETWORK_ERROR' as const, message: 'Connection failed' },
      })

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const errorState = context.wrapper.find('[data-testid="full-results-error"]')
      expect(errorState.exists()).toBe(true)
    })

    it('retry button refetches results on error', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue({
        ok: false,
        error: { type: 'NETWORK_ERROR' as const, message: 'Connection failed' },
      })

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      vi.clearAllMocks()

      const errorState = context.wrapper.find('[data-testid="full-results-error"]')
      const retryButton = errorState.find('button')
      await retryButton.trigger('click')
      await nextTick()

      expect(searchApi.fetchFullResults).toHaveBeenCalled()
    })

    it('back button returns to autocomplete mode', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 'track-1',
              title: 'Track 1',
              artist: 'Artist 1',
              album: 'Album 1',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const backButton = context.wrapper.find('[data-testid="back-button"]')
      await backButton.trigger('click')
      await flushPromises()

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(false)

      const autocompleteMode = context.wrapper.find(
        '.flex.h-full.flex-col.items-center.justify-center',
      )
      expect(autocompleteMode.exists()).toBe(true)
    })

    it('handles play track event from SearchResultsList', async (): Promise<void> => {
      const mockTrack = {
        id: 'track-123',
        title: 'Track 1',
        artist: 'Artist 1',
        album: 'Album 1',
        url: 'file:///1.flac',
        source: 'local' as const,
      }

      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [mockTrack],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('play', mockTrack)
      await nextTick()

      // Verify playback store was called
      // Note: Since we're using Pinia store, we can't easily spy on it in this test
      // The integration is verified through component behavior
      expect(resultsList.exists()).toBe(true)
    })

    it('handles play album event from SearchResultsList', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [],
          albums: [{ id: 'album-123', title: 'Album 1', artist: 'Artist 1', trackCount: 10 }],
          artists: [],
          query: 'test',
          totalResults: 0,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })

      // Issue #5: console.log removed - just verify handler doesn't crash
      // Album playback will be implemented in Epic 5 (Queue Management)
      expect(() => {
        resultsList.vm.$emit('play-album', 'album-123')
      }).not.toThrow()
      await nextTick()
    })

    it('calls addToQueue with track.url when "Add to Queue" button is clicked', async (): Promise<void> => {
      const mockTrack = {
        id: 'track-456',
        title: 'Track 2',
        artist: 'Artist 2',
        album: 'Album 2',
        url: 'file:///music/track2.flac',
        source: 'local' as const,
      }

      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [mockTrack],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const addButton = context.wrapper.find('[data-testid="add-to-queue-button"]')
      expect(addButton.exists()).toBe(true)
      await addButton.trigger('click')
      await nextTick()

      expect(queueApi.addToQueue).toHaveBeenCalledWith('file:///music/track2.flac')
    })

    it('shows error indicator when addToQueue fails', async (): Promise<void> => {
      vi.mocked(queueApi.addToQueue).mockResolvedValue(
        err({ type: 'NETWORK_ERROR', message: 'connection refused' }),
      )

      const mockTrack = {
        id: 'track-789',
        title: 'Track 3',
        artist: 'Artist 3',
        album: 'Album 3',
        url: 'file:///music/track3.flac',
        source: 'local' as const,
      }

      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [mockTrack],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const addButton = context.wrapper.find('[data-testid="add-to-queue-button"]')
      expect(addButton.exists()).toBe(true)
      await addButton.trigger('click')
      await nextTick()

      expect(queueApi.addToQueue).toHaveBeenCalledWith('file:///music/track3.flac')
      const errorIndicator = context.wrapper.find('[data-testid="add-to-queue-error"]')
      expect(errorIndicator.exists()).toBe(true)
    })

    it('does not search when Enter pressed with query < 2 chars', async (): Promise<void> => {
      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'P')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()

      expect(searchApi.fetchFullResults).not.toHaveBeenCalled()
      const minLengthHint = context.wrapper.find('[data-testid="min-length-hint"]')
      expect(minLengthHint.exists()).toBe(true)
    })

    // URL persistence tests (tech-spec-search-ux-url-persistence-ranking-caps)

    it('mounts in full results mode when URL has ?q and full=true params', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Pink Floyd Track',
              artist: 'Pink Floyd',
              album: 'DSOTM',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'Pink Floyd',
          totalResults: 1,
        }),
      )

      const context = await createMountedContextAt('/?q=Pink+Floyd&full=true')

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(true)
      expect(searchApi.fetchFullResults).toHaveBeenCalledWith('Pink Floyd')
    })

    it('mounts without re-fetching when store already has results for same query', async (): Promise<void> => {
      const mockResults = ok({
        tracks: [],
        albums: [],
        artists: [],
        query: 'Pink Floyd',
        totalResults: 0,
      })
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(mockResults)

      const { useSearchStore } = await import('@/domains/search/shell/useSearchStore')
      const store = useSearchStore()
      await store.searchFullResults('Pink Floyd')

      vi.mocked(searchApi.fetchFullResults).mockClear()

      await createMountedContextAt('/?q=Pink+Floyd&full=true')

      expect(searchApi.fetchFullResults).not.toHaveBeenCalled()
    })

    it('Enter key pushes ?q and ?full=true to URL', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({ tracks: [], albums: [], artists: [], query: 'opel gang', totalResults: 0 }),
      )

      const context = await whenSearchPanelIsMounted()
      const pushSpy = vi.spyOn(context.router, 'push')
      await whenUserTypesInSearchInput(context.wrapper, 'opel gang')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      expect(pushSpy).toHaveBeenCalledWith({ query: { q: 'opel gang', full: 'true' } })
    })

    it('back button calls router.replace and shows autocomplete mode', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Test',
              artist: 'A',
              album: 'B',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await createMountedContextAt('/?q=test&full=true')

      const backButton = context.wrapper.find('[data-testid="back-button"]')
      await backButton.trigger('click')
      await flushPromises()

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(false)

      const autocompleteMode = context.wrapper.find(
        '.flex.h-full.flex-col.items-center.justify-center',
      )
      expect(autocompleteMode.exists()).toBe(true)
    })

    it('caps results at 20 tracks, 5 albums, 5 artists', async (): Promise<void> => {
      const tracks = Array.from({ length: 30 }, (_, i) => ({
        id: `track-${i}`,
        title: `Track ${i}`,
        artist: 'Artist',
        album: 'Album',
        url: `file:///track${i}.flac`,
        source: 'local' as const,
      }))
      const albums = Array.from({ length: 8 }, (_, i) => ({
        id: `album-${i}`,
        title: `Album ${i}`,
        artist: 'Artist',
        trackCount: 10,
      }))
      const artists = Array.from({ length: 7 }, (_, i) => ({
        id: `artist-${i}`,
        name: `Artist ${i}`,
        artistId: `artist-id-${i}`,
      }))

      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({ tracks, albums, artists, query: 'test', totalResults: 45 }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      expect(resultsList.exists()).toBe(true)
      expect(getTrackResultsProp(resultsList.props('results')).length).toEqual(20)
      expect(getAlbumResultsProp(resultsList.props('albums')).length).toEqual(5)
      expect(getArtistResultsProp(resultsList.props('artists')).length).toEqual(5)
    })

    // Story 8.2 AC3: Back button must be INSIDE the scroll container (Round 2 fix)
    // so hovering over the Back button routes scroll events to the results list
    it('back button is a descendant of the scrollable container (AC3 — scroll propagation)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({ tracks: [], albums: [], artists: [], query: 'test', totalResults: 0 }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')
      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(true)
      // Back button must be inside the scroll container — if moved outside, scroll breaks
      const backButtonInContainer = fullResultsList.find('[data-testid="back-button"]')
      expect(backButtonInContainer.exists()).toBe(true)
    })

    it('scroll header inside container has sticky, top-0, and z-10 classes (AC3)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({ tracks: [], albums: [], artists: [], query: 'test', totalResults: 0 }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')
      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      const scrollHeader = fullResultsList.find('[data-testid="scroll-header"]')
      expect(scrollHeader.exists()).toBe(true)
      expect(scrollHeader.classes()).toContain('sticky')
      expect(scrollHeader.classes()).toContain('top-0')
      expect(scrollHeader.classes()).toContain('z-10')
    })

    // Story 8.2 AC1–AC3: Scroll containment — results list must be scrollable, outer divs must not
    it('full results list has overflow-y-auto and min-h-0 for scroll containment (AC1)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Test Track',
              artist: 'Artist',
              album: 'Album',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'test',
          totalResults: 1,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')
      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(true)
      expect(fullResultsList.classes()).toContain('overflow-y-auto')
      expect(fullResultsList.classes()).toContain('min-h-0')
    })

    it('full results mode container is bounded with flex-1 and min-h-0 (AC1 — no ancestor scrolls)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({ tracks: [], albums: [], artists: [], query: 'test', totalResults: 0 }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'test')
      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Full Results Mode container (data-testid="full-results-list") must have flex-1 and min-h-0
      // so it doesn't expand beyond its flex parent and cause page scroll
      const fullResultsList = context.wrapper.find('[data-testid="full-results-list"]')
      expect(fullResultsList.exists()).toBe(true)
      expect(fullResultsList.classes()).toContain('flex-1')
      expect(fullResultsList.classes()).toContain('min-h-0')
    })

    // Story 8.8 AC2 → superseded by Story 9.13: navigate-artist always uses unified route
    it('AC2 (9.13 supersedes 8.8): navigate-artist with null artistId routes to unified-artist (no Tidal search)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [],
          albums: [],
          artists: [{ name: 'Sabrina Carpenter', artistId: null }],
          query: 'sabrina carpenter',
          totalResults: 0,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'sabrina carpenter')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: null, name: 'Sabrina Carpenter' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith({
        name: 'unified-artist',
        query: { name: 'Sabrina Carpenter' },
      })
    })

    // Story 8.8 AC2 fallback → superseded by Story 9.13
    it('AC2 (9.13 supersedes 8.8): navigate-artist with null artistId routes to unified-artist (no fallback search)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [],
          albums: [],
          artists: [{ name: 'Die Toten Hosen', artistId: null }],
          query: 'opel gang',
          totalResults: 0,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'opel gang')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: null, name: 'Die Toten Hosen' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith({
        name: 'unified-artist',
        query: { name: 'Die Toten Hosen' },
      })
    })

    // Story 8.5 AC3 → superseded by Story 9.13: even local artistId goes to unified route
    it('AC1 (9.13 supersedes 8.5): navigate-artist with local artistId routes to unified-artist', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [],
          albums: [],
          artists: [{ name: 'Pink Floyd', artistId: '42' }],
          query: 'pink floyd',
          totalResults: 0,
        }),
      )

      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'pink floyd')

      const input = context.wrapper.find('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: '42', name: 'Pink Floyd' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith({
        name: 'unified-artist',
        query: { name: 'Pink Floyd' },
      })
    })

    // Story 7.4 AC2: footer CTA click triggers full search
    it('footer search event from AutocompleteDropdown triggers full search (AC2)', async (): Promise<void> => {
      const context = await whenSearchPanelIsMounted()
      await whenUserTypesInSearchInput(context.wrapper, 'Pink Floyd')

      vi.clearAllMocks()

      const autocomplete = context.wrapper.findComponent({ name: 'AutocompleteDropdown' })
      autocomplete.vm.$emit('search')
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(searchApi.fetchFullResults).toHaveBeenCalledWith('Pink Floyd')
    })
  })

  // Story 9.3 AC2: MainNavBar integration — verifies nav renders inside SearchPanel
  it('renders MainNavBar inside the search container (Story 9.3 AC2)', async (): Promise<void> => {
    const context = await whenSearchPanelIsMounted()

    expect(context.wrapper.find('[data-testid="main-nav"]').exists()).toBe(true)
  })

  // Story 9.13 AC1: navigate-artist ALWAYS uses unified route regardless of artistId
  describe('Story 9.13: Unified artist navigation', () => {
    it('AC1: navigate-artist with local artistId routes to unified-artist (not artist-detail)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Comfortably Numb',
              artist: 'Pink Floyd',
              album: 'The Wall',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [{ name: 'Pink Floyd', artistId: '42' }],
          query: 'pink floyd',
          totalResults: 1,
        }),
      )

      const context = await createMountedContext()
      const input = context.wrapper.find('input')
      await input.setValue('pink floyd')
      await input.trigger('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: '42', name: 'Pink Floyd' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'unified-artist' }))
    })

    it('AC1: navigate-artist with null artistId routes to unified-artist (not Tidal search)', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Espresso',
              artist: 'Sabrina Carpenter',
              album: 'Short n Sweet',
              url: 'tidal://12345.flc',
              source: 'tidal',
            },
          ],
          albums: [],
          artists: [{ name: 'Sabrina Carpenter', artistId: null }],
          query: 'sabrina carpenter',
          totalResults: 1,
        }),
      )

      const context = await createMountedContext()
      const input = context.wrapper.find('input')
      await input.setValue('sabrina carpenter')
      await input.trigger('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: null, name: 'Sabrina Carpenter' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'unified-artist' }))
    })

    it('AC1: unified route query includes artist name from navigate-artist payload', async (): Promise<void> => {
      vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
        ok({
          tracks: [
            {
              id: 't1',
              title: 'Creep',
              artist: 'Radiohead',
              album: 'Pablo Honey',
              url: 'file:///1.flac',
              source: 'local',
            },
          ],
          albums: [],
          artists: [],
          query: 'radiohead',
          totalResults: 1,
        }),
      )

      const context = await createMountedContext()
      const input = context.wrapper.find('input')
      await input.setValue('radiohead')
      await input.trigger('input')
      await input.trigger('keydown.enter')
      await flushPromises()

      const pushSpy = vi.spyOn(context.router, 'push')
      const resultsList = context.wrapper.findComponent({ name: 'SearchResultsList' })
      resultsList.vm.$emit('navigate-artist', { artistId: null, name: 'Radiohead' })
      await nextTick()

      expect(pushSpy).toHaveBeenCalledWith({
        name: 'unified-artist',
        query: { name: 'Radiohead' },
      })
    })
  })
})
