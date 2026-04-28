/**
 * Shared fixture data for E2E tests.
 * All fixtures conform to the actual API response schemas.
 */

import { expect, type APIRequestContext, type Page } from '@playwright/test'

// ── Track fixtures ────────────────────────────────────────────────────────────

export const localTrack = {
  id: 'track-local-1',
  title: 'Local Test Track',
  artist: 'Local Artist',
  album: 'Local Album',
  url: 'file:///music/test.flac',
  source: 'local' as const,
}

export const tidalTrack = {
  id: 'track-tidal-1',
  title: 'Tidal Test Track',
  artist: 'Tidal Artist',
  album: 'Tidal Album',
  url: 'tidal://58990486.flc',
  source: 'tidal' as const,
}

// ── Search results responses ───────────────────────────────────────────────────

export const localTrackSearchResponse = {
  tracks: [localTrack],
  albums: [],
  artists: [],
  query: 'test',
  totalResults: 1,
}

export const tidalTrackSearchResponse = {
  tracks: [tidalTrack],
  albums: [],
  artists: [],
  query: 'tidal test',
  totalResults: 1,
}

// ── Album fixtures ────────────────────────────────────────────────────────────

/** Local album — has albumId → navigable in SearchResultsList */
export const localAlbumSearchResult = {
  id: 'album-local-1',
  albumId: '42',
  title: 'Local Search Album',
  artist: 'Local Artist',
  trackCount: 3,
  coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
}

/** Tidal album — has trackUrls, no albumId → play-track-list button */
export const tidalAlbumSearchResult = {
  id: 'tidal-artist::tidal-album',
  source: 'tidal' as const,
  title: 'Tidal Search Album',
  artist: 'Tidal Artist',
  trackCount: 2,
  trackUrls: ['tidal://111.flc', 'tidal://222.flc'],
}

export const localAlbumSearchResponse = {
  tracks: [],
  albums: [localAlbumSearchResult],
  artists: [],
  query: 'local album',
  totalResults: 1,
}

export const tidalAlbumSearchResponse = {
  tracks: [],
  albums: [tidalAlbumSearchResult],
  artists: [],
  query: 'tidal album',
  totalResults: 1,
}

// ── Album detail response ─────────────────────────────────────────────────────

/** Matches AlbumDetailResponse from albumApi (Zod-validated schema) */
export const albumDetailResponse = {
  id: '42',
  title: 'Local Search Album',
  artist: 'Local Artist',
  releaseYear: 2020,
  coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
  tracks: [
    {
      id: '1',
      trackNumber: 1,
      title: 'Track One',
      artist: 'Local Artist',
      duration: 240,
      url: 'file:///music/track1.flac',
    },
    {
      id: '2',
      trackNumber: 2,
      title: 'Track Two',
      artist: 'Local Artist',
      duration: 200,
      url: 'file:///music/track2.flac',
    },
  ],
}

// ── Library albums response ───────────────────────────────────────────────────

/** Matches LibraryAlbumsResponse from libraryApi */
export const libraryAlbumsResponse = {
  albums: [
    {
      id: '42',
      title: 'Local Search Album',
      artist: 'Local Artist',
      trackCount: 3,
      coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
      releaseYear: 2020,
      genre: null,
    },
  ],
  totalCount: 1,
}

// ── Queue fixtures ────────────────────────────────────────────────────────────

/**
 * 1-track queue for Journey 5 (add to queue + jump).
 * Must match QueueResponseSchema:
 * { tracks: [...], radioModeActive: boolean, radioBoundaryIndex: number | null }
 */
export const singleTrackQueueResponse = {
  tracks: [
    {
      id: 'queue-1',
      position: 1,
      title: 'Queued Track',
      artist: 'Queue Artist',
      album: 'Queue Album',
      duration: 240,
      isCurrent: true,
      source: 'local' as const,
    },
  ],
  radioModeActive: false,
  radioBoundaryIndex: null,
}

/**
 * 3-track queue for Journey 6 (radio mode — radioBoundaryIndex injected via Pinia).
 * Must match QueueResponseSchema:
 * { tracks: [...], radioModeActive: boolean, radioBoundaryIndex: number | null }
 */
