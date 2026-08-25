import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import type { Router } from 'vue-router'
import { ok } from '@signalform/shared'
import SearchPanel from './SearchPanel.vue'
import * as searchApi from '@/platform/api/searchApi'
import { setupTestEnv, createTestRouter } from '@/test-utils'

const isPhone = ref(false)
const isDesktop = ref(true)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: typeof isDesktop
  } => ({ isPhone, isTablet: ref(false), isDesktop }),
}))

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(okResult(null)) }
})

vi.mock('@/platform/api/searchApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return {
    searchTracks: vi.fn().mockResolvedValue(okResult({ results: [], query: '', totalCount: 0 })),
    fetchAutocomplete: vi.fn().mockResolvedValue(okResult({ suggestions: [], query: '' })),
    fetchFullResults: vi.fn().mockResolvedValue(
      okResult({
        tracks: [
          {
            id: '1',
            title: 'So What',
            artist: 'Miles Davis',
            album: 'Kind of Blue',
            url: 'file:///so-what.flac',
            duration: 545,
            source: 'local',
          },
        ],
        albums: [],
        artists: [],
        tags: [],
        query: 'miles',
        totalResults: 1,
      }),
    ),
  }
})

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(okResult(undefined)),
    playAlbum: vi.fn().mockResolvedValue(okResult(undefined)),
    setVolume: vi.fn().mockResolvedValue(okResult(undefined)),
    getVolume: vi.fn().mockResolvedValue(okResult(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        okResult({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

vi.mock('@/platform/api/queueApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return {
    addToQueue: vi.fn().mockResolvedValue(okResult(undefined)),
    jumpToTrack: vi.fn().mockResolvedValue(okResult(undefined)),
    getQueue: vi.fn().mockResolvedValue(okResult([])),
  }
})

const { mockGetConfig, mockGetTagAlbumsPage, mockResolveAlbum } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockGetTagAlbumsPage: vi.fn(),
  mockResolveAlbum: vi.fn(),
}))

vi.mock('@/platform/api/configApi', () => ({ getConfig: mockGetConfig }))
vi.mock('@/platform/api/tagsApi', () => ({ getTagAlbumsPage: mockGetTagAlbumsPage }))
vi.mock('@/platform/api/tidalAlbumsApi', () => ({ resolveAlbum: mockResolveAlbum }))

type MountedPanel = {
  readonly wrapper: VueWrapper
  readonly pushSpy: MockInstance<Router['push']>
}

