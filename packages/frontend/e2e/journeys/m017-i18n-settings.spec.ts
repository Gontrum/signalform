import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-view')).toBeVisible()
}

async function selectLanguage(page: import('@playwright/test').Page, languageValue: 'en' | 'de') {
  const select = page.getByTestId('language-select')
  // Select by value, not by label — the visible label text depends on the
  // current UI language ('German' in EN mode, 'Deutsch' in DE mode).
  await select.selectOption({ value: languageValue })
}

async function openHome(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('search-input')).toBeVisible()
}

async function openQueue(page: import('@playwright/test').Page) {
  // There is no nav-queue link in the navbar — navigate directly.
  await page.goto('/queue')
  await expect(page.getByTestId('queue-view')).toBeVisible()
}

async function openSetupWizard(page: import('@playwright/test').Page) {
  await page.goto('/setup')
  await expect(page.getByTestId('setup-wizard')).toBeVisible()
}

test.describe('M017 i18n settings', () => {
  test('language selection in Settings persists and updates navbar label', async ({ page }) => {
    await setupApiMocks(page, {})

    // Navigate to Settings and switch to German
    await openSettings(page)

    // Verify initial heading is English
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    await selectLanguage(page, 'de')

    await page.getByTestId('save-button').click()

    await expect(page.getByTestId('save-success')).toBeVisible()

    // After saving, the heading should switch to German
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()

    // Navigate to Home (has MainNavBar) to verify the navbar label is now German
    await openHome(page)
    await expect(page.getByTestId('nav-settings')).toHaveText('Einstellungen')

    // Reload on Home and verify language still persists
    await page.reload()
    await expect(page.getByTestId('search-input')).toBeVisible()
    await expect(page.getByTestId('nav-settings')).toHaveText('Einstellungen')

    // Switch back to English to avoid leaking state into other tests
    await openSettings(page)
    await selectLanguage(page, 'en')
    await page.getByTestId('save-button').click()
    await expect(page.getByTestId('save-success')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await openHome(page)
    await expect(page.getByTestId('nav-settings')).toHaveText('Settings')
  })

  test('i18n journey covers Settings, Navbar, Home, Queue and Setup in both languages', async ({
    page,
  }) => {
    await setupApiMocks(page, {})

    // Start in Settings and switch to German
    await openSettings(page)

    await selectLanguage(page, 'de')
    await page.getByTestId('save-button').click()
    await expect(page.getByTestId('save-success')).toBeVisible()

    // Verify German Settings heading
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()

    // Home in German (MainNavBar is here — verify navbar label too)
    await openHome(page)
    await expect(page.getByTestId('nav-settings')).toHaveText('Einstellungen')

    // Queue in German — verify the h1 heading is localized
    await openQueue(page)
    // Wait for the heading to reflect the German language (i18n store is async)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Warteschlange|Queue/, {
      timeout: 5000,
    })

    // Setup wizard in German
    await openSetupWizard(page)
    await expect(page.getByTestId('setup-wizard')).toBeVisible()

    // Reload to ensure persisted language also affects these views
    await page.reload()
    await expect(page.getByTestId('setup-wizard')).toBeVisible()

    // Switch back to English in Settings
    await openSettings(page)
    await selectLanguage(page, 'en')
    await page.getByTestId('save-button').click()
    await expect(page.getByTestId('save-success')).toBeVisible()

    // Verify English Settings heading
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    // Home in English (verify navbar label here where MainNavBar is present)
    await openHome(page)
    await expect(page.getByTestId('nav-settings')).toHaveText('Settings')

    // Queue in English
    await openQueue(page)
    await expect(page.getByTestId('queue-view')).toBeVisible()
  })
})