export const radioQueueResponse = {
  tracks: [
    {
      id: 'q-1',
      position: 1,
      title: 'Pre-Radio Track 1',
      artist: 'Artist A',
      album: 'Album A',
      duration: 200,
      isCurrent: true,
      source: 'local' as const,
    },
    {
      id: 'q-2',
      position: 2,
      title: 'Pre-Radio Track 2',
      artist: 'Artist B',
      album: 'Album B',
      duration: 210,
      isCurrent: false,
      source: 'local' as const,
    },
    {
      id: 'q-3',
      position: 3,
      title: 'Radio Track 1',
      artist: 'Artist C',
      album: 'Album C',
      duration: 220,
      isCurrent: false,
      source: 'local' as const,
    },
  ],
  radioModeActive: true,
  radioBoundaryIndex: null,
}

// ── Config response ───────────────────────────────────────────────────────────

/**
 * Minimal valid GET /api/config response.
 * Must satisfy MaskedConfigSchema (Zod-validated) in configApi.ts.
 * The PUT /api/config mock merges caller-supplied fields on top of this.
 */
export const defaultConfigResponse = {
  lmsHost: '127.0.0.1',
  lmsPort: 9000,
  playerId: '00:00:00:00:00:00',
  hasLastFmKey: false,
  hasFanartKey: false,
  isConfigured: true,
  language: 'en' as const,
}

// ── Autocomplete response ─────────────────────────────────────────────────────

export const emptyAutocompleteResponse = {
  suggestions: [],
  query: 'test',
}

// ── Live queue-editing helpers ────────────────────────────────────────────────

export type LiveQueueTrackSnapshot = {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly position: number
  readonly isCurrent: boolean
  readonly source?: 'local' | 'qobuz' | 'tidal'
}

export type QueueDomRowSnapshot = {
  readonly trackId: string
  readonly trackIndex: number
  readonly busy: boolean
  readonly title: string
  readonly subtitle: string
}

export type QueueDomSnapshot = {
  readonly rows: readonly QueueDomRowSnapshot[]
  readonly rowCount: number
  readonly busyTrackIds: readonly string[]
  readonly radioBoundaryVisible: boolean
  readonly radioBoundaryText: string | null
}

export type LiveQueueSetupResult = {
  readonly initialQueue: readonly LiveQueueTrackSnapshot[]
  readonly browserQueue: QueueDomSnapshot
  readonly removableRadioTrack: LiveQueueTrackSnapshot | null
  readonly reorderCandidate: LiveQueueTrackSnapshot | null
  readonly radioBoundaryVisible: boolean
}

const backendUrl = process.env['PLAYWRIGHT_LIVE_BACKEND_URL'] ?? 'http://127.0.0.1:3001'

