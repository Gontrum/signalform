import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AlbumDetailView from './AlbumDetailView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

vi.mock('@/platform/api/albumApi', () => ({
  getAlbumDetail: vi.fn(),
}))

vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbumTracks: vi.fn(),
  getTidalAlbumDetail: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playTrack: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  playTidalSearchAlbum: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  getVolume: vi.fn().mockResolvedValue({ ok: true, value: 50 }),
  getPlaybackStatus: vi.fn().mockResolvedValue({
    ok: true,
    value: { status: 'stopped', currentTime: 0, currentTrack: null },
  }),
}))

vi.mock('@/platform/api/queueApi', () => ({
  addToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  addTidalSearchAlbumToQueue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
}))

vi.mock('@/platform/api/enrichmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api/enrichmentApi')>()
  return {
    ...actual,
    getAlbumEnrichment: vi.fn().mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'No enrichment' },
    }),
  }
})

describe('AlbumDetailView — Tidal album that Tidal does not have', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [{ path: '/album/:albumId', component: AlbumDetailView }],
      '/album/4.0',
    )
    window.history.replaceState({ ...window.history.state }, '')
    const wrapper = mount(AlbumDetailView, {
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  it('shows the not-found state when getTidalAlbumDetail reports NOT_FOUND', async () => {
    const { getTidalAlbumDetail } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumDetail).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'Tidal album detail fetch failed: HTTP 404' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="error-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(false)
  })

  it('names the missing album instead of blaming the server', async () => {
    const { getTidalAlbumDetail } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumDetail).mockResolvedValue({
      ok: false,
      error: { type: 'NOT_FOUND', message: 'Tidal album detail fetch failed: HTTP 404' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    const notFound = wrapper.find('[data-testid="error-not-found"]')
    expect(notFound.text()).toContain('Album not found')
    expect(notFound.text()).not.toContain('currently unavailable')
  })

  // The regression guard for the other direction: a broken Tidal must keep
  // showing the fault message, not the harmless "not found" one.
  it('keeps the server-error state when getTidalAlbumDetail reports SERVER_ERROR', async () => {
    const { getTidalAlbumDetail } = await import('@/platform/api/tidalAlbumsApi')
    vi.mocked(getTidalAlbumDetail).mockResolvedValue({
      ok: false,
      error: { type: 'SERVER_ERROR', status: 503, message: 'LMS unreachable' },
    })

    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="error-server"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-not-found"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="error-server"]').text()).toContain('LMS unreachable')
  })
})
