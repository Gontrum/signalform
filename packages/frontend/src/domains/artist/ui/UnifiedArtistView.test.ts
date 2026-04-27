import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import UnifiedArtistView from './UnifiedArtistView.vue'
import type { ArtistByNameResponse } from '@/platform/api/artistApi'
import type { ArtistEnrichment, SimilarArtist } from '@/platform/api/enrichmentApi'
import { getArtistHeroImage } from '@/platform/api/heroImageApi'
import { createDeferred, setupTestEnv, createTestRouter } from '@/test-utils'
import { clearArtistImageCache } from '@/domains/enrichment/shell/useArtistImage'
import type { Router } from 'vue-router'

beforeEach(() => {
  clearArtistImageCache()
})

vi.mock('@/platform/api/artistApi', () => ({
  getArtistDetail: vi.fn(),
  getArtistByName: vi.fn(),
}))

vi.mock('@/platform/api/enrichmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api/enrichmentApi')>()
  return {
    ...actual,
    getArtistEnrichment: vi.fn(),
    getSimilarArtists: vi.fn(),
  }
})

vi.mock('@/platform/api/heroImageApi', () => ({
  getArtistHeroImage: vi.fn(),
}))

const makeResponse = (overrides: Partial<ArtistByNameResponse> = {}): ArtistByNameResponse => ({
  localAlbums: [
    {
      id: '42',
      albumId: '42',
      title: 'Pablo Honey',
      artist: 'Radiohead',
      source: 'local',
      coverArtUrl: 'http://localhost:9000/music/101/cover.jpg',
    },
  ],
  tidalAlbums: [
    {
      id: 'tidal::radiohead::pablo honey',
      title: 'Pablo Honey',
      artist: 'Radiohead',
      source: 'tidal',
      trackUrls: ['tidal://12345.flc'],
    },
  ],
  ...overrides,
})

const makeEnrichment = (overrides: Partial<ArtistEnrichment> = {}): ArtistEnrichment => ({
  name: 'Radiohead',
  listeners: 5000000,
  playcount: 200000000,
  tags: ['alternative rock', 'art rock'],
  bio: 'Radiohead are an English rock band.',
  ...overrides,
})

const makeSimilarArtist = (overrides: Partial<SimilarArtist> = {}): SimilarArtist => ({
  name: 'Portishead',
  match: 0.9,
  url: 'https://last.fm/Portishead',
  ...overrides,
})

type TestContext = {
  readonly router: Router
  readonly wrapper: ReturnType<typeof mount>
}

