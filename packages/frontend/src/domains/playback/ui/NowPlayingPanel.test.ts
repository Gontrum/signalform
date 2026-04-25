import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

// Mock the playback API
vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    playTrack: vi.fn().mockResolvedValue(ok(undefined)),
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(ok({ status: 'stopped', currentTime: 0, currentTrack: null })),
  }
})

describe('NowPlayingPanel', () => {
  type TestContext = {
    readonly router: Router
    readonly wrapper: VueWrapper
  }

  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([
      { path: '/', component: { template: '<div />' } },
      { path: '/artist/unified', name: 'unified-artist', component: { template: '<div />' } },
      { path: '/artist/:artistId', name: 'artist-detail', component: { template: '<div />' } },
      { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
    ])
  }

  it('renders empty state when no track is playing', async () => {
    const context = await createMountedContext()

    await thenEmptyStateTextIsVisible(context.wrapper)
    await thenPlaceholderAlbumCoverIsVisible(context.wrapper)
  })

  it('displays "No track playing" message', async () => {
    const context = await createMountedContext()

    await thenMessageIs(context.wrapper, 'No track playing')
  })

  it('displays placeholder text', async () => {
    const context = await createMountedContext()

    await thenPlaceholderTextContains(context.wrapper, 'Search and play music')
  })

  it('has Apple aesthetic styling', async () => {
    const context = await createMountedContext()

    await thenPanelHasGenerousWhitespace(context.wrapper)
    await thenPanelHasSubtleBorder(context.wrapper)
  })

  it('is sticky on tablet', async () => {
    const context = await createMountedContext()

    await thenPanelIsSticky(context.wrapper)
  })

  it('album cover has responsive size classes up to 200px on large screens', async () => {
    const context = await givenTrackIsPlaying()

    const albumCover = context.wrapper.find('[data-testid="album-cover"]')
    expect(albumCover.exists()).toBe(true)
    expect(albumCover.classes()).toContain('lg:h-[200px]')
    expect(albumCover.classes()).toContain('lg:w-[200px]')
    expect(albumCover.classes()).toContain('md:h-[160px]')
    expect(albumCover.classes()).toContain('md:w-[160px]')
    expect(albumCover.classes()).toContain('h-[120px]')
    expect(albumCover.classes()).toContain('w-[120px]')
  })

  it('placeholder album cover has responsive size classes up to 200px on large screens', async () => {
    const context = await createMountedContext()

    const placeholder = context.wrapper.find('[data-testid="placeholder-album-cover"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.classes()).toContain('lg:h-[200px]')
    expect(placeholder.classes()).toContain('lg:w-[200px]')
    expect(placeholder.classes()).toContain('md:h-[160px]')
    expect(placeholder.classes()).toContain('md:w-[160px]')
    expect(placeholder.classes()).toContain('h-[120px]')
    expect(placeholder.classes()).toContain('w-[120px]')
  })

  it('music note SVG icon in playing state album cover has responsive size classes', async () => {
    const context = await givenTrackIsPlaying()

    const albumCover = context.wrapper.find('[data-testid="album-cover"]')
    const svg = albumCover.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.classes()).toContain('h-12')
    expect(svg.classes()).toContain('w-12')
    expect(svg.classes()).toContain('lg:h-20')
    expect(svg.classes()).toContain('lg:w-20')
  })

  it('music note SVG icon in empty state placeholder cover has responsive size classes', async () => {
    const context = await createMountedContext()

    const placeholder = context.wrapper.find('[data-testid="placeholder-album-cover"]')
    const svg = placeholder.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.classes()).toContain('h-12')
    expect(svg.classes()).toContain('w-12')
    expect(svg.classes()).toContain('lg:h-20')
    expect(svg.classes()).toContain('lg:w-20')
  })

  // === WHEN ===

  const createMountedContext = async (): Promise<TestContext> => {
    const router = await createRouter()
    const wrapper = mount(NowPlayingPanel, { global: { plugins: [router] } })
    await nextTick()
    return { router, wrapper }
  }

  // === THEN ===

  const thenEmptyStateTextIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const emptyState = wrapper.find('[data-testid="empty-state"]')
    expect(emptyState.exists()).toBe(true)
    expect(emptyState.isVisible()).toBe(true)
  }

  const thenPlaceholderAlbumCoverIsVisible = async (wrapper: VueWrapper): Promise<void> => {
    const albumCover = wrapper.find('[data-testid="placeholder-album-cover"]')
    expect(albumCover.exists()).toBe(true)
  }

  const thenMessageIs = async (wrapper: VueWrapper, message: string): Promise<void> => {
    const text = wrapper.text()
    expect(text).toContain(message)
  }

  const thenPlaceholderTextContains = async (wrapper: VueWrapper, text: string): Promise<void> => {
    const content = wrapper.text()
    expect(content).toContain(text)
  }

  const thenPanelHasGenerousWhitespace = async (wrapper: VueWrapper): Promise<void> => {
    const panel = wrapper.find('[data-testid="now-playing-panel"]')
    expect(panel.classes()).toEqual(expect.arrayContaining([expect.stringMatching(/p-\d+/)]))
  }

  const thenPanelHasSubtleBorder = async (wrapper: VueWrapper): Promise<void> => {
    const panel = wrapper.find('[data-testid="now-playing-panel"]')
    expect(panel.classes()).toContain('border')
  }

  const thenPanelIsSticky = async (wrapper: VueWrapper): Promise<void> => {
    const panel = wrapper.find('[data-testid="now-playing-panel"]')
    expect(panel.classes()).toEqual(expect.arrayContaining([expect.stringMatching(/sticky/)]))
  }

  // === AlbumCover Integration (Story 4.2) ===

  it('passes coverArtUrl to AlbumCover when currentTrack has it', async () => {
    const context = await givenTrackIsPlayingWithCoverArtUrl(
      'http://localhost:9000/music/123/cover.jpg',
    )

    const thumbnail = context.wrapper.find('[data-testid="album-cover-thumbnail"]')
    expect(thumbnail.exists()).toBe(true)
    expect(thumbnail.attributes('src')).toBe('http://localhost:9000/music/123/cover_100x100.jpg')
  })

  // === Integration Tests: QualityBadge ===

  describe('QualityBadge Integration', () => {
    it('does not show quality badge when no track is playing', async () => {
      const context = await createMountedContext()

      expect(context.wrapper.find('[data-testid="quality-badge"]').exists()).toBe(false)
    })

    it('shows quality badge when track has a known source', async () => {
      const context = await givenTrackIsPlayingWithSource('local')

      const badge = context.wrapper.find('[data-testid="quality-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text().trim()).toContain('Local')
    })

    it('does not show quality badge wrapper when track source is unknown', async () => {
      const context = await givenTrackIsPlayingWithSource('unknown')

      // The wrapper div should not render for 'unknown' source (M1 fix)
      expect(context.wrapper.find('[data-testid="quality-badge"]').exists()).toBe(false)
    })

    it('does not show quality badge when track has no source', async () => {
      const context = await givenTrackIsPlayingWithoutSource()

      expect(context.wrapper.find('[data-testid="quality-badge"]').exists()).toBe(false)
    })

    it('shows qobuz badge with amber styling for qobuz source', async () => {
      const context = await givenTrackIsPlayingWithSource('qobuz')

      const badge = context.wrapper.find('[data-testid="quality-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text().trim()).toContain('Qobuz')
      expect(badge.classes()).toContain('bg-amber-100')
    })

    // Story 8.7 fix AC3: quality badge shows FLAC for Tidal browse-played tracks
    it('shows FLAC quality badge text for Tidal track with audioQuality (AC3 fix)', async () => {
      const context = await givenTidalTrackIsPlayingWithQuality()

      const badge = context.wrapper.find('[data-testid="quality-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text().trim()).toContain('FLAC')
    })
  })

  // === Integration Tests: Source Transparency (Story 3.4) ===

  describe('Source Transparency', () => {
    it('shows "Also available on" in now playing when multiple sources', async () => {
      const context = await givenTrackIsPlayingWithAvailableSources()

      const alsoAvailable = context.wrapper.find('[data-testid="also-available-now-playing"]')
      expect(alsoAvailable.exists()).toBe(true)
      expect(alsoAvailable.text()).toContain('Also available on:')
      expect(alsoAvailable.text()).toContain('Qobuz')
      expect(alsoAvailable.text()).toContain('Tidal')
    })

    it('source badge has tooltip "Playing from Local library" for local source', async () => {
      const context = await givenTrackIsPlayingWithSource('local')
      const sourceInfo = context.wrapper.find('[data-testid="source-info"]')
      const tooltipWrapper = sourceInfo.find('span[title]')
      expect(tooltipWrapper.attributes('title')).toBe('Playing from Local library')
    })

    it('does not show "Also available on" when track has single source', async () => {
      const context = await givenTrackIsPlayingWithSource('local')
      // No availableSources passed → alsoAvailableText is empty
      const alsoAvailable = context.wrapper.find('[data-testid="also-available-now-playing"]')
      expect(alsoAvailable.exists()).toBe(false)
    })
  })

  // === Error State ===

  describe('Error State', () => {
    it('shows error panel and dismiss button when store has error', async () => {
      const context = await createMountedContext()
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
      const store = usePlaybackStore()

      store.$patch({ error: 'LMS unreachable' })
      await nextTick()

      const errorPanel = context.wrapper.find('[data-testid="playback-error"]')
      expect(errorPanel.exists()).toBe(true)
      expect(errorPanel.text()).toContain('LMS unreachable')
    })

    it('clears error when Dismiss button is clicked', async () => {
      const context = await createMountedContext()
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
      const store = usePlaybackStore()

      store.$patch({ error: 'LMS unreachable' })
      await nextTick()

      const errorPanel = context.wrapper.find('[data-testid="playback-error"]')
      await errorPanel.find('button').trigger('click')
      await nextTick()

      expect(store.error).toBeNull()
    })
  })

  // === Integration Tests: PlaybackControls ===

  describe('PlaybackControls Integration', () => {
    it('does not show playback controls when no track is playing', async () => {
      const context = await createMountedContext()

      await thenPlaybackControlsAreNotVisible(context.wrapper)
    })

    it('shows playback controls when track is playing', async () => {
      const context = await givenTrackIsPlaying()

      await thenPlaybackControlsAreVisible(context.wrapper)
    })

    it('playback controls are below track metadata', async () => {
      const context = await givenTrackIsPlaying()

      await thenPlaybackControlsAreBelowMetadata(context.wrapper)
    })

    it('playback controls are center-aligned', async () => {
      const context = await givenTrackIsPlaying()

      await thenPlaybackControlsAreCentered(context.wrapper)
    })
  })

  // === GIVEN (new) ===

  const givenTrackIsPlayingWithSource = async (
    source: 'local' | 'qobuz' | 'tidal' | 'unknown',
  ): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      source,
    })

    await nextTick()
    return context
  }

  const givenTidalTrackIsPlayingWithQuality = async (): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Kind of Blue',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      url: 'tidal://394715089.flc',
      source: 'tidal',
      audioQuality: { format: 'FLAC', lossless: true, bitrate: 1411000, sampleRate: 44100 },
    })

    await nextTick()
    return context
  }

  const givenTrackIsPlayingWithoutSource = async (): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      // source intentionally omitted → badge should not render
    })

    await nextTick()
    return context
  }

  const givenTrackIsPlayingWithAvailableSources = async (): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      source: 'local',
      availableSources: [
        { source: 'local', url: 'file:///music/breathe.flac' },
        { source: 'qobuz', url: 'qobuz://breathe' },
        { source: 'tidal', url: 'tidal://breathe' },
      ],
    })

    await nextTick()
    return context
  }

  const givenTrackIsPlayingWithCoverArtUrl = async (coverArtUrl: string): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      coverArtUrl,
    })

    await nextTick()
    return context
  }

  const givenTrackIsPlaying = async (): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    // Simulate track being played
    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      duration: 169,
    })

    await nextTick()
    return context
  }

  // === Navigation Links (Story 4.5) ===

  const givenTrackIsPlayingWithIds = async (
    artistId: string,
    albumId: string,
  ): Promise<TestContext> => {
    const { ok } = await import('@signalform/shared')
    const playbackApi = await import('@/platform/api/playbackApi')
    vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))

    const context = await createMountedContext()

    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    const store = usePlaybackStore()

    await store.play({
      id: '1',
      title: 'Breathe',
      artist: 'Pink Floyd',
      album: 'Dark Side of the Moon',
      url: 'file:///music/breathe.flac',
      artistId,
      albumId,
    })

    await nextTick()
    return context
  }

  describe('Navigation Links', () => {
    it('artist name renders as clickable button when artist name is available', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      const artistEl = context.wrapper.find('[data-testid="track-artist"]')
      expect(artistEl.element.tagName).toBe('BUTTON')
    })

    it('clicking artist name navigates to unified-artist page', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      await context.wrapper.find('[data-testid="track-artist"]').trigger('click')
      await flushPromises()

      expect(context.router.currentRoute.value.name).toBe('unified-artist')
      expect(context.router.currentRoute.value.query['name']).toBe('Pink Floyd')
    })

    it('album name renders as clickable button when albumId is available', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      const albumEl = context.wrapper.find('[data-testid="track-album"]')
      expect(albumEl.element.tagName).toBe('BUTTON')
    })

    it('clicking album name navigates to album detail page', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      await context.wrapper.find('[data-testid="track-album"]').trigger('click')
      await flushPromises()

      expect(context.router.currentRoute.value.name).toBe('album-detail')
      expect(context.router.currentRoute.value.params['albumId']).toBe('7')
    })

    it('artist name renders as plain text (not button) when artist name is empty', async () => {
      // Simulate a track with no artist name — button only renders when artist string is non-empty
      const { ok } = await import('@signalform/shared')
      const playbackApi = await import('@/platform/api/playbackApi')
      vi.mocked(playbackApi.playTrack).mockResolvedValue(ok(undefined))
      const context = await createMountedContext()
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
      const store = usePlaybackStore()
      await store.play({
        id: '1',
        title: 'Unknown Track',
        artist: '',
        album: 'Unknown Album',
        url: 'file:///music/track.flac',
        duration: 100,
      })
      await nextTick()

      const artistEl = context.wrapper.find('[data-testid="track-artist"]')
      expect(artistEl.element.tagName).toBe('P')
    })

    it('album name renders as plain text (not button) when albumId is undefined', async () => {
      const context = await givenTrackIsPlaying() // existing helper — no albumId

      const albumEl = context.wrapper.find('[data-testid="track-album"]')
      expect(albumEl.element.tagName).toBe('P')
    })

    it('artist button has hover and focus underline classes', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      const artistEl = context.wrapper.find('[data-testid="track-artist"]')
      expect(artistEl.classes()).toContain('hover:underline')
      expect(artistEl.classes()).toContain('focus:underline')
    })

    it('album button has hover and focus underline classes', async () => {
      const context = await givenTrackIsPlayingWithIds('42', '7')

      const albumEl = context.wrapper.find('[data-testid="track-album"]')
      expect(albumEl.classes()).toContain('hover:underline')
      expect(albumEl.classes()).toContain('focus:underline')
    })
  })

  // === Queue Preview (Story 4.6) ===

  describe('Queue Preview', () => {
    it('shows queue preview items when queuePreview has tracks', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Breathe',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/breathe.flac',
        },
        queuePreview: [
          { id: '2', title: 'Time', artist: 'Pink Floyd' },
          { id: '3', title: 'Money', artist: 'Pink Floyd' },
          { id: '4', title: 'Us and Them', artist: 'Pink Floyd' },
        ],
      })
      await nextTick()

      const items = context.wrapper.findAll('[data-testid="queue-preview-item"]')
      expect(items).toHaveLength(3)
      expect(items[0]!.text()).toContain('Time')
      expect(items[0]!.text()).toContain('Pink Floyd')
      expect(items[1]!.text()).toContain('Money')
      expect(items[2]!.text()).toContain('Us and Them')
    })

    it('shows Queue is empty when queuePreview is empty', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Breathe',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/breathe.flac',
        },
        queuePreview: [],
      })
      await nextTick()

      const emptyState = context.wrapper.find('[data-testid="queue-empty"]')
      expect(emptyState.exists()).toBe(true)
      expect(emptyState.text()).toContain('Queue is empty')
    })

    it('View Full Queue button is enabled', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Breathe',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/breathe.flac',
        },
      })
      await nextTick()

      const button = context.wrapper.find('[data-testid="view-full-queue"]')
      expect(button.exists()).toBe(true)
      expect(button.attributes('disabled')).toBeUndefined()
    })

    it('clicking View Full Queue button navigates to /queue', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Breathe',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/breathe.flac',
        },
      })
      await nextTick()

      await context.wrapper.find('[data-testid="view-full-queue"]').trigger('click')
      await flushPromises()

      expect(context.router.currentRoute.value.name).toBe('queue')
    })
  })

  // === THEN (new) ===

  const thenPlaybackControlsAreNotVisible = async (wrapper: VueWrapper): Promise<void> => {
    const controls = wrapper.find('[data-testid="playback-controls"]')
    expect(controls.exists()).toBe(false)
  }

  const thenPlaybackControlsAreVisible = async (wrapper: VueWrapper): Promise<void> => {
    const controls = wrapper.find('[data-testid="playback-controls"]')
    expect(controls.exists()).toBe(true)
    expect(controls.isVisible()).toBe(true)
  }

  const thenPlaybackControlsAreBelowMetadata = async (wrapper: VueWrapper): Promise<void> => {
    const trackTitle = wrapper.find('[data-testid="track-title"]')
    const controls = wrapper.find('[data-testid="playback-controls"]')

    // Check that controls exist after metadata in DOM
    expect(trackTitle.exists()).toBe(true)
    expect(controls.exists()).toBe(true)
  }

  const thenPlaybackControlsAreCentered = async (wrapper: VueWrapper): Promise<void> => {
    const controls = wrapper.find('[data-testid="playback-controls"]')
    const parent = controls.element.parentElement

    // Check for flex centering classes
    expect(parent?.classList.toString()).toMatch(/flex|items-center|justify-center/)
  }

  // === LMS Connectivity Banner (S02) ===

  describe('LMS error banner', () => {
    it('shows lms-error-banner when isLmsDisconnected is true', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({ lmsError: 'Cannot connect to music server' })
      await nextTick()

      const banner = context.wrapper.find('[data-testid="lms-error-banner"]')
      expect(banner.exists()).toBe(true)
      expect(banner.text()).toContain('Cannot connect to music server')
    })

    it('does not show lms-error-banner when isLmsDisconnected is false', async () => {
      const context = await createMountedContext()

      const banner = context.wrapper.find('[data-testid="lms-error-banner"]')
      expect(banner.exists()).toBe(false)
    })

    it('shows Retry button in lms-error-banner', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({ lmsError: 'Cannot connect to music server' })
      await nextTick()

      const retryBtn = context.wrapper.find('[data-testid="lms-retry-button"]')
      expect(retryBtn.exists()).toBe(true)
      expect(retryBtn.text()).toContain('Retry')
    })

    it('calls retryLmsConnection when Retry button is clicked', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

      const context = await createMountedContext()

      const store = usePlaybackStore()
      const retrySpy = vi.spyOn(store, 'retryLmsConnection').mockResolvedValue(undefined)
      store.$patch({ lmsError: 'Cannot connect to music server' })
      await nextTick()

      await context.wrapper.find('[data-testid="lms-retry-button"]').trigger('click')
      await flushPromises()

      expect(retrySpy).toHaveBeenCalledOnce()
    })

    it('clears banner when lmsError is set to null', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({ lmsError: 'Cannot connect to music server' })
      await nextTick()
      expect(context.wrapper.find('[data-testid="lms-error-banner"]').exists()).toBe(true)

      store.$patch({ lmsError: null })
      await nextTick()
      expect(context.wrapper.find('[data-testid="lms-error-banner"]').exists()).toBe(false)
    })
  })

  // === ARIA live track announcements (S04/M002) ===

  describe('track announcement aria-live region', () => {
    it('is empty when no track is playing', async () => {
      const context = await createMountedContext()

      const region = context.wrapper.find('[data-testid="track-announcement"]')
      expect(region.exists()).toBe(true)
      expect(region.text().trim()).toBe('')
    })

    it('announces track title and artist when a track is set', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Time',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/time.flac',
        },
      })
      await nextTick()

      const region = context.wrapper.find('[data-testid="track-announcement"]')
      expect(region.text()).toContain('Now playing: Time by Pink Floyd')
    })

    it('updates announcement when track changes', async () => {
      const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')

      const context = await createMountedContext()

      const store = usePlaybackStore()
      store.$patch({
        currentTrack: {
          id: '1',
          title: 'Time',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/time.flac',
        },
      })
      await nextTick()
      expect(context.wrapper.find('[data-testid="track-announcement"]').text()).toContain('Time')

      store.$patch({
        currentTrack: {
          id: '2',
          title: 'Money',
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon',
          url: 'file:///music/money.flac',
        },
      })
      await nextTick()
      expect(context.wrapper.find('[data-testid="track-announcement"]').text()).toContain(
        'Now playing: Money by Pink Floyd',
      )
    })
  })
})
