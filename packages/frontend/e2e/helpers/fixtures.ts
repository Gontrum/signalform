/**
 * Shared fixture data for E2E tests, plus the live queue-editing helpers.
 * All fixtures conform to the actual API response schemas.
 *
 * Warning — everything below "Live queue state builders" drives the running
 * household stack, not a mock. A live run appends tracks to the real queue and
 * removes them again, toggles radio mode (on for the radio scenario, off for
 * the user scenario, which also deletes the upcoming radio segment), and can
 * make real speakers resume, because the replenish pipeline starts a stopped
 * player. `restoreLiveQueueBaseline` undoes exactly that — playback paused,
 * radio mode off, every helper-added track removed — and a live spec must call
 * it from an `afterEach`, so a failing test leaves the household queue as it
 * found it too. What no cleanup can undo: playback moves on while a run lasts.
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
  readonly url?: string
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

/** Which queue-editing precondition `ensureQueueEditingState` has to build. */
export type LiveQueueScenario = 'radio-track-removal' | 'user-track-removal'

export type LiveQueueSetupResult = {
  readonly initialQueue: readonly LiveQueueTrackSnapshot[]
  readonly browserQueue: QueueDomSnapshot
  /** Track the requested scenario guarantees: user-added or radio-added, never current. */
  readonly removableTrack: LiveQueueTrackSnapshot
  readonly radioTrackCount: number
  readonly radioBoundaryVisible: boolean
}

const backendUrl = process.env['PLAYWRIGHT_LIVE_BACKEND_URL'] ?? 'http://127.0.0.1:3001'

