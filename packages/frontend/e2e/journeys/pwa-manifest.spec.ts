/**
 * PWA Manifest & Meta Tags (S01/M003)
 *
 * Verifies that the app has the required PWA and iOS meta tags.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('PWA Manifest & Meta Tags', () => {
  test('has manifest link in <head>', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')

    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json')
  })

  test('has apple-mobile-web-app-capable meta tag', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')

    const meta = page.locator('meta[name="apple-mobile-web-app-capable"]')
    await expect(meta).toHaveAttribute('content', 'yes')
  })

  test('has apple-mobile-web-app-title meta tag', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')

    const meta = page.locator('meta[name="apple-mobile-web-app-title"]')
    await expect(meta).toHaveAttribute('content', 'Signalform')
  })

  test('html element has lang=en', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')

    const lang = await page.evaluate(() => document.documentElement.lang)
    expect(lang).toBe('en')
  })

  test('manifest.json is valid JSON with required fields', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/manifest.json')

    const content = await page.evaluate(() => document.body.innerText)
    const manifest = JSON.parse(content) as Record<string, unknown>
    const icons = manifest['icons'] as readonly Record<string, unknown>[]

    expect(manifest['name']).toBe('Signalform Music Player')
    expect(manifest['short_name']).toBe('Signalform')
    expect(manifest['display']).toBe('standalone')
    expect(manifest['theme_color']).toBeTruthy()
    expect(Array.isArray(icons)).toBe(true)
    expect(icons).toEqual(
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
  })
})
