/**
 * Screenshot-only spec — not part of the CI suite.
 * Run manually after changing the settings UI:
 *
 *   cd packages/frontend
 *   pnpm exec playwright test e2e/screenshot-settings.spec.ts --project chromium
 *
 * Saves to docs/images/readme/settings.png (repo root).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'
import { setupApiMocks } from './helpers/mockApi.ts'

const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/images/readme/settings.png',
)

const demoConfig = {
  lmsHost: 'music-server.local',
  lmsPort: 9000,
  playerId: 'player-living-room',
  hasLastFmKey: true,
  hasLastFmSharedSecret: true,
  hasFanartKey: true,
  isConfigured: true,
  language: 'en' as const,
  lastFmUsername: 'demo_user',
  hasLastFmSession: true,
  personalRadioEnabled: true,
  scrobblingEnabled: true,
  personalRadioDiscovery: 30,
}

test('screenshot: settings page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1150 })
  await setupApiMocks(page, { config: demoConfig })
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-view').waitFor({ state: 'visible' })
  // Let all sections render
  await page.waitForTimeout(400)

  await page.screenshot({ path: OUTPUT })
  console.log(`Saved → ${OUTPUT}`)
})
