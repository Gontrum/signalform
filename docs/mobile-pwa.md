# Mobile & PWA rules

Signalform ships as an installed, standalone PWA and is used on a phone first.
That combination removes safety nets a normal website has, and most of the
rules below exist because one of them was already violated once.

This file is a review checklist as much as a build guide: if a change touches
layout, navigation, or input, every rule here should have an obvious answer.

## 1. The app is a shell, not a document

`App.vue` is `h-dvh … overflow-hidden`. The document never scrolls. Every
screen puts its scrolling content in exactly **one** inner container.

- **One vertical scroll container per screen.** Two same-axis scrollers on one
  screen is a defect, not a layout choice — see rule 2.
- The invariant is about the **settled** state. `App.vue` wraps the routed
  component in a `<Transition>`, so mid-push the outgoing screen is still
  mounted and its scroller is genuinely on screen. A test must wait for the
  outgoing view to detach (assert its testid has count 0) before counting
  scrollers, or it passes and fails on timing alone.
- `document.documentElement` overflow is therefore structurally always 0.
  Measuring it proves nothing. Measure the inner scroller.
- Verify with `expectVerticallyReachable` / `expectNoInnerHorizontalOverflow`
  in `e2e/journeys/phone-layout.spec.ts`. jsdom cannot measure geometry — a
  `*.layout.test.ts` class assertion is a tripwire, never the proof.

## 2. Two scrollers on one axis is a bug

On touch there is no persistent scrollbar, so nothing tells the user which
container their thumb will move. `overscroll-contain` (which every inner
scroller here sets, correctly) stops scroll chaining, so reaching the end of
the inner one kills the gesture instead of continuing. Two flex siblings also
compete for height and one collapses.

Different **axes** are fine — a horizontal carousel inside a vertical scroller
has no ambiguity. Same axis is not.

A multi-line `<textarea>` is also fine and is not what this rule is about: it
scrolls its own text, the user put the caret in it deliberately, and it has a
visible boundary. The rule targets _layout_ containers that scroll page
content. The e2e scroller census counts declared scrollers, so a textarea does
not trip it either.

If a section is large enough to need its own scrolling, it is not a section.
It is a screen. Go to rule 3.

## 3. Navigation model — push, sheet, or tab

Derived from Apple's HIG, and consistent with what this app already does.

| Use                     | When                                                                                                                     | In this app                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Tab**                 | A top-level destination the user returns to constantly.                                                                  | The four items in `BottomNavBar` / `MainNavBar`. Adding a fifth is a real cost — the nav's no-overflow behaviour is under test.          |
| **Push** (route + back) | A destination in a hierarchy. Has depth, may itself contain lists and sub-navigation. The user drills in and comes back. | `/playlists`, `/album/:albumId`, `/artist/unified`, `/now-playing`. Use `<PageHeader :show-back="true" />`, which calls `router.back()`. |
| **Sheet / modal**       | A self-contained task entered and left, usually ending in commit or cancel. Shallow by definition.                       | Rare here.                                                                                                                               |

Rules of thumb:

- A sheet must not contain a deep hierarchy or a long scrolling list.
  Swipe-to-dismiss fights inner scrolling.
- A destination that merely _replaces_ what is on screen is a push, not a
  sheet, even when it is opened from a menu.
- Never inline a whole destination as an expanding block next to existing
  content. That is what produces rule 2's defect.

## 4. Standalone has no browser chrome

`manifest.json` sets `display: standalone` and `index.html` sets
`apple-mobile-web-app-capable`. Installed, there is **no browser back button
and no URL bar**.

- Every pushed route needs an in-app back affordance. `PageHeader` with
  `:show-back="true"` is the established one — use it, do not invent another.
  During a push two `page-header-back` buttons exist at once (rule 1's
  transition overlap), so scope any test locator to one screen rather than
  matching the testid globally.
- Do not rely on the iOS edge-swipe back gesture. It is unreliable in
  standalone mode and absent on other platforms.