const queueApiUrl = `${backendUrl}/api/queue`
const searchApiUrl = `${backendUrl}/api/search`
const healthApiUrl = `${backendUrl}/health`

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseQueueTrack = (value: unknown): LiveQueueTrackSnapshot | null => {
  if (!isObject(value)) {
    return null
  }

  if (
    typeof value['id'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['artist'] !== 'string' ||
    typeof value['album'] !== 'string' ||
    typeof value['position'] !== 'number' ||
    typeof value['isCurrent'] !== 'boolean'
  ) {
    return null
  }

  const source =
    value['source'] === 'local' || value['source'] === 'qobuz' || value['source'] === 'tidal'
      ? value['source']
      : undefined

  return {
    id: value['id'],
    title: value['title'],
    artist: value['artist'],
    album: value['album'],
    position: value['position'],
    isCurrent: value['isCurrent'],
    source,
  }
}

const parseQueueResponse = (body: unknown): readonly LiveQueueTrackSnapshot[] => {
  if (!isObject(body) || !Array.isArray(body['tracks'])) {
    throw new Error('Queue API returned an invalid queue snapshot payload')
  }

  return body['tracks'].map((track, index) => {
    const parsed = parseQueueTrack(track)
    if (parsed === null) {
      throw new Error(`Queue API returned an invalid track at index ${String(index)}`)
    }
    return parsed
  })
}

const getJson = async (request: APIRequestContext, url: string): Promise<unknown> => {
  try {
    const response = await request.get(url)
    expect(response.ok(), `GET ${url} should succeed`).toBe(true)

    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Expected JSON response but received content-type ${contentType || 'unknown'}`,
      )
    }

    return await response.json()
  } catch (error) {
    throw new Error(
      `Live backend request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const isLiveBackendAvailable = async (request: APIRequestContext): Promise<boolean> => {
  try {
    const healthResponse = await request.get(healthApiUrl)
    const healthContentType = healthResponse.headers()['content-type'] ?? ''
    if (!healthResponse.ok() || !healthContentType.includes('application/json')) {
      return false
    }

    const queueResponse = await request.get(queueApiUrl)
    const queueContentType = queueResponse.headers()['content-type'] ?? ''
    return queueResponse.ok() && queueContentType.includes('application/json')
  } catch {
    return false
  }
}

export const fetchLiveQueue = async (
  request: APIRequestContext,
): Promise<readonly LiveQueueTrackSnapshot[]> =>
  parseQueueResponse(await getJson(request, queueApiUrl))

export const fetchQueueDomSnapshot = async (page: Page): Promise<QueueDomSnapshot> =>
  await page.getByTestId('queue-view').evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="queue-track"]'))
    const rowSnapshots = rows.map((row) => {
      const title = row.querySelector('p')?.textContent?.trim() ?? ''
      const subtitle = row.querySelectorAll('p')[1]?.textContent?.trim() ?? ''
      return {
        trackId: row.dataset['trackId'] ?? '',
        trackIndex: Number.parseInt(row.dataset['trackIndex'] ?? '-1', 10),
        busy: row.dataset['busy'] === 'true',
        title,
        subtitle,
      }
    })
    const radioBoundary = document.querySelector<HTMLElement>('[data-testid="radio-boundary"]')
    return {
      rows: rowSnapshots,
      rowCount: rowSnapshots.length,
      busyTrackIds: rowSnapshots.filter((row) => row.busy).map((row) => row.trackId),
      radioBoundaryVisible: radioBoundary !== null,
      radioBoundaryText: radioBoundary?.textContent?.trim() ?? null,
    }
  })

export const waitForQueueBusyToClear = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => (await fetchQueueDomSnapshot(page)).busyTrackIds, {
      message: 'Expected queue row busy state to clear',
      timeout: 15_000,
    })
    .toEqual([])
}

export const waitForQueueDomToMatchApi = async (
  page: Page,
  request: APIRequestContext,
): Promise<QueueDomSnapshot> => {
  const expectedQueue = await fetchLiveQueue(request)

  await expect
    .poll(
      async () => {
        const dom = await fetchQueueDomSnapshot(page)
        return {
          rowCount: dom.rowCount,
          titles: dom.rows.map((row) => row.title),
          busyTrackIds: dom.busyTrackIds,
        }
      },
      {
        message: 'Expected queue DOM to match backend queue after websocket settlement',
        timeout: 15_000,
      },
    )
    .toEqual({
      rowCount: expectedQueue.length,
      titles: expectedQueue.map((track) => track.title),
      busyTrackIds: [],
    })

  return await fetchQueueDomSnapshot(page)
}

const waitForQueueViewRoute = async (page: Page): Promise<void> => {
  await page.waitForURL('**/queue', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('back-button')).toBeVisible({ timeout: 15_000 })
}

const searchAndAddFirstTrack = async (page: Page, query: string): Promise<void> => {
  const searchInput = page.getByTestId('search-input')
  await searchInput.fill(query)
  await searchInput.press('Enter')

  await expect(page.getByTestId('full-results-list')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('add-to-queue-button').first()).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('add-to-queue-button').first().click()
}

