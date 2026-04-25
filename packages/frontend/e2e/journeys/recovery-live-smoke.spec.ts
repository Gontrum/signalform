/**
 * Live Smoke Tests — NOT part of the standard mocked E2E suite.
 *
 * These tests run against a REAL local stack (frontend + backend + LMS).
 * They will fail in CI unless a live LMS is configured.
 *
 * Run separately with:
 *   PLAYWRIGHT_LIVE_BACKEND_URL=http://localhost:3001 pnpm test:e2e -- journeys/recovery-live-smoke.spec.ts
 *
 * They are NOT skipped automatically — they will simply fail if the real
 * stack is not available. This is intentional: live smoke tests should be
 * run manually before releases, not as part of automated CI.
 *
 * For mocked E2E tests that run without a real LMS, see the other journey specs.
 */
import { test, expect } from '@playwright/test'

test.describe('Recovery live smoke', () => {
  test('healthy home shell loads against the real local stack', async ({ page, request }) => {
    const pageErrors: readonly string[] = []
    const consoleErrors: readonly string[] = []
    const failedRequests: readonly string[] = []
    const apiRequests: readonly string[] = []
    const socketRequests: readonly string[] = []

    page.on('pageerror', (error) => {
      ;(pageErrors as string[]).push(error.message)
    })

    page.on('console', (message) => {
      if (message.type() === 'error') {
        ;(consoleErrors as string[]).push(message.text())
      }
    })

    page.on('request', (requestEvent) => {
      const url = requestEvent.url()

      if (url.includes('/api/')) {
        ;(apiRequests as string[]).push(url)
      }

      if (url.includes('/socket.io/')) {
        ;(socketRequests as string[]).push(url)
      }
    })

    page.on('requestfailed', (requestEvent) => {
      const failure = requestEvent.failure()
      ;(failedRequests as string[]).push(
        `${requestEvent.method()} ${requestEvent.url()} :: ${failure?.errorText ?? 'unknown failure'}`,
      )
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/$/)
    await expect(page).toHaveTitle('Signalform')
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      'Signalform',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Signalform Music Player',
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171717')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icon-192.png',
    )
    await expect(page.locator('[data-testid="main-nav"]')).toBeVisible()
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="search-input"]')).toBeEnabled()
    const nowPlayingPanel = page.locator('[data-testid="now-playing-panel"]')
    await expect(nowPlayingPanel).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Now Playing' })).toBeVisible()
    await expect(
      nowPlayingPanel.filter({
        has: page.getByRole('status').filter({ hasText: /^Now playing:/ }),
      }),
    )
      .toBeVisible({ timeout: 5_000 })
      .catch(async () => {
        await expect(page.getByRole('heading', { name: 'No track playing' })).toBeVisible()
        await expect(nowPlayingPanel).toContainText('Search and play music to see it here')
      })

    await expect(page.locator('[data-testid="setup-wizard"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="offline-page"]')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/setup$/)

    // API and socket.io requests must arrive at the backend-served origin (port 3001).
    // No cross-origin split: nothing should go to port 3000.
    await expect.poll(() => apiRequests.length, { timeout: 15_000 }).toBeGreaterThan(0)
    await expect.poll(() => socketRequests.length, { timeout: 15_000 }).toBeGreaterThan(0)

    expect(apiRequests.some((url) => url.startsWith('http://127.0.0.1:3001/api/'))).toBe(true)
    expect(apiRequests.some((url) => url.startsWith('http://127.0.0.1:3000/api/'))).toBe(false)
    expect(apiRequests.some((url) => url.startsWith('http://localhost:3001/api/'))).toBe(false)
    expect(socketRequests.some((url) => url.startsWith('http://127.0.0.1:3001/socket.io/'))).toBe(
      true,
    )
    expect(socketRequests.some((url) => url.startsWith('http://127.0.0.1:3000/socket.io/'))).toBe(
      false,
    )
    expect(socketRequests.some((url) => url.startsWith('http://localhost:3001/socket.io/'))).toBe(
      false,
    )

    // Static assets served from the same backend origin.
    const manifestResponse = await request.get('http://127.0.0.1:3001/manifest.json')
    expect(manifestResponse.ok()).toBe(true)
    expect(manifestResponse.headers()['content-type']).toContain('application/json')

    const manifestBody = (await manifestResponse.json()) as {
      readonly name: string
      readonly short_name: string
      readonly icons: readonly {
        readonly src: string
        readonly type: string
      }[]
    }

    expect(manifestBody.name).toBe('Signalform Music Player')
    expect(manifestBody.short_name).toBe('Signalform')
    expect(manifestBody.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/favicon.ico',
          type: 'image/x-icon',
        }),
        expect.objectContaining({
          src: '/icon-192.png',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: '/icon-512.png',
          type: 'image/png',
        }),
      ]),
    )

    const faviconResponse = await request.get('http://127.0.0.1:3001/favicon.ico')
    expect(faviconResponse.ok()).toBe(true)
    expect(faviconResponse.headers()['content-type']).toContain('image/')
    expect((await faviconResponse.body()).byteLength).toBeGreaterThan(0)

    const icon192Response = await request.get('http://127.0.0.1:3001/icon-192.png')
    expect(icon192Response.ok()).toBe(true)
    expect(icon192Response.headers()['content-type']).toContain('image/png')
    expect((await icon192Response.body()).byteLength).toBeGreaterThan(0)

    const icon512Response = await request.get('http://127.0.0.1:3001/icon-512.png')
    expect(icon512Response.ok()).toBe(true)
    expect(icon512Response.headers()['content-type']).toContain('image/png')
    expect((await icon512Response.body()).byteLength).toBeGreaterThan(0)

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return false
      }

      const registration = await navigator.serviceWorker.ready
      return registration.active !== null
    })

    expect(swRegistered).toBe(true)

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(
      failedRequests.filter(
        (message) =>
          !message.includes('/favicon.ico') &&
          !message.includes('/icon-192.png') &&
          !message.includes('/icon-512.png'),
      ),
    ).toEqual([])

    // Backend truth surfaces — all on the same origin.
    const healthResponse = await request.get('http://127.0.0.1:3001/health')
    expect(healthResponse.ok()).toBe(true)

    const healthBody = (await healthResponse.json()) as {
      readonly status: string
      readonly dependencies?: {
        readonly lms?: string
        readonly lastfm?: string
      }
    }

    expect(['healthy', 'degraded']).toContain(healthBody.status)
    expect(healthBody.dependencies?.lms).toBe('connected')
    expect(['available', 'circuit open', 'degraded']).toContain(
      healthBody.dependencies?.lastfm ?? '',
    )

    const configResponse = await request.get('http://127.0.0.1:3001/api/config')
    expect(configResponse.ok()).toBe(true)

    const configBody = (await configResponse.json()) as {
      readonly lmsHost: string
      readonly lmsPort: number
      readonly playerId: string
      readonly hasLastFmKey: boolean
      readonly hasFanartKey: boolean
      readonly isConfigured: boolean
      readonly configuredAt?: string
      readonly language?: string
      readonly lastFmApiKey?: unknown
      readonly fanartApiKey?: unknown
    }

    expect(configBody.isConfigured).toBe(true)
    expect(configBody.lmsHost.length).toBeGreaterThan(0)
    expect(configBody.lmsPort).toBeGreaterThan(0)
    expect(configBody.playerId.length).toBeGreaterThan(0)
    expect(typeof configBody.hasLastFmKey).toBe('boolean')
    expect(typeof configBody.hasFanartKey).toBe('boolean')
    expect(['en', 'de']).toContain(configBody.language)
    expect(configBody).not.toHaveProperty('lastFmApiKey')
    expect(configBody).not.toHaveProperty('fanartApiKey')

    const discoverResponse = await request.get('http://127.0.0.1:3001/api/setup/discover')
    expect(discoverResponse.ok()).toBe(true)

    const discoverBody = (await discoverResponse.json()) as {
      readonly servers?: readonly unknown[]
    }

    expect(Array.isArray(discoverBody.servers)).toBe(true)

    // Offline page served from the same backend origin.
    const offlineResponse = await request.get('http://127.0.0.1:3001/offline.html')
    expect(offlineResponse.ok()).toBe(true)
    expect(offlineResponse.headers()['content-type']).toContain('text/html')

    await page.goto('/offline.html')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveTitle('Offline — Signalform')

    const offlinePage = page.locator('[data-testid="offline-page"]')
    await expect(offlinePage).toBeVisible()
    await expect(offlinePage).toContainText("You're offline")
    await expect(offlinePage).toContainText(
      "Signalform needs a connection to your music server. Check that you're on the same network and try again.",
    )
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})