- A dead end in standalone means force-quitting the app. Treat a missing back
  control as a release blocker, not a polish item.

## 5. Do not reintroduce `viewport-fit=cover`

`index.html` deliberately ships `width=device-width, initial-scale=1.0` with
**no** `viewport-fit=cover`. It was the cause of the iOS standalone layout
regression fixed in v0.16.12.

The consequence is that `env(safe-area-inset-*)` resolves to `0` on iOS. Code
using those insets (e.g. the queue list's bottom padding) is therefore
harmless but inert — do not "fix" it by turning `viewport-fit` back on. If
safe-area handling is genuinely needed one day, that is its own change, with
the v0.16.12 regression re-tested first.

## 6. Inputs

- **Font size below 16px makes iOS Safari zoom the page on focus.** The
  viewport meta intentionally does not set `maximum-scale` or
  `user-scalable=no` (suppressing zoom is an accessibility violation), so the
  auto-zoom is not suppressed. An input the user types into wants `text-base`
  (16px), not `text-sm`. Verify on a real device — WebKit in Playwright does
  not reproduce iOS auto-zoom.
  **Open question:** the same auto-zoom is widely reported for `<select>` too.
  Selects here are still `text-sm`. If a device check confirms it, widen this
  rule to any focusable form control and fix them in one pass.
- The on-screen keyboard shrinks the visual viewport, not the layout viewport.
  A focused input inside a scroller with sticky chrome can end up behind the
  keyboard. Check any new form on a phone with the keyboard open.
- Touch targets stay at 44×44 (`min-h-11 min-w-11`); `e2e/journeys/touch-targets.spec.ts`
  enforces it.
- No hover-only affordance — `pnpm check:hover-focus-opacity` enforces it.

## 7. Scroll position across navigation

The router has **no `scrollBehavior`**, and adding the default one would not
help — for two separate reasons, both of which have to hold:

- Vue Router restores `window.scrollY`, but this app scrolls inside a `div`.
- More fundamentally, `App.vue` keys the routed component by `route.path`, so
  the outgoing screen is **destroyed** on navigation. Even a component that
  kept its own scroller would lose the position, because the component itself
  is gone. Restoring means persisting the number outside the component.

Any screen that needs its position back after a push-and-return must save and
restore its own container's `scrollTop` — see `useQueueScrollMemory` for the
worked example. Two constraints that are easy to miss:

- **Scope the restore to a push return** (`route.meta.depth > 1`, read in
  `onBeforeUnmount` where the route is already the destination). An
  unconditional restore silently disables a screen's own arrival behaviour —
  the queue's "centre the current track" broke exactly this way.
- **Read and clear.** A saved position belongs to one round trip. Keeping it
  makes every later arrival snap back to a stale offset.

Decide this explicitly per screen. Silently losing a list position after
drilling in and coming back is a regression the tests will not catch.

## 8. Focus on route change

A pushed route leaves screen-reader focus where it was. Move focus to the new
screen's heading on entry, so a route change is perceivable without sight.

**Applies to new pushed routes.** `PlaylistsView` does this; `AlbumDetailView`,
`UnifiedArtistView` and `NowPlayingView` predate the rule and do not. That is a
known gap, not a licence to skip it — fix them when you next touch them.

Use `PageHeader`'s exposed `focusTitle()` — the `<h1>` carries `tabindex="-1"`
for it. Like rule 4's `:show-back`, this is the one mechanism; do not add a
second.

## Verification checklist

For any change touching layout, navigation, or input:

- [ ] Still exactly one vertical scroller on the screen?
- [ ] If a new destination: push with `PageHeader :show-back`, not an inline block?
- [ ] Reachable at 375×812 — proven with `expectVerticallyReachable`, not jsdom classes?
- [ ] No new horizontal overflow at 375px (`expectNoInnerHorizontalOverflow`)?
- [ ] Typed-into inputs at `text-base`?
- [ ] `viewport-fit` untouched?
- [ ] Scroll restoration decided (either implemented or explicitly not needed)?
- [ ] Focus moved on route entry?
