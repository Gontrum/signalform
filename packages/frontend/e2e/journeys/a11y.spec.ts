/**
 * Permanent axe-core regression spec (Wave 2, Wave-2 shared regression spec).
 *
 * Replaces the temporary, uncommitted audit spec that was used to produce
 * docs/review/02-ui.md. Unlike that ad-hoc audit, this spec is intentionally
 * narrow: it only asserts axe rules that are guaranteed green by the fixes
 * already landed (Wave 1's heading/contrast fixes, item 10's Search <h1>,
 * item 9's Settings/Setup Wizard contrast fixes, toggle `aria-label` on
 * /settings). It is NOT a full, unrestricted `.analyze()` scan — several
 * Quick-Win a11y items are still open (nested-interactive album cards,
 * autocomplete `aria-label` placement, decade-chip contrast) and would make
 * an unrestricted scan fail for reasons unrelated to already-completed work.
 *
 * As each still-open Quick-Win item (see docs/review/00-plan-detailled.md,
 * Wave 1 Quick Wins 1-5) lands, widen the rule set for the affected route
 * below rather than adding a new spec file.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setupApiMocks } from '../helpers/mockApi.ts'

interface RouteCheck {
  readonly path: string
  readonly testid: string
  readonly rules: readonly string[]
}

const routes: readonly RouteCheck[] = [
  {
    path: '/',
    testid: 'search-container',
    rules: ['page-has-heading-one', 'heading-order', 'landmark-one-main'],
  },
  {
    path: '/library',
    testid: 'library-view',
    rules: ['page-has-heading-one', 'heading-order'],
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
        await setupApiMocks(page, {})
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

        const results = await new AxeBuilder({ page }).withRules([...route.rules]).analyze()

        expect(results.violations).toEqual([])
      })
    }
  })
}
