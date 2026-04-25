import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { isLiveBackendAvailable } from '../helpers/fixtures.ts'
import { setupApiMocks } from '../helpers/mockApi.ts'

const skipUnlessLiveBackendAvailable = async (request: APIRequestContext): Promise<void> => {
  test.skip(
    !(await isLiveBackendAvailable(request)),
    'Skipped: no live LMS backend available (requires real library + Last.fm data)',
  )
}

async function openSettings(page: Page) {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-view')).toBeVisible()
}

async function selectLanguage(page: Page, value: 'en' | 'de') {
  // Select by value, not by label — the visible label text depends on the
  // current UI language ('German' in EN mode, 'Deutsch' in DE mode).
  await page.getByTestId('language-select').selectOption({ value })
  await page.getByTestId('save-button').click()
  await expect(page.getByTestId('save-success')).toBeVisible()
}

async function openUnifiedArtistView(page: Page, name: string) {
  await page.getByTestId('nav-search').click()
  await expect(page.getByRole('heading', { level: 1, name: /Start|Startseite/ })).toBeVisible()

  const searchInput = page.getByPlaceholder(
    /Search albums, artists or tracks…|Alben, Künstler oder Titel suchen…/,
  )
  await searchInput.fill(name)
  await expect(page.getByText(/Results for|Ergebnisse für/)).toBeVisible()

  await page.getByTestId('artist-result-item').first().click()
  await expect(page.getByTestId('unified-artist-view')).toBeVisible()
}

async function openAlbumDetailFromLibrary(page: Page) {
  // assume at least one local album for the test artist
  await expect(page.getByTestId('local-section')).toBeVisible()
  await page.getByTestId('local-album-item').first().click()
  await expect(page.getByTestId('album-detail-view')).toBeVisible()
}

async function assertArtistEnrichmentErrorTexts(page: Page, language: 'en' | 'de') {
  const notFoundLocator = page.getByTestId('enrichment-error-not-found')
  const unavailableLocator = page.getByTestId('enrichment-error-unavailable')

  // We don't control backend fixture here, so assert that when errors are rendered
  // their texts are localized according to the active language, not the exact wording.
  if (language === 'en') {
    await expect(notFoundLocator.or(unavailableLocator)).toHaveText(new RegExp('artist', 'i'))
  } else {
    await expect(notFoundLocator.or(unavailableLocator)).toHaveText(
      /Künstler|Künstlerinformationen/,
    )
  }
}

async function assertAlbumEnrichmentErrorTexts(page: Page, language: 'en' | 'de') {
  const notFoundLocator = page.getByTestId('album-enrichment-error-not-found')
  const unavailableLocator = page.getByTestId('album-enrichment-error-unavailable')

  if (language === 'en') {
    await expect(notFoundLocator.or(unavailableLocator)).toHaveText(new RegExp('album', 'i'))
  } else {
    await expect(notFoundLocator.or(unavailableLocator)).toHaveText(/Albuminformationen/)
  }
}

async function waitForAnyEnrichmentOutcome(page: Page) {
  // Either enrichment content, not-found, unavailable or skeleton disappearing
  const bio = page.getByTestId('enrichment-bio')
  const notFound = page.getByTestId('enrichment-error-not-found')
  const unavailable = page.getByTestId('enrichment-error-unavailable')
  const skeleton = page.getByTestId('enrichment-skeleton')

  await Promise.race([
    bio
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    notFound
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    unavailable
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    skeleton
      .first()
      .waitFor({ state: 'hidden' })
      .catch(() => {}),
  ])
}

async function waitForAnyAlbumEnrichmentOutcome(page: Page) {
  const wiki = page.getByTestId('enrichment-wiki')
  const notFound = page.getByTestId('album-enrichment-error-not-found')
  const unavailable = page.getByTestId('album-enrichment-error-unavailable')
  const skeleton = page.getByTestId('album-enrichment-skeleton')

  await Promise.race([
    wiki
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    notFound
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    unavailable
      .first()
      .waitFor({ state: 'visible' })
      .catch(() => {}),
    skeleton
      .first()
      .waitFor({ state: 'hidden' })
      .catch(() => {}),
  ])
}

async function assertArtistAndAlbumEnrichmentHeadings(page: Page, language: 'en' | 'de') {
  const artistHeading = page.getByTestId('artist-enrichment-heading')
  const albumHeading = page.getByTestId('album-enrichment-heading')

  if (language === 'en') {
    await expect(artistHeading).toHaveText('Artist biography')
    await expect(albumHeading).toHaveText('Album notes')
  } else {
    await expect(artistHeading).toHaveText('Künstlerbiografie')
    await expect(albumHeading).toHaveText('Albumnotizen')
  }
}

// Note: These tests rely on the configured LMS test library and last.fm API stub
// responding deterministically for the seeded demo artist/album used in other
// journeys. We only assert relative localization (English vs German) for headings
// and any displayed error messages, not the presence of specific bios/wiki text.

test.describe('M017 i18n enrichment', () => {
  test('localized enrichment headings and error messages for artist + album', async ({
    page,
    request,
  }) => {
    // This test requires a live LMS backend with real library data and Last.fm API access.
    await skipUnlessLiveBackendAvailable(request)
    await setupApiMocks(page, {})

    // Switch to German and navigate to an artist with enrichment
    await openSettings(page)
    await selectLanguage(page, 'de')

    // Open artist from search and wait for enrichment outcome
    await openUnifiedArtistView(page, 'The Beatles')
    await waitForAnyEnrichmentOutcome(page)

    // Headings and any error messages should be localized in German
    await assertArtistAndAlbumEnrichmentHeadings(page, 'de')
    await assertArtistEnrichmentErrorTexts(page, 'de')

    // Navigate into first local album and wait for album enrichment outcome
    await openAlbumDetailFromLibrary(page)
    await waitForAnyAlbumEnrichmentOutcome(page)
    await assertAlbumEnrichmentErrorTexts(page, 'de')

    // Switch back to English and re-visit the same artist
    await openSettings(page)
    await selectLanguage(page, 'en')

    await openUnifiedArtistView(page, 'The Beatles')
    await waitForAnyEnrichmentOutcome(page)

    await assertArtistAndAlbumEnrichmentHeadings(page, 'en')
    await assertArtistEnrichmentErrorTexts(page, 'en')

    await openAlbumDetailFromLibrary(page)
    await waitForAnyAlbumEnrichmentOutcome(page)
    await assertAlbumEnrichmentErrorTexts(page, 'en')
  })
})