const queueApiUrl = `${backendUrl}/api/queue`
const queueAddApiUrl = `${queueApiUrl}/add`
const queueRemoveApiUrl = `${queueApiUrl}/remove`
const radioModeApiUrl = `${queueApiUrl}/radio-mode`
const playbackStatusApiUrl = `${backendUrl}/api/playback/status`
const playbackPauseApiUrl = `${backendUrl}/api/playback/pause`
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

  // The URL is what identifies a track the setup put into the live queue: LMS
  // assigns queue ids itself, so nothing else survives the add round trip.
  const url = typeof value['url'] === 'string' ? value['url'] : undefined

  return {
    id: value['id'],
    title: value['title'],
    artist: value['artist'],
    album: value['album'],
    position: value['position'],
    isCurrent: value['isCurrent'],
    url,
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

// ── Live queue state builders ─────────────────────────────────────────────────
//
// Everything below *builds* the precondition a live journey needs instead of
// searching the running queue for one that happens to fit. A test that skips
// (or explodes) because the household queue held the wrong kind of track
// proves nothing about the product.

const LIVE_SETUP_PREFIX = 'Live queue setup'

/**
 * `addedBy: 'radio'` is written by exactly one backend path: the replenish
 * pipeline. Its cheapest trigger is a queue removal — with radio mode on,
 * removing a *streaming* track (the backend ignores local removals) replenishes
 * RADIO_REMOVAL_REPLENISH_SIZE = 1 track without any playback at all. The other
 * trigger, queue-end, needs music actually running out on real speakers. So the
 * radio scenario appends a throwaway streaming track, removes it again, and
 * repeats until the radio segment is deep enough.
 *
 * Two, not one: the radio journey removes a radio track and then expects the
 * radio segment to still exist, and a radio-added track is usually local — so
 * its removal does not trigger a replacement.
 */
const MIN_ESTABLISHED_RADIO_TRACKS = 2
const RADIO_SEED_ATTEMPTS = 4
const RADIO_REPLENISH_TIMEOUT_MS = 25_000

const LIBRARY_TRACK_FALLBACK_QUERIES = ['love', 'the', 'live'] as const
/** Streaming-catalogue names — the seed only has to exist on Tidal and last.fm. */
const RADIO_SEED_FALLBACK_QUERIES = ['radiohead', 'the beatles', 'daft punk'] as const

/**
 * URLs this helper appended to the live queue and has not removed again.
 * Module state on purpose: the cleanup hook runs in a different scope than the
 * setup that added them, and nothing else can tell a helper track apart from a
 * track the household queued yesterday.
 */
const helperAddedTrackUrls = new Set<string>()

/**
 * Whether this run has issued any live command yet. A spec that skipped before
 * touching the stack has nothing to restore, and attempting it against a
 * missing backend would bury the skip reason under cleanup warnings.
 */
let hasMutatedLiveStack = false

/**
 * The household queue as the first setup of this run found it. Captured once,
 * not per test: after the first cleanup the queue should be this set again, and
 * re-capturing would bless anything a leaky cleanup had left behind.
 */
let householdBaselineUrls: ReadonlySet<string> | undefined

type LiveSearchTrack = {
  readonly url: string
  readonly artist: string
  readonly title: string
  readonly source: string
}

type LiveTrackSearchSpec = {
  readonly queries: readonly string[]
  /** Accepted sources, most wanted first. */
  readonly sources: readonly string[]
  readonly excludedUrls: ReadonlySet<string>
}

const postLiveCommand = async (
  request: APIRequestContext,
  url: string,
  data: object,
  what: string,
): Promise<void> => {
  // Set before the request, not after: a command that fails mid-flight may
  // still have changed the stack.
  hasMutatedLiveStack = true

  const response = await request.post(url, { data })
  if (!response.ok()) {
    throw new Error(
      `${LIVE_SETUP_PREFIX}: ${what} failed with HTTP ${String(response.status())} (POST ${url})`,
    )
  }
}

const parseSearchTracks = (body: unknown): readonly LiveSearchTrack[] => {
  if (!isObject(body) || !Array.isArray(body['results'])) {
    return []
  }

  return body['results'].flatMap((entry: unknown) => {
    if (!isObject(entry) || entry['type'] !== 'track') {
      return []
    }

    const url = entry['url']
    const artist = entry['artist']
    const title = entry['title']
    const source = entry['source']
    if (
      typeof url !== 'string' ||
      typeof artist !== 'string' ||
      typeof title !== 'string' ||
      typeof source !== 'string'
    ) {
      return []
    }

    return [{ url, artist, title, source }]
  })
}

const searchLiveTracks = async (
  request: APIRequestContext,
  query: string,
): Promise<readonly LiveSearchTrack[]> => {
  const response = await request.post(searchApiUrl, { data: { query } })
  if (!response.ok()) {
    return []
  }

  const body: unknown = await response.json()
  return parseSearchTracks(body)
}

const findLiveSearchTrack = async (
  request: APIRequestContext,
  spec: LiveTrackSearchSpec,
): Promise<LiveSearchTrack | undefined> => {
  for (const query of spec.queries) {
    const candidates = (await searchLiveTracks(request, query)).filter(
      (track) => !spec.excludedUrls.has(track.url),
    )
    const bySourcePreference = spec.sources.flatMap((source) =>
      candidates.filter((track) => track.source === source),
    )
    const match = bySourcePreference[0]
    if (match !== undefined) {
      return match
    }
  }

  return undefined
}

/**
 * The queue's own artists come first: whatever is already queued is provably
 * present in this library, known to the streaming catalogue, and — being real
 * listening material — likely to have last.fm neighbours.
 */
const buildSearchQueries = (
  queue: readonly LiveQueueTrackSnapshot[],
  fallbacks: readonly string[],
): readonly string[] => {
  const queueArtists = [
    ...new Set(queue.map((track) => track.artist.trim()).filter((artist) => artist.length > 0)),
  ].slice(0, 5)

  return [...queueArtists, ...fallbacks]
}

const collectQueueUrls = (queue: readonly LiveQueueTrackSnapshot[]): ReadonlySet<string> =>
  new Set(queue.flatMap((track) => (track.url === undefined ? [] : [track.url])))

const addLiveQueueTrack = async (
  request: APIRequestContext,
  trackUrl: string,
): Promise<LiveQueueTrackSnapshot> => {
  await postLiveCommand(request, queueAddApiUrl, { trackUrl }, `adding ${trackUrl} to the queue`)
  helperAddedTrackUrls.add(trackUrl)

  await expect
    .poll(async () => (await fetchLiveQueue(request)).some((track) => track.url === trackUrl), {
      message: `${LIVE_SETUP_PREFIX}: expected ${trackUrl} to reach the live queue`,
      timeout: 15_000,
    })
    .toBe(true)

  const added = (await fetchLiveQueue(request)).find((track) => track.url === trackUrl)
  if (added === undefined) {
    throw new Error(`${LIVE_SETUP_PREFIX}: ${trackUrl} left the live queue right after it arrived`)
  }

  return added
}

const removeLiveQueueTrackByUrl = async (
  request: APIRequestContext,
  trackUrl: string,
): Promise<void> => {
  const trackIndex = (await fetchLiveQueue(request)).findIndex((track) => track.url === trackUrl)
  if (trackIndex < 0) {
    helperAddedTrackUrls.delete(trackUrl)
    return
  }

  await postLiveCommand(
    request,
    queueRemoveApiUrl,
    { trackIndex },
    `removing queue index ${String(trackIndex)}`,
  )
  helperAddedTrackUrls.delete(trackUrl)

  await expect
    .poll(async () => (await fetchLiveQueue(request)).some((track) => track.url === trackUrl), {
      message: `${LIVE_SETUP_PREFIX}: expected ${trackUrl} to leave the live queue`,
      timeout: 15_000,
    })
    .toBe(false)
}

const setLiveRadioMode = async (request: APIRequestContext, enabled: boolean): Promise<void> => {
  await postLiveCommand(
    request,
    radioModeApiUrl,
    { enabled },
    `switching radio mode ${enabled ? 'on' : 'off'}`,
  )
}

const fetchLivePlaybackStatus = async (request: APIRequestContext): Promise<string | undefined> => {
  const response = await request.get(playbackStatusApiUrl)
  if (!response.ok()) {
    return undefined
  }

  const body: unknown = await response.json()
  return isObject(body) && typeof body['status'] === 'string' ? body['status'] : undefined
}

const pauseLivePlaybackIfPlaying = async (request: APIRequestContext): Promise<void> => {
  if ((await fetchLivePlaybackStatus(request)) !== 'playing') {
    return
  }

  await postLiveCommand(request, playbackPauseApiUrl, {}, 'pausing live playback')
}

const appendLiveQueueTrack = async (
  request: APIRequestContext,
  spec: LiveTrackSearchSpec,
  what: string,
): Promise<LiveQueueTrackSnapshot> => {
  const found = await findLiveSearchTrack(request, spec)
  if (found === undefined) {
    throw new Error(
      `${LIVE_SETUP_PREFIX}: the live stack offered no ${what} outside the current queue (tried ${spec.queries.join(', ')})`,
    )
  }

  return await addLiveQueueTrack(request, found.url)
}

/**
 * LMS only makes a track current when it lands in an empty queue — so every
 * track appended afterwards is guaranteed not to be the playing one.
 */
const ensureNonEmptyLiveQueue = async (
  request: APIRequestContext,
): Promise<readonly LiveQueueTrackSnapshot[]> => {
  const queue = await fetchLiveQueue(request)
  if (queue.length > 0) {
    return queue
  }

  await appendLiveQueueTrack(
    request,
    {
      queries: LIBRARY_TRACK_FALLBACK_QUERIES,
      sources: ['local', 'tidal', 'qobuz'],
      excludedUrls: new Set<string>(),
    },
    'playable track',
  )

  return await fetchLiveQueue(request)
}

const establishUserTrackToRemove = async (
  request: APIRequestContext,
): Promise<LiveQueueTrackSnapshot> => {
  // Radio off first — it also deletes the upcoming radio segment, so this
  // scenario hands the test a queue of user-added tracks with nothing
  // replenishing underneath the removal it is about to make.
  await setLiveRadioMode(request, false)

  const queue = await ensureNonEmptyLiveQueue(request)
  return await appendLiveQueueTrack(
    request,
    {
      queries: buildSearchQueries(queue, LIBRARY_TRACK_FALLBACK_QUERIES),
      sources: ['local', 'tidal', 'qobuz'],
      excludedUrls: collectQueueUrls(queue),
    },
    'library track',
  )
}

const establishRadioSegment = async (
  request: APIRequestContext,
  seedQueue: readonly LiveQueueTrackSnapshot[],
): Promise<void> => {
  const usedSeedUrls = new Set<string>()

  for (let attempt = 0; attempt < RADIO_SEED_ATTEMPTS; attempt += 1) {
    const queue = await fetchLiveQueue(request)
    const radioTracksBefore = countRadioTracks(queue)
    if (radioTracksBefore >= MIN_ESTABLISHED_RADIO_TRACKS) {
      return
    }

    const seed = await findLiveSearchTrack(request, {
      queries: buildSearchQueries(seedQueue, RADIO_SEED_FALLBACK_QUERIES),
      sources: ['tidal', 'qobuz'],
      excludedUrls: new Set([...collectQueueUrls(queue), ...usedSeedUrls]),
    })
    if (seed === undefined) {
      throw new Error(
        `${LIVE_SETUP_PREFIX}: no streaming track available to seed radio replenishment — only removing one triggers the pipeline that marks tracks as radio-added`,
      )
    }
    usedSeedUrls.add(seed.url)

    await addLiveQueueTrack(request, seed.url)
    await removeLiveQueueTrackByUrl(request, seed.url)

    try {
      await expect
        .poll(async () => countRadioTracks(await fetchLiveQueue(request)), {
          message: `${LIVE_SETUP_PREFIX}: expected removing "${seed.artist} – ${seed.title}" to grow the radio segment`,
          timeout: RADIO_REPLENISH_TIMEOUT_MS,
        })
        .toBeGreaterThan(radioTracksBefore)
    } catch {
      // last.fm may know nothing about this seed; the next candidate gets a turn.
      continue
    }
  }

  const radioTracks = countRadioTracks(await fetchLiveQueue(request))
  if (radioTracks < MIN_ESTABLISHED_RADIO_TRACKS) {
    throw new Error(
      `${LIVE_SETUP_PREFIX}: ${String(RADIO_SEED_ATTEMPTS)} seeds produced only ${String(radioTracks)} of ${String(MIN_ESTABLISHED_RADIO_TRACKS)} radio-added tracks — the live stack cannot replenish right now`,
    )
  }
}

const establishRadioTrackToRemove = async (
  request: APIRequestContext,
): Promise<LiveQueueTrackSnapshot> => {
  const playbackBeforeSetup = await fetchLivePlaybackStatus(request)
  const queue = await ensureNonEmptyLiveQueue(request)

  await setLiveRadioMode(request, true)
  await establishRadioSegment(request, queue)

  // The replenish pipeline resumes a *stopped* player once it has queued
  // something. This runs against real speakers, so undo that.
  if (playbackBeforeSetup !== 'playing') {
    await pauseLivePlaybackIfPlaying(request)
  }

  const radioTrack = (await fetchLiveQueue(request)).find(
    (track) => isRadioTrack(track) && !track.isCurrent,
  )
  if (radioTrack === undefined) {
    throw new Error(
      `${LIVE_SETUP_PREFIX}: no removable radio track left — the segment either disappeared between being built and being read, or the player moved into it`,
    )
  }

  return radioTrack
}

const SWEEP_PASSES = 3
const SWEEP_SETTLE_MS = 3_000

const delay = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Switching radio mode off only removes the radio tracks the engine knew about
 * when it read its state — a replenish that lands a moment later survives, and
 * a measured run left "blink-182 – All The Small Things" in the household queue
 * exactly that way. So sweep for anything the queue did not hold when this run
 * started, and sweep once more after a settle to catch the late arrival.
 */
const removeTracksAddedSinceBaseline = async (request: APIRequestContext): Promise<void> => {
  const baselineUrls = householdBaselineUrls
  if (baselineUrls === undefined) {
    return
  }

  for (let pass = 0; pass < SWEEP_PASSES; pass += 1) {
    if (pass > 0) {
      await delay(SWEEP_SETTLE_MS)
    }

    const strayTrackUrls = (await fetchLiveQueue(request)).flatMap((track) =>
      track.url === undefined || baselineUrls.has(track.url) ? [] : [track.url],
    )

    if (strayTrackUrls.length === 0 && pass > 0) {
      return
    }

    for (const trackUrl of strayTrackUrls) {
      await removeLiveQueueTrackByUrl(request, trackUrl)
    }
  }
}

/**
 * Restores the live stack to how a run found it: playback paused, radio mode
 * off (which deletes the radio tracks the setup provoked), every track this
 * helper appended removed again, and every track that appeared while the run
 * lasted swept out. Never throws — a cleanup failure must not overwrite the
 * test failure that is the actual news.
 */
export const restoreLiveQueueBaseline = async (request: APIRequestContext): Promise<void> => {
  if (!hasMutatedLiveStack) {
    return
  }

  try {
    await pauseLivePlaybackIfPlaying(request)
    await setLiveRadioMode(request, false)

    const pendingTrackUrls = [...helperAddedTrackUrls]
    for (const trackUrl of pendingTrackUrls) {
      await removeLiveQueueTrackByUrl(request, trackUrl)
    }

    await removeTracksAddedSinceBaseline(request)

    hasMutatedLiveStack = false
  } catch (error) {
    console.warn(
      `${LIVE_SETUP_PREFIX}: cleanup could not fully restore the live stack:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}

export const ensureQueueEditingState = async ({
  page,
  request,
  scenario,
}: {
  readonly page: Page
  readonly request: APIRequestContext
  readonly scenario: LiveQueueScenario
}): Promise<LiveQueueSetupResult> => {
  await seedSelectedLiveUser(page, request)
  householdBaselineUrls ??= collectQueueUrls(await fetchLiveQueue(request))

  const removableTrack =
    scenario === 'radio-track-removal'
      ? await establishRadioTrackToRemove(request)
      : await establishUserTrackToRemove(request)

  await clearBrowserOfflineState(page)
  await expectNoUserSelectDialog(page)
  await page.goto('/queue')
  await waitForQueueViewRoute(page)

  const browserQueue = await waitForQueueDomToMatchApi(page, request)
  const initialQueue = await fetchLiveQueue(request)

  return {
    initialQueue,
    browserQueue,
    removableTrack,
    radioTrackCount: countRadioTracks(initialQueue),
    radioBoundaryVisible: browserQueue.radioBoundaryVisible,
  }
}
