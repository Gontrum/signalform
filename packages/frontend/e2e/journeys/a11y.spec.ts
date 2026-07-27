/**
 * Permanent axe-core regression spec.
 *
 * Replaces the temporary, uncommitted audit spec that was used to produce
 * docs/review/02-ui.md. Every route below runs a broad, unrestricted
 * `.analyze()` scan (all axe rules, not a per-route allowlist) — see
 * docs/review/05-a11y-coverage.md for why the previous per-route `withRules`
 * allowlists were replaced: they existed only to dodge noise from the Vue
 * DevTools browser-extension panel (`aria-prohibited-attr`/`region` on its
 * floating `.vue-devtools__anchor-btn`), which `AxeBuilder.exclude()` filters
 * directly. Narrowing the rule set to work around that noise had the side
 * effect of silently allowing any new, unlisted-rule violation to pass —
 * `.exclude()` removes the noise without shrinking what's checked.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setupApiMocks } from '../helpers/mockApi.ts'
import {
  populatedAutocompleteResponse,
  emptyAutocompleteResponse,
  singleTrackQueueResponse,
  twoUsersResponse,
} from '../helpers/fixtures.ts'

const playingStatusWithProgressResponse = {
  status: 'playing',
  currentTime: 65,
  trackDuration: 240,
  volume: 70,
  currentTrack: {
    id: 'track-1',
    title: 'Money',
    artist: 'Pink Floyd',
    album: 'Dark Side of the Moon',
    url: 'file:///music/money.flac',
    source: 'local',
    // ProgressBar's trackDuration comes from currentTrack.duration (see
    // usePlaybackStore's setTrack), not the top-level trackDuration field —
    // kept equal to it here so the expected "1:05 / 4:00" is unambiguous.
    duration: 240,
  },
  queuePreview: [],
}

interface RouteCheck {
  readonly path: string
  readonly testid: string
}

const routes: readonly RouteCheck[] = [
  { path: '/', testid: 'search-container' },
  { path: '/library', testid: 'library-view' },
  { path: '/queue', testid: 'queue-view' },
  { path: '/settings', testid: 'settings-view' },
  { path: '/setup', testid: 'setup-wizard' },
  // Immersive route — bypasses AppLayout (see App.vue's isImmersiveRoute), so
  // it was previously outside this scan loop entirely. docs/review/04-a11y.md
  // finding #9 (missing <main>) sat undetected here for exactly that reason.
  { path: '/now-playing', testid: 'page-header' },
]

const breakpoints = [
  { name: 'phone (375x812)', width: 375, height: 812 },
  { name: 'tablet (768x1024)', width: 768, height: 1024 },
  { name: 'desktop (1440x900)', width: 1440, height: 900 },
]

for (const breakpoint of breakpoints) {
  test.describe(`a11y regression — ${breakpoint.name}`, () => {
    test.use({ viewport: { width: breakpoint.width, height: breakpoint.height } })

    for (const route of routes) {
      test(`${route.path} has no violations (broad scan, Vue DevTools excluded)`, async ({
        page,
      }) => {
        const isSearchRoute = route.path === '/'
        const isNowPlayingRoute = route.path === '/now-playing'
        await setupApiMocks(page, {
          ...(isSearchRoute ? { autocomplete: populatedAutocompleteResponse } : {}),
          ...(isNowPlayingRoute ? { playbackStatus: playingStatusWithProgressResponse } : {}),
        })
        await page.goto(route.path)
        await page.waitForSelector(`[data-testid="${route.testid}"]`)
        // Settle wait: confirmed still necessary even after fixing App.vue's
        // AppLayout remount bug (the key moved off AppLayout onto the routed
        // left-slot content, so NowPlayingPanel no longer remounts on SPA
        // navigation — see App.spec.ts's remount-guard test). That fix does
        // NOT apply here: each case above does a cold `page.goto`, not an
        // in-app client-side navigation, so there is no prior AppLayout
        // instance to persist across. Removing this wait reproduces 2 real
        // failures (tablet/desktop /settings) where MainNavBar's
        // `router-link-active` class is scanned mid-paint, on its own
        // initial mount, before the active-link background/text color
        // finishes settling — an unrelated, genuine async-render-pass delay
        // on first load, not navigation churn.
        await page.waitForTimeout(300)

        // Exercise the populated autocomplete dropdown state — this is the
        // state in which `<ul role="listbox">` is rendered and needs its
        // `aria-input-field-name` rule (moved-onto-listbox `aria-label`) checked.
        if (isSearchRoute) {
          await page.getByTestId('search-input').fill('nov')
          await page.waitForSelector('ul[role="listbox"]')
        }

        // Exercise an active (non-default) decade chip — this is the state
        // that needs its `color-contrast` rule checked. The default chip
        // (`all`) is already active on load and would not exercise the fix.
        // The click also reveals the "Clear all filters" button, whose own
        // contrast was fixed alongside the decade chip (see LibraryView.vue).
        // The extra wait lets the chip's `transition-colors` finish before
        // scanning — otherwise axe can sample an in-transition blended
        // color rather than the settled one.
        if (route.path === '/library') {
          await page.getByTestId('decade-chip-2020s').click()
          await page.waitForTimeout(300)
        }

        const results = await new AxeBuilder({ page })
          .exclude('.vue-devtools__anchor-btn')
          .analyze()

        expect(results.violations).toEqual([])

        // Exercise the empty-result autocomplete state — a state the scan
        // above never reaches (docs/review/04-a11y.md finding #7 lived here).
        // Registering an override route handler mid-test takes over
        // subsequent requests without disturbing the populated-state scan
        // above, which already completed (Playwright dispatches to the
        // most-recently-registered matching handler).
        if (isSearchRoute) {
          await page.route(
            (url) => url.pathname === '/api/search/autocomplete',
            async (route) => {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(emptyAutocompleteResponse),
              })
            },
          )

          await page.getByTestId('search-input').fill('')
          await page.getByTestId('search-input').fill('xyz')
          await page.waitForSelector('[data-testid="empty-state"]')

          const emptyStateResults = await new AxeBuilder({ page })
            .exclude('.vue-devtools__anchor-btn')
            .analyze()

          expect(emptyStateResults.violations).toEqual([])
        }
      })
    }
  })
}

// Behavioral regression for the autocomplete footer's DOM-nesting fix
// (docs/review/04-a11y.md, item 4). The axe `aria-required-parent` rule
// added to the '/' route case above catches the static ARIA-structure
// violation (the footer's role="option" now has a role="listbox" ancestor),
// but axe cannot verify that moving the footer <li> inside the <ul> left
// keyboard navigation (activeIndex math in useSearchPanel.ts) unaffected —
// that requires a real, keyboard-driven Playwright test.
test.describe('Autocomplete footer — keyboard navigation survives the DOM move into the listbox (docs/review/04-a11y.md, item 4)', () => {
  test('ArrowDown reaches the footer, wraps around, and Enter on the footer opens full results', async ({
    page,
  }) => {
    await setupApiMocks(page, { autocomplete: populatedAutocompleteResponse })
    await page.goto('/')

    const searchInput = page.getByTestId('search-input')
    await searchInput.fill('nov')
    await page.waitForSelector('ul[role="listbox"]')

    // Two suggestions (Nova Vale, Kite Harbor) → suggestion-item-0,
    // suggestion-item-1, and the footer is suggestion-item-2. ArrowDown
    // from the input lands on suggestion-item-0, a second ArrowDown lands
    // on suggestion-item-1, and a third ArrowDown should land on the
    // footer — confirming the DOM move didn't break the index math.
    await searchInput.press('ArrowDown')
    await searchInput.press('ArrowDown')
    await searchInput.press('ArrowDown')

    await expect(searchInput).toHaveAttribute('aria-activedescendant', 'suggestion-item-2')
    await expect(page.getByTestId('autocomplete-footer-hint')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // A 4th ArrowDown from the footer wraps back around to the first
    // suggestion — confirming wrap-around is unchanged by the move.
    await searchInput.press('ArrowDown')
    await expect(searchInput).toHaveAttribute('aria-activedescendant', 'suggestion-item-0')

    // Navigate back to the footer and press Enter — confirms Enter on the
    // footer still triggers the full-search path (handleEnterKey's
    // activeIndex === suggestions.length branch), not a suggestion select.
    // Currently on suggestion-item-0, so 2 more ArrowDowns reach the footer
    // (0 -> 1 -> 2/footer).
    await searchInput.press('ArrowDown')
    await searchInput.press('ArrowDown')
    await expect(searchInput).toHaveAttribute('aria-activedescendant', 'suggestion-item-2')

    await searchInput.press('Enter')

    await expect(page.getByTestId('full-results-list')).toBeVisible()
  })
})

// Behavioral regression for Popover.vue's Escape-to-close + focus-return fix
// (docs/review/04-a11y.md, item 2). This is not an axe scan — axe cannot
// detect missing keyboard-close behavior or lost focus, so it's a separate,
// targeted test rather than a widened rule set on an existing route case
// above. Driven through the queue overflow menu (Popover consumer in
// QueueView.vue) since /queue is already an existing route case and
// setupApiMocks defaults the queue mock to a single track.
test.describe('Popover — Escape closes and returns focus', () => {
  test('queue overflow menu closes on Escape and refocuses its trigger', async ({ page }) => {
    await setupApiMocks(page, { queue: singleTrackQueueResponse })
    await page.goto('/queue')
    await page.waitForSelector('[data-testid="queue-view"]')

    const trigger = page.getByTestId('queue-menu')
    await trigger.click()

    const panel = page.getByTestId('queue-menu-panel')
    await expect(panel).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // The keydown handler that closes the popover lives on the panel div
    // itself (role="menu"), so Escape only closes it while focus is inside
    // the panel — the same real keyboard flow docs/review/04-a11y.md
    // verified manually (Tab from the trigger lands on the first menu item).
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('playlists-toggle')).toBeFocused()

    await page.keyboard.press('Escape')

    await expect(panel).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    )
    expect(focusedTestId).toBe('queue-menu')
  })
})

// Behavioral regression for the hover-overlay-buttons-invisible-on-keyboard-
// focus fix (docs/review/04-a11y.md, item 3). axe cannot detect this bug
// class — it checks computed contrast/attributes, not "is this focused
// element visually hidden by opacity" — so this is a targeted Playwright
// test reading `getComputedStyle(...).opacity` directly, matching how the
// bug was originally screenshot-verified (real DOM focus + opacity still 0).
// Covered for both AlbumCard (grid) and AlbumListRow (list), since the
// report notes the bug was duplicated identically across both components.
test.describe('Hover-revealed action buttons stay visible on keyboard focus', () => {
  test('AlbumCard (grid view): hover overlay opacity is 1 once the play button has focus', async ({
    page,
  }) => {
    await setupApiMocks(page)
    await page.goto('/library')
    await page.waitForSelector('[data-testid="library-view"]')
    await page.waitForSelector('[data-testid="album-grid"]')

    // Focus the "navigate" region first (deterministic starting point), then
    // Tab once — the hover overlay is its next sibling in DOM order, so a
    // real Tab keypress lands on the play button inside it, the same path a
    // keyboard user takes.
    await page.getByTestId('album-navigate-button').focus()
    await page.keyboard.press('Tab')

    const playButton = page.getByTestId('play-album-button')
    await expect(playButton).toBeFocused()

    // The overlay has `transition-opacity duration-200`, so the computed
    // opacity animates from 0 to 1 rather than jumping instantly — poll
    // until the transition settles instead of asserting on a single frame.
    const overlay = page.getByTestId('album-hover-overlay')
    await expect.poll(() => overlay.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })

  test('AlbumListRow (list view): play button opacity is 1 once it has focus', async ({ page }) => {
    await setupApiMocks(page)
    await page.goto('/library')
    await page.waitForSelector('[data-testid="library-view"]')

    await page.getByTestId('list-view-button').click()
    await page.waitForSelector('[data-testid="album-list"]')

    // Focus the row first (deterministic starting point), then Tab once —
    // the play button is the row's next focusable descendant in DOM order.
    await page.getByTestId('album-list-row').focus()
    await page.keyboard.press('Tab')

    const playButton = page.getByTestId('list-row-play-button')
    await expect(playButton).toBeFocused()

    // The button has `transition-opacity`, so poll until the animation
    // settles instead of asserting on a single mid-transition frame.
    await expect.poll(() => playButton.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })
})

// Behavioral regression for the missing `aria-valuetext` fix on the
// progress-bar slider (docs/review/04-a11y.md, item 6). axe cannot detect
// this bug class — generic ARIA rules only check that aria-valuenow/min/max
// are present and valid, not that the announced text matches the formatted
// time shown on screen — so this is a targeted Playwright test reading the
// attribute directly, matching how the bug was documented (raw seconds
// announced instead of "1:05 / 4:00").
test.describe('Progress slider — aria-valuetext matches formatted time', () => {
  test('slider aria-valuetext reports the formatted "M:SS / M:SS" time, not raw seconds', async ({
    page,
  }) => {
    await setupApiMocks(page, { playbackStatus: playingStatusWithProgressResponse })
    await page.goto('/')
    await expect(page.getByTestId('playback-controls')).toBeVisible({ timeout: 5000 })

    // Scoped by accessible name: the page also has a volume `role="slider"`
    // (a native <input type="range">), so an unqualified role locator would
    // match both and fail Playwright's strict-mode uniqueness check.
    const slider = page.getByRole('slider', { name: /Playback position/ })
    await expect(slider).toBeVisible()

    // 65s / 240s current track duration → "1:05 / 4:00", same format used by
    // the visible time display and the slider's own aria-label.
    await expect(slider).toHaveAttribute('aria-valuetext', '1:05 / 4:00')

    // Guard against a future regression where aria-valuetext is re-set to the
    // raw aria-valuenow number instead of the formatted string.
    const valueNow = await slider.getAttribute('aria-valuenow')
    const valueText = await slider.getAttribute('aria-valuetext')
    expect(valueText).not.toBe(valueNow)
  })
})

// Regression for the redundant volume live-region fix (docs/review/04-a11y.md,
// item 10). The native <input type="range"> volume slider already announces
// its numeric value on change — no extra ARIA needed. The adjacent
// `.volume-display` span used to also carry `aria-live="polite"`, producing a
// duplicate/competing announcement (WCAG 4.1.3, Status Messages). axe cannot
// detect this bug class — it's a structural "two competing announcement
// sources" issue, not a generic ARIA-attribute-validity check — so this is a
// targeted Playwright test asserting the redundant live region is gone
// rather than an axe rule addition.
test.describe('Volume display — no redundant live region', () => {
  test('percentage span is aria-hidden, not a competing aria-live region', async ({ page }) => {
    await setupApiMocks(page, { playbackStatus: playingStatusWithProgressResponse })
    await page.goto('/')
    await expect(page.getByTestId('playback-controls')).toBeVisible({ timeout: 5000 })

    const display = page.locator('.volume-display')
    await expect(display).toBeVisible()
    await expect(display).not.toHaveAttribute('aria-live', 'polite')
    await expect(display).toHaveAttribute('aria-hidden', 'true')

    // Single source of truth: the native range input itself carries no
    // competing aria-live announcement either.
    const slider = page.getByRole('slider', { name: 'Volume slider' })
    await expect(slider).not.toHaveAttribute('aria-live')
  })
})

// Landmark regression for the missing `<main>` on /now-playing
// (docs/review/04-a11y.md, item 9). /now-playing is an immersive route that
// deliberately bypasses AppLayout (see App.vue's isImmersiveRoute check), so
// it isn't in the `routes` axe-scan loop above and never gets AppLayout's
// main/navigation/complementary landmarks. NowPlayingView.vue now renders
// its own <main> root (mirroring SetupWizardView.vue's existing fix), so
// this is a targeted DOM assertion rather than an axe rule — axe's
// landmark-one-main rule only fires on conflicting/duplicate landmarks, not
// on a route that's simply outside its scan scope.
test.describe('Landmarks — /now-playing has a <main> landmark', () => {
  test('renders exactly one visible <main> element', async ({ page }) => {
    await setupApiMocks(page, { playbackStatus: playingStatusWithProgressResponse })
    await page.goto('/now-playing')
    await page.waitForSelector('[data-testid="page-header"]')

    const main = page.locator('main')
    await expect(main).toHaveCount(1)
    await expect(main).toBeVisible()
  })
})

// Behavioral regression for UserSelectDialog's missing focus trap / initial
// focus / accessible name (docs/review/04-a11y.md, item 1 — the report's
// most severe finding). axe cannot detect any of this: it validates ARIA
// attribute presence/validity, not that Tab is actually contained inside the
// dialog or that focus lands somewhere sensible on open — so this is a
// targeted, behavioral Playwright test rather than a rule addition to the
// axe scan loop above. Needs the /api/users mock + two-user fixture added
// alongside this fix (mockApi.ts, fixtures.ts) — no existing test exercised
// this dialog before: the default mock setup leaves userStore.users empty
// (unmocked GET /api/users falls through to the catch-all 200-empty-body,
// which fails UsersResponseSchema parsing), so `needsSelection` was always
// false and the dialog never rendered in any prior e2e run.
test.describe('UserSelectDialog — focus trap, initial focus, accessible name', () => {
  test('focuses the first option on open', async ({ page }) => {
    await setupApiMocks(page, { users: twoUsersResponse })
    await page.goto('/')
    await page.waitForSelector('[data-testid="user-select-dialog"]')

    const focusedTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    )
    expect(focusedTestId).toBe('user-select-option')

    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim())
    expect(focusedText).toBe('Ada')
  })

  test('traps Tab/Shift+Tab between the option buttons and never reaches background nav', async ({
    page,
  }) => {
    await setupApiMocks(page, { users: twoUsersResponse })
    await page.goto('/')
    await page.waitForSelector('[data-testid="user-select-dialog"]')

    // The desktop-viewport MainNavBar (visually hidden behind the overlay,
    // but not `inert`/`display:none`) is what the report found the untrapped
    // Tab order leaking into — these are exactly the testids from its
    // recorded tabTrace.
    const backgroundTestIds = [
      'nav-search',
      'nav-library',
      'nav-queue',
      'nav-settings',
      'search-input',
    ]

    const activeTestId = (): Promise<string | null | undefined> =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid'))

    // Two options → a full forward cycle is 2 Tabs (option 0 -> option 1 ->
    // wraps back to option 0). Run 4 full cycles (8 Tabs) so a wrap that
    // only works once (but not on a second pass) would still be caught.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      const testId = await activeTestId()
      expect(testId).toBe('user-select-option')
      expect(backgroundTestIds).not.toContain(testId)
    }

    // Same for Shift+Tab in reverse.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Shift+Tab')
      const testId = await activeTestId()
      expect(testId).toBe('user-select-option')
      expect(backgroundTestIds).not.toContain(testId)
    }
  })

  test('has an accessible name matching the visible <h1>', async ({ page }) => {
    await setupApiMocks(page, { users: twoUsersResponse })
    await page.goto('/')
    await page.waitForSelector('[data-testid="user-select-dialog"]')

    // 'Who are you?' is the en-locale string for i18n key 'user.selectTitle',
    // the dialog's visible <h1> — asserting the accessible name resolves to
    // the same element as the data-testid confirms aria-labelledby is wired
    // up correctly, not just present.
    const dialog = page.getByRole('dialog', { name: 'Who are you?' })
    await expect(dialog).toHaveAttribute('data-testid', 'user-select-dialog')
  })
})
