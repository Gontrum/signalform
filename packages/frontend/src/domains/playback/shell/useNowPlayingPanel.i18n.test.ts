/**
 * useNowPlayingPanel — the aria-live track announcement, in both languages.
 *
 * The switch-after-mount case is the load-bearing one: the composable hands a
 * translator into the core function, and any implementation that resolves the
 * sentence once at mount passes the two static cases and fails this one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Language } from '@/types/i18n'
import type { TrackInfo } from '@/domains/playback/core/types'

const { mockOn, mockSubscribe, mockOnReconnect } = vi.hoisted(() => ({
  mockOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockOnReconnect: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', async () => {
  const { mockPlaybackApiModule } = await import('@/test-utils')
  return mockPlaybackApiModule()
})

vi.mock('@/app/useWebSocket', async () => {
  const { ref: createRef } = await import('vue')
  return {
    useWebSocket: (): {
      readonly on: typeof mockOn
      readonly subscribe: typeof mockSubscribe
      readonly onReconnect: typeof mockOnReconnect
      readonly connectionState: ReturnType<typeof ref<string>>
    } => ({
      on: mockOn,
      subscribe: mockSubscribe,
      onReconnect: mockOnReconnect,
      connectionState: createRef('connected'),
    }),
  }
})

import { useNowPlayingPanel } from './useNowPlayingPanel'
import { usePlaybackStore } from './usePlaybackStore'

const Harness = defineComponent({
  setup() {
    const { trackAnnouncement } = useNowPlayingPanel()
    return { trackAnnouncement }
  },
  template: '<p data-testid="track-announcement">{{ trackAnnouncement }}</p>',
})

const makeTrack = (title: string, artist: string): TrackInfo => ({
  id: '1',
  title,
  artist,
  album: 'The Dark Side of the Moon',
  url: 'file:///music/track.flac',
})

const mountHarness = async (language: Language): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const router = await createTestRouter([{ path: '/', component: { template: '<div />' } }])
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const announcementFor = async (
  language: Language,
  track: TrackInfo,
): Promise<string | undefined> => {
  const wrapper = await mountHarness(language)
  usePlaybackStore().$patch({ currentTrack: track })
  await nextTick()

  return wrapper.find('[data-testid="track-announcement"]').text()
}

describe('useNowPlayingPanel — translated track announcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('announces the running track in English', async () => {
    expect(await announcementFor('en', makeTrack('Breathe', 'Pink Floyd'))).toBe(
      'Now playing: Breathe by Pink Floyd',
    )
  })

  it('announces the running track in German', async () => {
    expect(await announcementFor('de', makeTrack('Breathe', 'Pink Floyd'))).toBe(
      'Läuft jetzt: Breathe von Pink Floyd',
    )
  })

  // Title and artist fill different placeholders; swapping them still reads
  // like a sentence, so pick a fixture where the swap is visible.
  it('does not swap the title and the artist', async () => {
    expect(await announcementFor('de', makeTrack('Pink Floyd', 'Breathe'))).toBe(
      'Läuft jetzt: Pink Floyd von Breathe',
    )
  })

  it('follows a language switch made after mount', async () => {
    const i18nStore = setupTestEnv()
    const router = await createTestRouter([{ path: '/', component: { template: '<div />' } }])
    const wrapper = mount(Harness, { global: { plugins: [router] } })
    await flushPromises()

    usePlaybackStore().$patch({ currentTrack: makeTrack('Time', 'Pink Floyd') })
    await nextTick()
    expect(wrapper.find('[data-testid="track-announcement"]').text()).toBe(
      'Now playing: Time by Pink Floyd',
    )

    i18nStore.setLanguage('de')
    await nextTick()

    expect(wrapper.find('[data-testid="track-announcement"]').text()).toBe(
      'Läuft jetzt: Time von Pink Floyd',
    )
  })
})