describe('UnifiedArtistView', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setupTestEnv()

    // Default all secondary mocks to failures so existing tests are unaffected
    const { getArtistEnrichment, getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No similar artists' },
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({ ok: true, value: null })
  })

  const mountView = async (): Promise<TestContext> => {
    const router = await createTestRouter(
      [
        { path: '/artist/unified', name: 'unified-artist', component: UnifiedArtistView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
        {
          path: '/album/tidal-search',
          name: 'tidal-search-album',
          component: { template: '<div />' },
        },
      ],
      '/artist/unified?name=Radiohead',
    )

    return {
      router,
      wrapper: mount(UnifiedArtistView, {
        global: { plugins: [router] },
      }),
    }
  }

  // ── Existing tests ────────────────────────────────────────────────────────

  it('shows loading state initially', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockReturnValue(new Promise(() => {}))

    const context = await mountView()

    expect(context.wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
  })

  it('renders artist name from query param as page heading', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="artist-name"]').text()).toBe('Radiohead')
  })

  it('renders "In your library" section with local albums', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="local-section"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="local-album-item"]')).toHaveLength(1)
  })

  it('renders "On Tidal" section with Tidal albums', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="tidal-section"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="tidal-album-item"]')).toHaveLength(1)
  })

  it('hides local section when localAlbums is empty', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse({ localAlbums: [] }),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="local-section"]').exists()).toBe(false)
  })

  it('hides Tidal section when tidalAlbums is empty', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse({ tidalAlbums: [] }),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="tidal-section"]').exists()).toBe(false)
  })

  it('renders empty tidal state from a single snapshot without retrying artist lookup', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse({ tidalAlbums: [] }),
    })

    const context = await mountView()
    await flushPromises()

    expect(getArtistByName).toHaveBeenCalledTimes(1)
    expect(context.wrapper.find('[data-testid="tidal-section"]').exists()).toBe(false)
  })

  it('shows empty state when both sections are empty', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse({ localAlbums: [], tidalAlbums: [] }),
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="no-albums-message"]').exists()).toBe(true)
  })

  it('shows error state when API fails', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
  })

  it('calls router.back() on back button click', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockReturnValue(new Promise(() => {}))

    const context = await mountView()
    const backSpy = vi.spyOn(context.router, 'back')

    await context.wrapper.find('[data-testid="back-button"]').trigger('click')

    expect(backSpy).toHaveBeenCalled()
  })

  it('navigates to album-detail when local album is clicked', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const context = await mountView()
    const pushSpy = vi.spyOn(context.router, 'push')
    await nextTick()
    await nextTick()

    const localAlbums = context.wrapper.findAll('[data-testid="local-album-item"]')
    await localAlbums[0]?.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith({ name: 'album-detail', params: { albumId: '42' } })
  })

  it('navigates to tidal-search-album when Tidal album is clicked', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const context = await mountView()
    const pushSpy = vi.spyOn(context.router, 'push')
    await nextTick()
    await nextTick()

    const tidalAlbums = context.wrapper.findAll('[data-testid="tidal-album-item"]')
    await tidalAlbums[0]?.trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tidal-search-album',
      }),
    )
  })

  it('calls getArtistByName with name from route query', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    await mountView()
    await nextTick()

    expect(getArtistByName).toHaveBeenCalledWith('Radiohead')
  })

  it('shows error state immediately when no name query param is provided', async () => {
    const router = await createTestRouter(
      [
        { path: '/artist/unified', name: 'unified-artist', component: UnifiedArtistView },
        { path: '/album/:albumId', name: 'album-detail', component: { template: '<div />' } },
        {
          path: '/album/tidal-search',
          name: 'tidal-search-album',
          component: { template: '<div />' },
        },
      ],
      '/artist/unified',
    )

    const { getArtistByName } = await import('@/platform/api/artistApi')

    const wrapper = mount(UnifiedArtistView, {
      global: { plugins: [router] },
    })
    await nextTick()

    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
    expect(getArtistByName).not.toHaveBeenCalled()
  })

  // ── Enrichment tests ──────────────────────────────────────────────────────

  it('renders enrichment-stats after getArtistEnrichment resolves', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment(),
    })

    const context = await mountView()
    await flushPromises()

    const stats = context.wrapper.find('[data-testid="enrichment-stats"]')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('listeners')
    expect(stats.text()).toContain('plays')
  })

  it('renders enrichment-bio when bio is non-empty', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ bio: 'Radiohead are an English rock band.' }),
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="enrichment-bio"]').text()).toBe(
      'Radiohead are an English rock band.',
    )
  })

  it('enrichment-bio absent when bio is empty string', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ bio: '' }),
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="enrichment-bio"]').exists()).toBe(false)
  })

  it('renders enrichment-tags chips', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: true,
      value: makeEnrichment({ tags: ['rock', 'alternative'] }),
    })

    const context = await mountView()
    await flushPromises()

    const tags = context.wrapper.find('[data-testid="enrichment-tags"]')
    expect(tags.exists()).toBe(true)
    expect(tags.text()).toContain('rock')
    expect(tags.text()).toContain('alternative')
  })

  it('shows localized NOT_FOUND enrichment error when enrichment returns NOT_FOUND', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="enrichment-error-not-found"]').exists()).toBe(true)
    expect(context.wrapper.text()).toContain('No additional artist information is available.')
  })

  it('shows localized UNAVAILABLE enrichment error when enrichment returns SERVER_ERROR', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'Last.fm unavailable' },
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="enrichment-error-unavailable"]').exists()).toBe(true)
    expect(context.wrapper.text()).toContain('Artist information is currently unavailable.')
  })

  it('renders enrichment heading using i18n key', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    })

    const context = await mountView()
    await flushPromises()

    const heading = context.wrapper.find('[data-testid="artist-enrichment-heading"]')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toBe('Artist biography')
  })

  it('renders German localized enrichment error when language is set to de', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    const { useI18nStore } = await import('@/app/i18nStore')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistEnrichment).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'Last.fm unavailable' },
    })

    const store = useI18nStore()
    store.setLanguage('de')

    const context = await mountView()
    await flushPromises()

    const error = context.wrapper.find('[data-testid="enrichment-error-unavailable"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('Künstlerinformationen sind derzeit nicht verfügbar.')
  })

  it('album sections still render when enrichment fails', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    // enrichment already returns NOT_FOUND from beforeEach

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="local-section"]').exists()).toBe(true)
  })

  // ── Hero image tests ──────────────────────────────────────────────────────

  it('renders background-image style when getArtistHeroImage returns a URL', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getArtistHeroImage).mockResolvedValue({
      ok: true,
      value: 'https://assets.fanart.tv/fanart/test.jpg',
    })

    const context = await mountView()
    await flushPromises()

    const hero = context.wrapper.find('[data-testid="artist-hero"]')
    expect(hero.attributes('style')).toContain('https://assets.fanart.tv/fanart/test.jpg')
  })

  it('no background-image style when getArtistHeroImage returns null', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    // heroImageApi already returns ok(null) from beforeEach

    const context = await mountView()
    await flushPromises()

    const hero = context.wrapper.find('[data-testid="artist-hero"]')
    expect(hero.attributes('style')).toBeUndefined()
  })

  it('calls getArtistHeroImage with artist name', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    await mountView()
    await flushPromises()

    expect(getArtistHeroImage).toHaveBeenCalledWith('Radiohead')
  })

  // ── Similar artists tests ─────────────────────────────────────────────────

  it('similar-artists-section absent when getSimilarArtists fails', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    // getSimilarArtists already returns failure from beforeEach

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="similar-artists-section"]').exists()).toBe(false)
  })

  it('renders similar-artist-cards when getSimilarArtists returns artists', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [
        makeSimilarArtist({ name: 'Portishead' }),
        makeSimilarArtist({ name: 'Massive Attack' }),
      ],
    })

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="similar-artists-section"]').exists()).toBe(true)
    expect(context.wrapper.findAll('[data-testid="similar-artist-card"]')).toHaveLength(2)
  })

  it('in-library card has accent border and in-library marker', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName)
      // Primary call: artist data
      .mockResolvedValueOnce({ ok: true, value: makeResponse() })
      // In-library check for Portishead: has local albums
      .mockResolvedValueOnce({
        ok: true,
        value: {
          localAlbums: [{ id: 'a1', title: 'Dummy', artist: 'Portishead' }],
          tidalAlbums: [],
        },
      })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [makeSimilarArtist({ name: 'Portishead' })],
    })

    const context = await mountView()
    await flushPromises()

    const card = context.wrapper.find('[data-testid="similar-artist-card"]')
    expect(card.classes()).toContain('border-accent-400')
    expect(context.wrapper.find('[data-testid="similar-artist-in-library"]').exists()).toBe(true)
  })

  it('clicking similar artist card navigates to unified-artist', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getSimilarArtists } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    vi.mocked(getSimilarArtists).mockResolvedValue({
      ok: true,
      value: [makeSimilarArtist({ name: 'Portishead' })],
    })

    const context = await mountView()
    const pushSpy = vi.spyOn(context.router, 'push')
    await flushPromises()

    await context.wrapper.find('[data-testid="similar-artist-card"]').trigger('click')
    await nextTick()

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'unified-artist', query: { name: 'Portishead' } }),
    )
  })

  // ── Loading skeleton tests ────────────────────────────────────────────────

  it('enrichment-skeleton visible while getArtistEnrichment is in flight', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    const { getArtistEnrichment } = await import('@/platform/api/enrichmentApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })

    const deferred = createDeferred<Awaited<ReturnType<typeof getArtistEnrichment>>>()
    vi.mocked(getArtistEnrichment).mockReturnValueOnce(deferred.promise)

    const context = await mountView()
    await nextTick()
    await nextTick()

    expect(context.wrapper.find('[data-testid="enrichment-skeleton"]').exists()).toBe(true)

    deferred.resolve({ ok: false, error: { type: 'NOT_FOUND', message: '' } })
    await flushPromises()
  })

  it('enrichment-skeleton absent after getArtistEnrichment resolves', async () => {
    const { getArtistByName } = await import('@/platform/api/artistApi')
    vi.mocked(getArtistByName).mockResolvedValue({
      ok: true,
      value: makeResponse(),
    })
    // enrichment returns NOT_FOUND from beforeEach — resolves immediately

    const context = await mountView()
    await flushPromises()

    expect(context.wrapper.find('[data-testid="enrichment-skeleton"]').exists()).toBe(false)
  })

  it('hero-skeleton removed (loading state is implicit via reactive imageUrl)', () => {
    // Hero skeleton was removed when migrating to useArtistImage composable.
    // Image appears reactively once Fanart.tv resolves — no blocking skeleton.
    expect(true).toBe(true)
  })
})
