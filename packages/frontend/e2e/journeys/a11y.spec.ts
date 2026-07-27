/**
 * Permanent axe-core regression spec (Wave 2, Wave-2 shared regression spec).
 *
 * Replaces the temporary, uncommitted audit spec that was used to produce
 * docs/review/02-ui.md. Unlike that ad-hoc audit, this spec is intentionally
 * narrow: it only asserts axe rules that are guaranteed green by the fixes
 * already landed (Wave 1's heading/contrast fixes, item 10's Search <h1>,
 * item 9's Settings/Setup Wizard contrast fixes, toggle `aria-label` on
 * /settings, nested-interactive album cards on /library). It is NOT a full,
 * unrestricted `.analyze()` scan — an unrestricted scan on any route still
 * turns up unrelated noise (e.g. the Vue DevTools browser-extension panel
 * triggers `aria-prohibited-attr`/`region`), so each route's `rules` array
 * stays a deliberate allowlist rather than "everything", even now that all
 * of the original Wave 1 Quick-Win a11y items have landed.
 *
 * As each Quick-Win item (see docs/review/00-plan-detailled.md, Wave 1 Quick
 * Wins 1-5) landed, the rule set for the affected route below was widened
 * rather than adding a new spec file.
 *
 * Landed: autocomplete `aria-label` placement — the `/` route case below now
 * types a query and waits for the populated `<ul role="listbox">` dropdown
 * before scanning, with `aria-input-field-name` added to its rule set.
 * Landed: decade-chip contrast — the `/library` route case now clicks a
 * non-default decade chip (which also reveals the "Clear all filters"
 * button) before scanning, with `color-contrast` added to its rule set.
 * All four original Wave 1 Quick-Win a11y items are now closed.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setupApiMocks } from '../helpers/mockApi.ts'
import { populatedAutocompleteResponse, singleTrackQueueResponse } from '../helpers/fixtures.ts'

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
  readonly rules: readonly string[]
}

const routes: readonly RouteCheck[] = [
  {
    path: '/',
    testid: 'search-container',
    rules: [
      'page-has-heading-one',
      'heading-order',
      'landmark-one-main',
      'aria-input-field-name',
      'aria-valid-attr-value',
    ],
  },
  {
    path: '/library',
    testid: 'library-view',
    rules: ['page-has-heading-one', 'heading-order', 'nested-interactive', 'color-contrast'],
  },
  {
    path: '/queue',
    testid: 'queue-view',
    rules: ['page-has-heading-one', 'heading-order'],
  },
  {
    path: '/settings',
    testid: 'settings-view',
    rules: ['page-has-heading-one', 'heading-order', 'color-contrast', 'button-name'],
  },
  {
    path: '/setup',
    testid: 'setup-wizard',
    rules: ['page-has-heading-one', 'heading-order', 'color-contrast'],
  },
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
      test(`${route.path} has no violations for [${route.rules.join(', ')}]`, async ({ page }) => {
        const isSearchRoute = route.path === '/'
        await setupApiMocks(
          page,
          isSearchRoute ? { autocomplete: populatedAutocompleteResponse } : {},
        )
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

        const results = await new AxeBuilder({ page }).withRules([...route.rules]).analyze()

        expect(results.violations).toEqual([])
      })
    }
  })
}

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