export const tryStartLiveRadio = async (
  page: Page,
  request: APIRequestContext,
): Promise<readonly LiveQueueTrackSnapshot[]> => {
  const queries = ['radiohead', 'beatles', 'miles davis']

  for (const query of queries) {
    const searchResponse = await request.post(searchApiUrl, {
      data: { query },
    })

    if (!searchResponse.ok()) {
      continue
    }

    const searchBody = (await searchResponse.json()) as {
      readonly tracks?: readonly {
        readonly title?: string
        readonly artist?: string
        readonly source?: string
      }[]
    }

    const track = searchBody.tracks?.find((item) => item.source === 'local')
    if (
      track === undefined ||
      typeof track.title !== 'string' ||
      typeof track.artist !== 'string'
    ) {
      continue
    }

    const radioResponse = await request.post(`${backendUrl}/api/playback/play-radio`, {
      data: {
        title: track.title,
        artist: track.artist,
      },
    })

    if (!radioResponse.ok()) {
      continue
    }

    await page.goto('/queue')
    await waitForQueueViewRoute(page)

    await expect
      .poll(
        async () => {
          const queue = await fetchLiveQueue(request)
          const boundaryIndex = queue.findIndex(
            (entry) => entry.source === 'tidal' || entry.source === 'qobuz',
          )
          const trackCount = queue.length
          return boundaryIndex >= 0 && trackCount > boundaryIndex
        },
        {
          message: 'Expected radio playback to create a streaming segment in the queue',
          timeout: 20_000,
        },
      )
      .toBe(true)

    return await fetchLiveQueue(request)
  }

  return await fetchLiveQueue(request)
}

const clearBrowserOfflineState = async (page: Page): Promise<void> => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const isOfflinePage = (await page.getByTestId('offline-page').count()) > 0
  if (!isOfflinePage) {
    await page.waitForLoadState('networkidle')
    return
  }

  await page.evaluate(async () => {
    const registrations =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []

    await Promise.all(
      registrations.map(async (registration) => {
        await registration.unregister()
      }),
    )

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(
        cacheKeys.map(async (key) => {
          await caches.delete(key)
        }),
      )
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  await page.context().clearCookies()
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('offline-page')).toHaveCount(0, { timeout: 15_000 })
}

export const ensureQueueEditingState = async ({
  page,
  request,
}: {
  readonly page: Page
  readonly request: APIRequestContext
}): Promise<LiveQueueSetupResult> => {
  await clearBrowserOfflineState(page)

  let queue = await fetchLiveQueue(request)

  if (queue.length === 0) {
    await searchAndAddFirstTrack(page, 'test')
    await expect
      .poll(async () => (await fetchLiveQueue(request)).length, {
        message: 'Expected add-to-queue search path to create at least one queue item',
        timeout: 15_000,
      })
      .toBeGreaterThan(0)
    queue = await fetchLiveQueue(request)
  }

  if (queue.length < 2) {
    await page.goto('/')
    await searchAndAddFirstTrack(page, 'music')
    await expect
      .poll(async () => (await fetchLiveQueue(request)).length, {
        message: 'Expected second add-to-queue path to create a reorder target',
        timeout: 15_000,
      })
      .toBeGreaterThan(1)
    queue = await fetchLiveQueue(request)
  }

  if (queue.length === 0) {
    await page.goto('/')
    await page.getByRole('button', { name: 'View Full Queue' }).click()
    await waitForQueueViewRoute(page)
    queue = await fetchLiveQueue(request)
  }

  let queueWithRadio = queue
  const hasStreamingTrack = queue.some(
    (track) => track.source === 'tidal' || track.source === 'qobuz',
  )
  if (!hasStreamingTrack) {
    queueWithRadio = await tryStartLiveRadio(page, request)
  }

  await page.goto('/queue')
  await waitForQueueViewRoute(page)
  const settledQueue = queueWithRadio.length > 0 ? queueWithRadio : await fetchLiveQueue(request)
  const browserQueue = await fetchQueueDomSnapshot(page)

  const removableRadioTrack =
    settledQueue.find((track) => track.source === 'tidal' || track.source === 'qobuz') ?? null
  const reorderCandidate = settledQueue.length >= 2 ? (settledQueue[0] ?? null) : null

  return {
    initialQueue: settledQueue,
    browserQueue,
    removableRadioTrack,
    reorderCandidate,
    radioBoundaryVisible: browserQueue.radioBoundaryVisible,
  }
}
