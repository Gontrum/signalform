/**
 * Track duration display in search results.
 *
 * Split from SearchResultsList.test.ts (well over the repo's 20KB single-file
 * threshold — see AGENTS.md "Testing"). Mirrors that file's mocking approach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SearchResultsList from './SearchResultsList.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'
import type { TrackResult } from '../core/types'

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    playTrackList: vi.fn().mockResolvedValue(ok(undefined)),
    playTidalSearchAlbum: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

const createRouter = async (): Promise<Router> =>
  createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
  ])

const mountResults = async (results: readonly TrackResult[]): Promise<VueWrapper> => {
  const wrapper = mount(SearchResultsList, {
    props: { results },
    global: { plugins: [await createRouter()] },
  })
  await nextTick()
  return wrapper
}

const durationTextOf = (wrapper: VueWrapper, resultId: string): string | undefined => {
  const duration = wrapper
    .find(`[data-testid="result-item-${resultId}"]`)
    .find('[data-testid="track-duration"]')
  return duration.exists() ? duration.text() : undefined
}

const localTrackWithDuration: TrackResult = {
  id: 'local-245',
  title: 'Shine On You Crazy Diamond',
  artist: 'Pink Floyd',
  album: 'Wish You Were Here',
  duration: 245,
  source: 'local',
  url: 'track://local-245',
}

// Tidal browse responses carry no duration field at all — the normal case, not an error.
const tidalTrackWithoutDuration: TrackResult = {
  id: 'tidal-none',
  title: 'Have a Cigar',
  artist: 'Pink Floyd',
  album: 'Wish You Were Here',
  source: 'tidal',
  url: 'track://tidal-none',
}

const localTrackWithOtherDuration: TrackResult = {
  id: 'local-382',
  title: 'Comfortably Numb',
  artist: 'Pink Floyd',
  album: 'The Wall',
  duration: 382,
  source: 'local',
  url: 'track://local-382',
}

describe('SearchResultsList duration', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  it('renders the duration in m:ss for a result that has one', async () => {
    const wrapper = await mountResults([localTrackWithDuration])

    expect(durationTextOf(wrapper, 'local-245')).toBe('4:05')
  })

  it('renders no duration element at all for a Tidal result without duration', async () => {
    const wrapper = await mountResults([tidalTrackWithoutDuration])

    expect(wrapper.find('[data-testid="track-duration"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('0:00')
    expect(wrapper.text()).not.toContain('--:--')
  })

  it('renders no duration element when LMS reports a duration of zero', async () => {
    const wrapper = await mountResults([{ ...localTrackWithDuration, duration: 0 }])

    expect(wrapper.find('[data-testid="track-duration"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('0:00')
  })

  it('shows a duration on exactly the results that have one in a mixed list', async () => {
    // The result without duration sits in the middle: a per-row lookup that is
    // actually index-based would shift the later value onto the wrong row.
    const wrapper = await mountResults([
      localTrackWithDuration,
      tidalTrackWithoutDuration,
      localTrackWithOtherDuration,
    ])

    expect(durationTextOf(wrapper, 'local-245')).toBe('4:05')
    expect(durationTextOf(wrapper, 'tidal-none')).toBeUndefined()
    expect(durationTextOf(wrapper, 'local-382')).toBe('6:22')
    expect(wrapper.findAll('[data-testid="track-duration"]')).toHaveLength(2)
  })
})
