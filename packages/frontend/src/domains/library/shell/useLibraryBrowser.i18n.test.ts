/**
 * useLibraryBrowser — the rescan status line and both chip option lists go
 * through the translator the caller hands in, in both languages.
 *
 * The language is set after the composable has run, because that is when the
 * server config delivers it. A list built once during setup would still read
 * back in the mount language, and a case that switched before mounting would
 * never notice.
 *
 * Own file because useLibraryBrowser.test.ts is already close to the size
 * limit, and because these cases need the real i18n store rather than the
 * identity translator the other files pass.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Result } from '@signalform/shared'
import type { MessageKey } from '@/i18n'
import type { LibraryApiError } from '@/platform/api/libraryApi'
import type { Language } from '@/types/i18n'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'

vi.mock('@/platform/api/libraryApi', () => ({
  getLibraryAlbums: vi.fn(),
  getLibraryArtists: vi.fn(),
  getLibraryGenres: vi.fn(),
  getRescanStatus: vi.fn(),
  triggerLibraryRescan: vi.fn(),
}))

vi.mock('@/platform/api/playbackApi', () => ({ playAlbum: vi.fn() }))
vi.mock('@/platform/api/queueApi', () => ({ addAlbumToQueue: vi.fn() }))
vi.mock('@/platform/api/tidalAlbumsApi', () => ({
  getTidalAlbums: vi.fn(),
  getTidalFeaturedAlbums: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: (): { readonly query: Record<string, string> } => ({ query: {} }),
  useRouter: (): { readonly push: ReturnType<typeof vi.fn> } => ({ push: vi.fn() }),
}))

import { useLibraryBrowser } from './useLibraryBrowser'
import { getLibraryAlbums, getLibraryGenres, triggerLibraryRescan } from '@/platform/api/libraryApi'

const mockGetLibraryAlbums = vi.mocked(getLibraryAlbums)
const mockGetLibraryGenres = vi.mocked(getLibraryGenres)
const mockTriggerLibraryRescan = vi.mocked(triggerLibraryRescan)

// handleRescan writes the "starting" line and only then awaits the request, so
// a request that never settles pins the browser on exactly that line.
const neverSettles = (): Promise<Result<void, LibraryApiError>> =>
  new Promise<Result<void, LibraryApiError>>(() => {})

// Wrapped exactly like LibraryView.vue does it: `i18nStore.t` unwraps the
// computed on read, so handing that value over would freeze the translator in
// the language of the mount and hide every late switch below.
const mountBrowser = async (): Promise<ReturnType<typeof useLibraryBrowser>> => {
  const i18nStore = setupTestEnv()

  let browser: ReturnType<typeof useLibraryBrowser> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      browser = useLibraryBrowser((key: MessageKey) => i18nStore.t(key))
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return browser!
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

describe('useLibraryBrowser – rescan status line', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [], hasMore: false } })
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
    mockTriggerLibraryRescan.mockImplementation(neverSettles)
  })

  it('announces the start of the scan in English', async () => {
    const browser = await mountBrowser()

    void browser.handleRescan()

    expect(browser.rescanMessage.value).toBe('Starting scan…')
  })

  it('announces the start of the scan in German', async () => {
    const browser = await mountBrowser()
    await switchTo('de')

    void browser.handleRescan()

    // The bug this guards: a hard-coded English literal here still reads
    // "Starting scan…" for a German user.
    expect(browser.rescanMessage.value).toBe('Scan wird gestartet…')
  })
})

const labelsOf = (options: ReadonlyArray<{ readonly label: string }>): readonly string[] =>
  options.map((option) => option.label)

describe('useLibraryBrowser – chip labels after a late language switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockGetLibraryAlbums.mockResolvedValue({ ok: true, value: { albums: [], hasMore: false } })
    mockGetLibraryGenres.mockResolvedValue({ ok: true, value: [] })
  })

  it('rebuilds the sort labels', async () => {
    const browser = await mountBrowser()
    expect(labelsOf(browser.sortOptions.value)).toEqual([
      'Artist A–Z',
      'Album A–Z',
      'Newest',
      'Recently added',
    ])

    await switchTo('de')

    expect(labelsOf(browser.sortOptions.value)).toEqual([
      'Künstler A–Z',
      'Album A–Z',
      'Neueste zuerst',
      'Kürzlich hinzugefügt',
    ])
  })

  it('rebuilds the decade labels', async () => {
    const browser = await mountBrowser()
    expect(labelsOf(browser.decadeOptions.value)).toEqual([
      'All years',
      '2020s',
      '2010s',
      '2000s',
      '90s',
      'Older',
    ])

    await switchTo('de')

    expect(labelsOf(browser.decadeOptions.value)).toEqual([
      'Alle Jahre',
      '2020er',
      '2010er',
      '2000er',
      '90er',
      'Älter',
    ])
  })

  // The summary reads its sort and decade wording out of those two lists, so a
  // list frozen at setup leaves the line half English however late the switch.
  it('rewrites the filter summary out of the rebuilt lists', async () => {
    const browser = await mountBrowser()
    browser.setDecadeFilter('older')
    await flushPromises()
    expect(browser.filterSummary.value).toBe('Artist A–Z · Older')

    await switchTo('de')

    expect(browser.filterSummary.value).toBe('Künstler A–Z · Älter')
  })
})
