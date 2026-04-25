/**
 * Pinia store injection helper for E2E tests.
 *
 * Uses page.evaluate() to access the Vue app's Pinia instance
 * and directly set store state — bypassing the need for real WebSocket events.
 *
 * This is the recommended approach per Story 9.10 Dev Notes.
 */
import type { Page } from '@playwright/test'

/**
 * Set the radioBoundaryIndex on the queue Pinia store.
 * Triggers Vue reactivity so data-testid="radio-boundary" becomes visible.
 *
 * @param page - Playwright Page instance
 * @param index - The queue index at which radio mode begins
 */
export const setRadioBoundaryIndex = async (page: Page, index: number): Promise<void> => {
  await page.evaluate((boundaryIndex: number) => {
    const appEl = document.querySelector('#app')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (appEl as any)?.__vue_app__
    if (!app) {
      throw new Error('Vue app not found on #app element')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pinia = app.config.globalProperties.$pinia as any
    if (!pinia) {
      throw new Error('Pinia not found on Vue app')
    }
    // Queue store is registered as 'queue' in defineStore('queue', ...)
    // NOTE: _s is Pinia's internal store registry (Map<id, store>) — not a public API.
    // Tested with Pinia ^2.x. If this breaks after a Pinia upgrade, use the
    // fallback approach documented in Story 9.10 Dev Notes (window.__TEST_RADIO_BOUNDARY__).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queueStore = pinia._s.get('queue') as any
    if (!queueStore) {
      throw new Error('Queue store not found in Pinia')
    }
    // Direct mutation of the Pinia ref — triggers Vue reactivity
    queueStore.radioBoundaryIndex = boundaryIndex
  }, index)
}
