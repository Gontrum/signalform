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
  hasMore: false,
}

/**
 * Matches LibraryGenresResponse from libraryApi: server order is descending by
 * `albumCount`, and `albumCount` is absent while the counts are still cold.
 *
 * More than GENRE_CHIP_COUNT (20) entries on purpose — only the first 20 become
 * chips, the rest exist solely in the `<datalist>`, so a shorter fixture would
 * never exercise that split.
 */
export const libraryGenresResponse = {
  genres: [
    { id: 101, name: 'Rock', albumCount: 412 },
    { id: 102, name: 'Electronic', albumCount: 318 },
    { id: 103, name: 'Jazz', albumCount: 264 },
    { id: 104, name: 'Pop', albumCount: 231 },
    { id: 105, name: 'Alternative', albumCount: 198 },
    { id: 106, name: 'Hip-Hop', albumCount: 176 },
    { id: 107, name: 'Classical', albumCount: 154 },
    { id: 108, name: 'Ambient', albumCount: 141 },
    { id: 109, name: 'Indie Rock', albumCount: 128 },
    { id: 110, name: 'Soul', albumCount: 119 },
    { id: 111, name: 'Funk', albumCount: 104 },
    { id: 112, name: 'Techno', albumCount: 97 },
    { id: 113, name: 'House', albumCount: 88 },
    { id: 114, name: 'Folk', albumCount: 76 },
    { id: 115, name: 'Metal', albumCount: 71 },
    { id: 116, name: 'Reggae', albumCount: 63 },
    { id: 117, name: 'Blues', albumCount: 58 },
    { id: 118, name: 'Punk', albumCount: 51 },
    { id: 119, name: 'Country', albumCount: 44 },
    { id: 120, name: 'Disco', albumCount: 37 },
    { id: 121, name: 'Drum & Bass', albumCount: 29 },
    { id: 122, name: 'Trip-Hop', albumCount: 22 },
    { id: 123, name: 'Shoegaze', albumCount: 15 },
    { id: 124, name: 'Post-Rock', albumCount: 9 },
    { id: 125, name: 'Krautrock' },
    { id: 126, name: 'Dub Techno' },
    { id: 127, name: 'Neoclassical' },
  ],
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
  hasLastFmSharedSecret: false,
  hasFanartKey: false,
  isConfigured: true,
  language: 'en' as const,
}

// ── Users response ────────────────────────────────────────────────────────────

/**
 * Two-user fixture — matches UsersResponseSchema in usersApi.ts. Two users
 * (and no stored/resolved selection) is what triggers useUserStore's
 * `needsSelection` getter, which mounts UserSelectDialog (see App.vue).
 * `activeListenerId` is optional per the schema and simply omitted here —
 * `undefined` is not a valid JSON value, so an explicit `undefined` field
 * would fail the mock helper's JsonObject typing.
 */
export const twoUsersResponse = {
  users: [
    { id: 'user-ada', name: 'Ada', hasLastFmSession: false },
    { id: 'user-ben', name: 'Ben', hasLastFmSession: false },
  ],
}

// ── Autocomplete response ─────────────────────────────────────────────────────

export const emptyAutocompleteResponse = {
  suggestions: [],
  query: 'test',
}

/** Populated autocomplete response — used to exercise the open/populated dropdown state. */
export const populatedAutocompleteResponse = {
  suggestions: [
    { id: 'a1', type: 'artist' as const, artist: 'Nova Vale' },
    { id: 'a2', type: 'artist' as const, artist: 'Kite Harbor' },
  ],
  query: 'nov',
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
  readonly addedBy?: 'radio' | 'user'
}

export type LiveQueueProjection = {
  readonly tracks: readonly LiveQueueTrackSnapshot[]
  readonly radioModeActive: boolean
  readonly radioBoundaryIndex: number | null
}

/**
 * Radio provenance comes from `addedBy`, never from `source`: the live radio
 * replenishes from the local library just as happily as from Tidal, so a
 * source-based check reports an empty radio segment for a queue that clearly
 * has one (backend `projectRadioQueueTracks` derives radioBoundaryIndex from
 * exactly this field).
 */
export const isRadioTrack = (track: LiveQueueTrackSnapshot): boolean => track.addedBy === 'radio'

export const countRadioTracks = (tracks: readonly LiveQueueTrackSnapshot[]): number =>
  tracks.filter(isRadioTrack).length

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
  /** Number of queue rows rendered above the radio separator, or null when absent. */
  readonly radioBoundaryIndex: number | null
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
const usersApiUrl = `${backendUrl}/api/users`

/** Mirrors SELECTED_USER_KEY in src/platform/api/userHeader.ts — e2e has no `@/` alias. */
const SELECTED_USER_STORAGE_KEY = 'selected-user-id'

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

  const addedBy =
    value['addedBy'] === 'radio' || value['addedBy'] === 'user' ? value['addedBy'] : undefined

  return {
    id: value['id'],
    title: value['title'],
    artist: value['artist'],
    album: value['album'],
    position: value['position'],
    isCurrent: value['isCurrent'],
    source,
    addedBy,
  }
}

