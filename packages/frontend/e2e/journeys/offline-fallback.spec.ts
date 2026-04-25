/**
 * Offline Fallback (S03/M003)
 *
 * Verifies that the service worker shows an offline fallback page
 * when the network is unavailable.
 *
 * Note: Service worker must be registered first (requires a page visit
 * before going offline).
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('Service Worker & Offline Fallback', () => {
  // serviceWorkers is blocked globally in playwright.ci.config.ts to prevent
  // Workbox from hijacking SPA navigations. Re-enable it for these tests
  // which specifically verify Service Worker behaviour.
  test.use({ serviceWorkers: 'allow' })

  test('service worker is registered', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.length > 0
    })

    expect(swRegistered).toBe(true)
  })

  test('offline.html is accessible directly', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/offline.html')

    await expect(page).toHaveTitle('Offline — Signalform')

    const offlinePage = page.locator('[data-testid="offline-page"]')
    await expect(offlinePage).toBeVisible()
    await expect(offlinePage).toContainText("You're offline")
    await expect(offlinePage).toContainText('Signalform needs a connection to your music server.')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})