const mountPanel = async (initialPath: string): Promise<MountedPanel> => {
  const router = await createTestRouter(
    [
      { path: '/', name: 'home', component: SearchPanel },
      { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    ],
    initialPath,
  )
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(SearchPanel, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, pushSpy }
}

const inputFollowsChipRow = (wrapper: VueWrapper): boolean => {
  const chipRow = wrapper.get('[data-testid="tag-chip-row"]').element
  const input = wrapper.get('[data-testid="search-input"]').element

  return (chipRow.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('SearchPanel — tag filter', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue(ok({ personalRadioEnabled: false }))
    mockResolveAlbum.mockResolvedValue(ok({ albumId: null }))
    mockGetTagAlbumsPage.mockResolvedValue(
      ok({
        albums: [
          {
            artist: 'Pink Floyd',
            title: 'Wish You Were Here',
            year: 1975,
            coverArtUrl: '/api/playback/cover?src=pink-floyd',
            source: 'tidal',
          },
        ],
        hasMore: false,
        totalCandidates: 1,
      }),
    )
    isPhone.value = false
    isDesktop.value = true
  })

  it('shows the chip row on the untouched home screen', async () => {
    const { wrapper } = await mountPanel('/')

    expect(wrapper.find('[data-testid="tag-chip-row"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('renders the search results and no tag grid while no tag is set', async () => {
    const { wrapper } = await mountPanel('/?q=miles&full=true')

    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
    expect(mockGetTagAlbumsPage).not.toHaveBeenCalled()
  })

  it('renders the tag grid and no search results while a tag is set', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd&full=true')

    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-album-title"]').text()).toBe('Wish You Were Here')
    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('sacd', '', 0, 12)
  })

  it('replaces the search results with the tag grid narrowed by the text', async () => {
    const { wrapper } = await mountPanel('/?q=miles&tag=sacd&full=true')

    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(false)
    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('sacd', 'miles', 0, 12)
  })

  it('keeps the current text when a chip is selected', async () => {
    const { wrapper, pushSpy } = await mountPanel('/?q=miles&full=true')

    await wrapper.get('[data-testid="tag-chip-sacd"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ query: { q: 'miles', full: 'true', tag: 'sacd' } })
  })

  it('keeps the current text and drops the tag when the active chip is cleared', async () => {
    const { wrapper, pushSpy } = await mountPanel('/?q=miles&tag=sacd&full=true')

    expect(wrapper.get('[data-testid="tag-chip-sacd"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-testid="tag-chip-sacd"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ query: { q: 'miles', full: 'true' } })
  })

  it('selects a tag from the untouched home screen without inventing a text', async () => {
    const { wrapper, pushSpy } = await mountPanel('/')

    await wrapper.get('[data-testid="tag-chip-qsound"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ query: { tag: 'qsound', full: 'true' } })
  })

  it('carries text typed but not submitted into the chip route', async () => {
    const { wrapper, pushSpy } = await mountPanel('/')

    await wrapper.get('[data-testid="search-input"]').setValue('sting')
    await wrapper.get('[data-testid="tag-chip-sacd"]').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith({ query: { q: 'sting', tag: 'sacd', full: 'true' } })
  })

  it('offers the search header and the way back while only a tag is set', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd')

    expect(wrapper.find('[data-testid="scroll-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="back-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="genre-radio-from-search-button"]').exists()).toBe(false)
  })

  it('offers genre radio for the text a tag search is narrowed by', async () => {
    const { wrapper } = await mountPanel('/?q=miles&tag=sacd&full=true')

    expect(wrapper.get('[data-testid="genre-radio-from-search-button"]').text()).toContain(
      '"miles"',
    )
  })

  it('does not search LMS while a tag is active', async () => {
    await mountPanel('/?q=miles&tag=sacd&full=true')

    expect(searchApi.fetchFullResults).not.toHaveBeenCalled()
    expect(mockGetTagAlbumsPage).toHaveBeenCalledWith('sacd', 'miles', 0, 12)
  })

  it('searches LMS once the active chip is cleared', async () => {
    const { wrapper } = await mountPanel('/?q=miles&tag=sacd&full=true')

    await wrapper.get('[data-testid="tag-chip-sacd"]').trigger('click')
    await flushPromises()

    expect(searchApi.fetchFullResults).toHaveBeenCalledTimes(1)
    expect(searchApi.fetchFullResults).toHaveBeenCalledWith('miles')
    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(false)
  })

  it('puts the chip row ahead of the search input on the entry screen', async () => {
    const { wrapper } = await mountPanel('/')

    expect(inputFollowsChipRow(wrapper)).toBe(true)
  })

  it('puts the chip row ahead of the search input over the search results', async () => {
    const { wrapper } = await mountPanel('/?q=miles&full=true')

    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(true)
    expect(inputFollowsChipRow(wrapper)).toBe(true)
  })

  it('puts the chip row ahead of the search input over the tag grid', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd&full=true')

    expect(wrapper.find('[data-testid="tag-albums-grid"]').exists()).toBe(true)
    expect(inputFollowsChipRow(wrapper)).toBe(true)
  })

  it('offers the search input while only a tag is set', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd&full=true')

    const input = wrapper.find<HTMLInputElement>('[data-testid="search-input"]')
    expect(input.element.value).toBe('')
    expect(input.attributes('placeholder')).toBe('Search albums, artists or tracks…')
  })

  it('offers the search input carrying the text a tag search is narrowed by', async () => {
    const { wrapper } = await mountPanel('/?q=miles&tag=sacd&full=true')

    const input = wrapper.find<HTMLInputElement>('[data-testid="search-input"]')
    expect(input.element.value).toBe('miles')
  })

  it('keeps the active tag when text is submitted from the tag grid', async () => {
    const { wrapper, pushSpy } = await mountPanel('/?tag=sacd&full=true')

    const input = wrapper.get('[data-testid="search-input"]')
    await input.setValue('miles')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledWith({ query: { q: 'miles', tag: 'sacd', full: 'true' } })
    expect(mockGetTagAlbumsPage).toHaveBeenLastCalledWith('sacd', 'miles', 0, 12)
    expect(searchApi.fetchFullResults).not.toHaveBeenCalled()
  })

  it('opens the autocomplete over the results while the user types', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd&full=true')

    await wrapper.get('[data-testid="search-input"]').setValue('mi')

    expect(wrapper.find('[data-testid="autocomplete-dropdown"]').exists()).toBe(true)
  })

  it('leaves no autocomplete dropdown over the results', async () => {
    const { wrapper } = await mountPanel('/?tag=sacd&full=true')

    expect(wrapper.find('[data-testid="autocomplete-dropdown"]').exists()).toBe(false)

    const input = wrapper.get('[data-testid="search-input"]')
    await input.setValue('miles')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.find('[data-testid="autocomplete-dropdown"]').exists()).toBe(false)
  })
})
