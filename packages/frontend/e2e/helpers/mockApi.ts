/**
 * Playwright network mock helpers for E2E tests.
 *
 * Strategy: intercept api paths only (not page resources), then dispatch
 * by URL inside a single handler to avoid route ordering issues.
 */
import type { Page, Route, Request } from '@playwright/test'
import {
  emptyAutocompleteResponse,
  libraryAlbumsResponse,
  singleTrackQueueResponse,
  defaultConfigResponse,
} from './fixtures.ts'

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { readonly [key: string]: JsonValue }
type JsonArray = readonly JsonValue[]

const fulfill200 = async (route: Route, body: JsonValue): Promise<void> => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

// ── Mock setup types ─────────────────────────────────────────────────────────

export interface ApiMocks {
  readonly search?: JsonObject
  readonly albumDetail?: JsonObject
  readonly libraryAlbums?: JsonObject
  readonly queue?: JsonValue
  readonly playbackStatus?: JsonObject
}

/**
 * Register route handlers for all API requests and suppress socket.io.
 * Page resources (HTML, JS, CSS) are NOT intercepted — only API calls.
 * Dispatch is done by URL inside the handler to avoid LIFO ordering issues.
 *
 * Also aborts socket.io connection attempts — no backend runs in E2E tests,
 * so we abort cleanly rather than waiting for connection timeouts.
 */
export const setupApiMocks = async (page: Page, mocks: ApiMocks = {}): Promise<void> => {
  // Config state — mutable so PUT updates survive page.reload() within the same test.
  // Declared in the closure so each test gets its own independent copy.
  let currentConfig = { ...defaultConfigResponse }

  // Abort socket.io requests — suppresses WS connection errors in E2E (no backend)
  await page.route(
    (url: URL) => url.pathname.startsWith('/socket.io'),
    (route: Route) => {
      void route.abort()
    },
  )

  // Use a URL predicate: only intercept paths that START with /api/
  // (avoids intercepting Vite source module URLs like /src/api/albumApi.ts)
  await page.route(
    (url: URL) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const requestUrl = new URL(route.request().url())
      const pathname = requestUrl.pathname
      const method = route.request().method()

      // Autocomplete — always return empty to suppress background calls
      if (pathname === '/api/search/autocomplete') {
        await fulfill200(route, emptyAutocompleteResponse)
        return
      }

      // Full search (POST /api/search)
      if (pathname === '/api/search' && method === 'POST' && mocks.search) {
        await fulfill200(route, mocks.search)
        return
      }

      // Album detail (GET /api/album/:id — note: singular "album")
      if (pathname.startsWith('/api/album/') && method === 'GET' && mocks.albumDetail) {
        await fulfill200(route, mocks.albumDetail)
        return
      }

      // Library albums (GET /api/library/albums)
      if (pathname === '/api/library/albums' && method === 'GET') {
        await fulfill200(route, mocks.libraryAlbums ?? libraryAlbumsResponse)
        return
      }

      // Queue (GET /api/queue) — only the bare /queue endpoint, not /queue/...
      if (pathname === '/api/queue' && method === 'GET') {
        await fulfill200(route, mocks.queue ?? singleTrackQueueResponse)
        return
      }

      // Playback status (GET /api/playback/status)
      if (pathname === '/api/playback/status' && method === 'GET' && mocks.playbackStatus) {
        await fulfill200(route, mocks.playbackStatus)
        return
      }

      // Playback volume (GET /api/playback/volume)
      if (pathname === '/api/playback/volume' && method === 'GET') {
        await fulfill200(route, { level: 70 })
        return
      }

      // Config (GET /api/config) — settings view requires a Zod-valid response.
      // Returns currentConfig so language changes from PUT survive page.reload().
      if (pathname === '/api/config' && method === 'GET') {
        await fulfill200(route, currentConfig)
        return
      }

      // Config update (PUT /api/config) — merge into currentConfig so subsequent
      // GETs (including after page.reload()) return the updated language/settings.
      if (pathname === '/api/config' && method === 'PUT') {
        const body = route.request().postDataJSON() as Partial<typeof defaultConfigResponse>
        currentConfig = { ...currentConfig, ...body }
        await fulfill200(route, currentConfig)
        return
      }

      // Default: return 200 OK with empty body for all other /api/** requests
      // (POST playback endpoints, POST queue/add, POST queue/jump, etc.)
      await fulfill200(route, {})
    },
  )
}

/**
 * Capture a request to a specific URL pattern and return it.
 *
 * @param page - Playwright Page instance
 * @param urlPattern - Substring to match against the request URL
 * @param method - HTTP method to match (default: 'POST')
 */
export const captureRequest = (
  page: Page,
  urlPattern: string,
  method = 'POST',
): Promise<Request> => {
  return page.waitForRequest(
    (req: Request) => req.url().includes(urlPattern) && req.method() === method,
  )
}
