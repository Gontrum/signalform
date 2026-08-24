/**
 * SearchPanel — empty-state vs. tags-only results.
 *
 * A query that matches only a tag (e.g. "qsound") returns empty
 * tracks/albums/artists arrays but a non-empty tags array. The empty state
 * must not swallow that case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import SearchPanel from './SearchPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import * as searchApi from '@/platform/api/searchApi'
import { ok } from '@signalform/shared'

const isPhone = ref(false)
const isDesktop = ref(true)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: typeof isDesktop
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop,
  }),
}))

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(okResult(null)) }
})

vi.mock('@/platform/api/searchApi', async () => {
  const { ok: okResult } = await import('@signalform/shared')
  return {
    searchTracks: vi.fn().mockResolvedValue(
      okResult({
        results: [],
        query: '',
        totalCount: 0,
      }),
    ),
    fetchAutocomplete: vi.fn().mockResolvedValue(
      okResult({
        suggestions: [],
        query: '',
      }),
    ),
    fetchFullResults: vi.fn().mockResolvedValue(
      okResult({
        tracks: [],
        albums: [],
        artists: [],
        query: '',
        tags: [],
        totalResults: 0,
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

const { mockGetConfig, mockStartLovedRadio, mockStartPersonalRadio } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockStartLovedRadio: vi.fn(),
  mockStartPersonalRadio: vi.fn(),
}))

vi.mock('@/platform/api/configApi', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('@/platform/api/lovedRadioApi', () => ({
  startLovedRadio: mockStartLovedRadio,
}))

vi.mock('@/platform/api/personalRadioApi', () => ({
  startPersonalRadio: mockStartPersonalRadio,
}))

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
  ])
}

const whenSearchPanelIsMounted = async (): Promise<VueWrapper> => {
  const router = await createRouter()
  const wrapper = mount(SearchPanel, { global: { plugins: [router] } })
  await nextTick()
  return wrapper
}

const whenUserTypesInSearchInput = async (wrapper: VueWrapper, query: string): Promise<void> => {
  const input = wrapper.find('input')
  await input.setValue(query)
  await input.trigger('input')
  await nextTick()
}

const whenUserSubmitsSearch = async (wrapper: VueWrapper): Promise<void> => {
  const input = wrapper.find('input')
  await input.trigger('keydown.enter')
  await nextTick()
  await flushPromises()
}

describe('SearchPanel — tags-only results and empty state', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue(ok({ personalRadioEnabled: false }))
    mockStartLovedRadio.mockResolvedValue({ tracksAdded: 1 })
    mockStartPersonalRadio.mockResolvedValue({ tracksAdded: 1, seedArtists: [] })
    isPhone.value = false
    isDesktop.value = true
  })

  it('shows the tags section instead of the empty state when only tags matched', async (): Promise<void> => {
    vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
      ok({
        tracks: [],
        albums: [],
        artists: [],
        tags: [{ query: 'qsound', displayName: 'QSound', albumCount: 3 }],
        query: 'qsound',
        totalResults: 0,
      }),
    )

    const wrapper = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(wrapper, 'qsound')
    await whenUserSubmitsSearch(wrapper)

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-results"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('QSound')
  })

  it('still shows the empty state when tracks, albums, artists and tags are all empty', async (): Promise<void> => {
    vi.mocked(searchApi.fetchFullResults).mockResolvedValue(
      ok({
        tracks: [],
        albums: [],
        artists: [],
        tags: [],
        query: 'nonexistent',
        totalResults: 0,
      }),
    )

    const wrapper = await whenSearchPanelIsMounted()
    await whenUserTypesInSearchInput(wrapper, 'nonexistent')
    await whenUserSubmitsSearch(wrapper)

    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(true)
    expect(emptyState.text()).toContain('Nothing here yet')
    expect(wrapper.find('[data-testid="tag-results"]').exists()).toBe(false)
  })
})