const parseQueueResponse = (body: unknown): LiveQueueProjection => {
  if (!isObject(body) || !Array.isArray(body['tracks'])) {
    throw new Error('Queue API returned an invalid queue snapshot payload')
  }

  const tracks = body['tracks'].map((track, index) => {
    const parsed = parseQueueTrack(track)
    if (parsed === null) {
      throw new Error(`Queue API returned an invalid track at index ${String(index)}`)
    }
    return parsed
  })

  return {
    tracks,
    radioModeActive: body['radioModeActive'] === true,
    radioBoundaryIndex:
      typeof body['radioBoundaryIndex'] === 'number' ? body['radioBoundaryIndex'] : null,
  }
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

export const fetchLiveQueueProjection = async (
  request: APIRequestContext,
): Promise<LiveQueueProjection> => parseQueueResponse(await getJson(request, queueApiUrl))

export const fetchLiveQueue = async (
  request: APIRequestContext,
): Promise<readonly LiveQueueTrackSnapshot[]> => (await fetchLiveQueueProjection(request)).tracks

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
    const entries = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="queue-track"], [data-testid="radio-boundary"]',
      ),
    )
    const boundaryEntryIndex = entries.findIndex(
      (entry) => entry.dataset['testid'] === 'radio-boundary',
    )
    return {
      rows: rowSnapshots,
      rowCount: rowSnapshots.length,
      busyTrackIds: rowSnapshots.filter((row) => row.busy).map((row) => row.trackId),
      radioBoundaryVisible: boundaryEntryIndex >= 0,
      radioBoundaryIndex: boundaryEntryIndex >= 0 ? boundaryEntryIndex : null,
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

// Selectors here must stay language-agnostic: the live stack serves whatever
// `language` the dev config holds, so any translated string would rot on the
// next config change.
export const waitForQueueViewRoute = async (page: Page): Promise<void> => {
  await page.waitForURL('**/queue', { timeout: 15_000 })
  await expectNoUserSelectDialog(page)
  await expect(page.getByTestId('queue-view')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('radio-mode-toggle')).toBeVisible({ timeout: 15_000 })
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
          const projection = await fetchLiveQueueProjection(request)
          const boundaryIndex = projection.radioBoundaryIndex
          return (
            boundaryIndex !== null &&
            projection.tracks.length > boundaryIndex &&
            countRadioTracks(projection.tracks) > 0
          )
        },
        {
          message: 'Expected radio playback to create a radio segment in the queue',
          timeout: 20_000,
        },
      )
      .toBe(true)

    return await fetchLiveQueue(request)
  }

  return await fetchLiveQueue(request)
}

const parseUserIds = (body: unknown): readonly string[] => {
  if (!isObject(body) || !Array.isArray(body['users'])) {
    throw new Error('Users API returned an invalid users payload')
  }

  return body['users'].flatMap((user) =>
    isObject(user) && typeof user['id'] === 'string' ? [user['id']] : [],
  )
}

/**
 * The live stack serves a real household user list, and with more than one user
 * `needsSelection` mounts UserSelectDialog — a modal whose overlay swallows every
 * pointer event. The mocked specs never see it because their `/api/users` body
 * fails schema parsing and leaves the store empty, which no live run can copy.
 * So seed the very key the dialog's own `selectUser` writes: language-agnostic
 * (no caption is read) and, via addInitScript, applied before app code on every
 * navigation, so reloads and storage clears cannot resurrect the dialog.
 */
export const seedSelectedLiveUser = async (
  page: Page,
  request: APIRequestContext,
): Promise<string | undefined> => {
  const userIds = parseUserIds(await getJson(request, usersApiUrl))
  const selectedUserId = userIds[0]

  if (selectedUserId === undefined) {
    return undefined
  }

  await page.addInitScript(
    ([key, id]) => {
      try {
        window.localStorage.setItem(key, id)
      } catch {
        // Storage may be unavailable; the dialog assertion below reports it.
      }
    },
    [SELECTED_USER_STORAGE_KEY, selectedUserId] as const,
  )

  return selectedUserId
}

export const expectNoUserSelectDialog = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('user-select-dialog')).toHaveCount(0, { timeout: 15_000 })
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
  await seedSelectedLiveUser(page, request)
  await clearBrowserOfflineState(page)
  await expectNoUserSelectDialog(page)

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
    const viewFullQueue = page
      .getByTestId('view-full-queue')
      .or(page.getByTestId('view-full-queue-empty-state'))
      .first()
    await expect(viewFullQueue).toBeVisible({ timeout: 15_000 })
    await viewFullQueue.click()
    await waitForQueueViewRoute(page)
    queue = await fetchLiveQueue(request)
  }

  let queueWithRadio = queue
  if (countRadioTracks(queue) === 0) {
    queueWithRadio = await tryStartLiveRadio(page, request)
  }

  await page.goto('/queue')
  await waitForQueueViewRoute(page)
  const settledQueue = queueWithRadio.length > 0 ? queueWithRadio : await fetchLiveQueue(request)
  const browserQueue = await fetchQueueDomSnapshot(page)

  const removableRadioTrack = settledQueue.find(isRadioTrack) ?? null
  const reorderCandidate = settledQueue.length >= 2 ? (settledQueue[0] ?? null) : null

  return {
    initialQueue: settledQueue,
    browserQueue,
    removableRadioTrack,
    reorderCandidate,
    radioBoundaryVisible: browserQueue.radioBoundaryVisible,
  }
}
