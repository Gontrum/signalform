/**
 * Translated visible text in the now-playing panel: the error banner's dismiss
 * button and the source tooltip on the quality badge.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this panel has been set up. Setting it before mounting would let a
 * label read once during setup pass.
 *
 * Own file because NowPlayingPanel.test.ts is already 34 KB. Mirrors
 * NowPlayingPanel.playerConnectivity.test.ts's mocking approach.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import { __resetWebSocketForTests } from '@/app/useWebSocket'
import type { Language } from '@/types/i18n'

type PlaybackStore = ReturnType<
  typeof import('@/domains/playback/shell/usePlaybackStore').usePlaybackStore
>

const isPhone = ref(false)
const mockSleepRemaining = ref(0)
const mockSleepIsActive = ref(false)
const mockHasLastFmSession = ref(false)
const mockIsLoved = ref(false)

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

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

vi.mock('@/domains/playback/shell/useLoveTrack', () => ({
  useLoveTrack: (): {
    readonly hasLastFmSession: typeof mockHasLastFmSession
    readonly isLoved: typeof mockIsLoved
    readonly isLoving: ReturnType<typeof ref<boolean>>
    readonly toggleLove: ReturnType<typeof vi.fn>
  } => ({
    hasLastFmSession: mockHasLastFmSession,
    isLoved: mockIsLoved,
    isLoving: ref(false),
    toggleLove: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/domains/playback/shell/useSleepTimer', () => ({
  useSleepTimer: (): {
    readonly remainingSeconds: typeof mockSleepRemaining
    readonly isActive: typeof mockSleepIsActive
    readonly refresh: ReturnType<typeof vi.fn>
    readonly setTimer: ReturnType<typeof vi.fn>
    readonly cancel: ReturnType<typeof vi.fn>
  } => ({
    remainingSeconds: mockSleepRemaining,
    isActive: mockSleepIsActive,
    refresh: vi.fn().mockResolvedValue(undefined),
    setTimer: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  }),
}))

const getPlaybackStore = async (): Promise<PlaybackStore> => {
  const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
  return usePlaybackStore()
}

const mountPanel = async (): Promise<VueWrapper> => {
  setupTestEnv()

  const router = await createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
    { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
    { path: '/queue', name: 'queue', component: { template: '<div />' } },
  ])

  const wrapper = mount(NowPlayingPanel, { global: { plugins: [router] } })
  await flushPromises()
  await nextTick()
  return wrapper
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const mountWithError = async (): Promise<VueWrapper> => {
  const wrapper = await mountPanel()
  const store = await getPlaybackStore()
  store.$patch({ error: 'LMS unreachable' })
  await nextTick()

  return wrapper
}

const dismissLabel = (wrapper: VueWrapper): string =>
  wrapper.find('[data-testid="playback-error"]').find('button').text()

const mountWithSource = async (source: 'local' | 'qobuz' | 'tidal'): Promise<VueWrapper> => {
  const wrapper = await mountPanel()
  const store = await getPlaybackStore()
  await store.play({
    id: '1',
    title: 'Breathe',
    artist: 'Pink Floyd',
    album: 'Dark Side of the Moon',
    url: 'file:///music/breathe.flac',
    source,
  })
  await nextTick()

  return wrapper
}

const sourceTooltip = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[data-testid="source-info"]').find('span[title]').attributes('title')

describe('NowPlayingPanel — translated visible text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetWebSocketForTests()
    isPhone.value = false
    mockSleepRemaining.value = 0
    mockSleepIsActive.value = false
  })

  it('labels the error dismiss button in English', async () => {
    expect(dismissLabel(await mountWithError())).toBe('Dismiss')
  })

  it('labels the error dismiss button in German', async () => {
    const wrapper = await mountWithError()

    await switchTo('de')

    expect(dismissLabel(wrapper)).toBe('Ausblenden')
  })

  it('describes the local source in English', async () => {
    expect(sourceTooltip(await mountWithSource('local'))).toBe('Playing from Local library')
  })

  it('describes the local source in German', async () => {
    const wrapper = await mountWithSource('local')

    await switchTo('de')

    expect(sourceTooltip(wrapper)).toBe('Wird aus der lokalen Bibliothek abgespielt')
  })

  // Each panel is switched on its own: `setupTestEnv` installs a fresh Pinia
  // per mount, so only the most recently mounted one sees a later change.
  it('keeps the streaming provider name while translating the sentence around it', async () => {
    const qobuz = await mountWithSource('qobuz')
    expect(sourceTooltip(qobuz)).toBe('Streaming from Qobuz')

    await switchTo('de')
    expect(sourceTooltip(qobuz)).toBe('Wird von Qobuz gestreamt')

    const tidal = await mountWithSource('tidal')
    await switchTo('de')
    expect(sourceTooltip(tidal)).toBe('Wird von Tidal gestreamt')
  })
})

const queuedTrack = {
  id: '9',
  title: 'Time',
  artist: 'Pink Floyd',
  album: 'Dark Side of the Moon',
  url: 'file:///music/time.flac',
  source: 'local' as const,
}

const mountPlaying = async (): Promise<VueWrapper> => {
  const wrapper = await mountPanel()
  const store = await getPlaybackStore()
  await store.play({
    id: '1',
    title: 'Breathe',
    artist: 'Pink Floyd',
    album: 'Dark Side of the Moon',
    albumId: '42',
    url: 'file:///music/breathe.flac',
    source: 'local',
  })
  await nextTick()
  return wrapper
}

const ariaLabelOf = (wrapper: VueWrapper, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('aria-label')

describe('NowPlayingPanel — translated accessible names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetWebSocketForTests()
    isPhone.value = false
    mockSleepRemaining.value = 0
    mockSleepIsActive.value = false
    mockHasLastFmSession.value = false
    mockIsLoved.value = false
  })

  it('names the region and both navigation buttons in English', async () => {
    const wrapper = await mountPlaying()

    expect(wrapper.find('[role="region"]').attributes('aria-label')).toBe('Now Playing')
    expect(ariaLabelOf(wrapper, 'track-artist')).toBe('Go to Pink Floyd page')
    expect(ariaLabelOf(wrapper, 'track-album')).toBe('Go to Dark Side of the Moon page')
  })

  it('names the region and both navigation buttons in German', async () => {
    const wrapper = await mountPlaying()

    await switchTo('de')

    expect(wrapper.find('[role="region"]').attributes('aria-label')).toBe('Läuft gerade')
    expect(ariaLabelOf(wrapper, 'track-artist')).toBe('Zur Seite von Pink Floyd')
    expect(ariaLabelOf(wrapper, 'track-album')).toBe('Zum Album Dark Side of the Moon')
  })

  it('names the queue preview in both languages', async () => {
    const wrapper = await mountPlaying()
    expect(ariaLabelOf(wrapper, 'queue-preview')).toBe('Upcoming tracks')

    await switchTo('de')

    expect(ariaLabelOf(wrapper, 'queue-preview')).toBe('Kommende Titel')
  })

  it('offers the opposite action per love state in English', async () => {
    mockHasLastFmSession.value = true

    const wrapper = await mountPlaying()
    expect(ariaLabelOf(wrapper, 'love-button')).toBe('Love track on Last.fm')

    mockIsLoved.value = true
    await nextTick()

    expect(ariaLabelOf(wrapper, 'love-button')).toBe('Unlove track on Last.fm')
  })

  it('offers the opposite action per love state in German, keeping the service name', async () => {
    mockHasLastFmSession.value = true

    const wrapper = await mountPlaying()

    await switchTo('de')
    expect(ariaLabelOf(wrapper, 'love-button')).toBe('Titel auf Last.fm liken')

    mockIsLoved.value = true
    await nextTick()

    expect(ariaLabelOf(wrapper, 'love-button')).toBe('Like auf Last.fm entfernen')
  })

  it('names the empty-state queue block in both languages', async () => {
    const wrapper = await mountPanel()
    ;(await getPlaybackStore()).$patch({ queuePreview: [queuedTrack] })
    await nextTick()
    expect(ariaLabelOf(wrapper, 'queued-empty-state')).toBe('Queued tracks')

    await switchTo('de')

    expect(ariaLabelOf(wrapper, 'queued-empty-state')).toBe('Titel in der Warteschlange')
  })
})
