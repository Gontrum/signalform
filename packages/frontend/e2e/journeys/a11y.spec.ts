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
import { populatedAutocompleteResponse } from '../helpers/fixtures.ts'

interface RouteCheck {
  readonly path: string
  readonly testid: string
  readonly rules: readonly string[]
}

const routes: readonly RouteCheck[] = [
  {
    path: '/',
    testid: 'search-container',
    rules: ['page-has-heading-one', 'heading-order', 'landmark-one-main', 'aria-input-field-name'],
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
