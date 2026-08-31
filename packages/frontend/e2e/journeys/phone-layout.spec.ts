/**
 * Phone Layout Verification (S02/M003)
 *
 * Verifies the app layout at 375px (phone) is single-column
 * with no side-by-side panels.
 */
import { test, expect, type Page } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('Phone Layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('right panel is hidden on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const rightPanel = page.locator('[data-testid="right-panel"]')
    // Right panel should not be rendered on phone
    await expect(rightPanel).toHaveCount(0)
  })

  test('left panel is full width on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const leftPanel = page.locator('[data-testid="left-panel"]')
    const box = await leftPanel.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(370)
  })

  test('nav links are accessible on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="bottom-nav"]')

    // On phone, primary navigation lives in the bottom tab bar, not the top nav.
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    await expect(bottomNav).toBeVisible()

    const searchLink = page.locator('[data-testid="bottom-nav-search"]')
    await expect(searchLink).toBeVisible()

    // The top-nav link row is not rendered on phone.
    await expect(page.locator('[data-testid="nav-links"]')).toHaveCount(0)
  })

  test('search input is visible and usable on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const input = page.locator('[data-testid="search-input"]')
    await expect(input).toBeVisible()

    const box = await input.boundingBox()
    // Input should span most of phone width
    expect(box?.width).toBeGreaterThan(300)
  })

  // Regression guard: the global bottom nav must be present on every route (it
  // used to live only in the Home layout, leaving other routes without phone
  // navigation), and the wide four-item nav must not overflow the viewport on
  // phones (long German labels once produced an ugly horizontal scroll).
  for (const path of ['/', '/queue', '/library', '/settings']) {
    test(`bottom nav is visible with no horizontal overflow on phone at ${path}`, async ({
      page,
    }) => {
      await setupApiMocks(page, {})
      await page.goto(path)

      // The bottom nav is global, so it renders on every route — waiting on it
      // (instead of the Home-only left panel) also asserts the regression fix.
      await page.waitForSelector('[data-testid="bottom-nav"]')
      await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  // The library filter block once measured 580px on a phone and pushed the album
  // grid to y=908 in an 844px viewport — not one cover was visible, and every
  // unit and E2E test stayed green because none of them measured actual height.
  // These two cases are that missing measurement.
  const sixAlbums = {
    albums: Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      title: `Album ${index + 1}`,
      artist: 'Local Artist',
      trackCount: 3,
      coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
      releaseYear: 2020,
      genre: null,
    })),
    hasMore: false,
  }

  // Two rows, not one: the summary line replaced 244px of chip rows, and the
  // whole point of that trade is a second row of covers. One row was the old
  // bar and it passed with 3px to spare — any new control line would have
  // broken it while the test still read as green.
  test('two full album rows fit on a phone without scrolling', async ({ page }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="album-grid"]')

    const view = page.locator('[data-testid="library-view"]')
    const viewBox = await view.boundingBox()
    expect(viewBox).not.toBeNull()

    // Nothing has been scrolled — this is what the user sees on arrival.
    expect(await view.evaluate((el) => el.scrollTop)).toBe(0)

    const cards = page.locator('[data-testid="album-card"]')
    const viewTop = viewBox?.y ?? 0
    const viewBottom = viewTop + (viewBox?.height ?? 0)

    // Four cards in a two-column grid are exactly the first two rows.
    for (let index = 0; index < 4; index += 1) {
      const box = await cards.nth(index).boundingBox()
      expect(box, `card ${index}`).not.toBeNull()
      expect(box?.y ?? 0, `card ${index} top`).toBeGreaterThanOrEqual(viewTop)
      expect((box?.y ?? 0) + (box?.height ?? 0), `card ${index} bottom`).toBeLessThanOrEqual(
        viewBottom,
      )
    }

    const secondRowBottom = await cards.nth(3).boundingBox()
    console.log(
      `phone-layout: two rows end ${
        viewBottom - ((secondRowBottom?.y ?? 0) + (secondRowBottom?.height ?? 0))
      }px above the fold`,
    )
  })

  // The case above measures an idle app, and that is the reason it read green
  // while the second row was in fact 20.5px past the fold on a real phone:
  // as soon as anything plays, the mini-player takes 61px off the bottom of
  // the library view, and no test above knows that bar exists. 390x844 is the
  // device the shortfall was measured on.
  test.describe('with the mini-player visible', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    const playingStatus = {
      status: 'playing',
      currentTime: 42,
      currentTrack: {
        id: 'track-1',
        title: 'Playing Track',
        artist: 'Playing Artist',
        album: 'Playing Album',
        url: 'file:///music/playing.flac',
        source: 'local' as const,
        duration: 240,
      },
      queuePreview: [],
    }

    test('two full album rows fit while a track is playing', async ({ page }) => {
      await setupApiMocks(page, { libraryAlbums: sixAlbums, playbackStatus: playingStatus })
      await page.goto('/library')
      await page.waitForSelector('[data-testid="album-grid"]')

      // Without this bar the whole case degenerates into the one above.
      const miniPlayer = page.locator('[data-testid="mini-player-bar"]')
      await expect(miniPlayer).toBeVisible()
      const miniBox = await miniPlayer.boundingBox()
      expect(miniBox?.height ?? 0).toBeGreaterThan(0)

      const view = page.locator('[data-testid="library-view"]')
      const viewBox = await view.boundingBox()
      expect(viewBox).not.toBeNull()

      // The library view ends where the mini-player starts.
      expect((viewBox?.y ?? 0) + (viewBox?.height ?? 0)).toBeLessThanOrEqual(miniBox?.y ?? 0)

      expect(await view.evaluate((el) => el.scrollTop)).toBe(0)

      const cards = page.locator('[data-testid="album-card"]')
      const viewTop = viewBox?.y ?? 0
      const viewBottom = viewTop + (viewBox?.height ?? 0)

      for (let index = 0; index < 4; index += 1) {
        const box = await cards.nth(index).boundingBox()
        expect(box, `card ${index}`).not.toBeNull()
        expect(box?.y ?? 0, `card ${index} top`).toBeGreaterThanOrEqual(viewTop)
        expect((box?.y ?? 0) + (box?.height ?? 0), `card ${index} bottom`).toBeLessThanOrEqual(
          viewBottom,
        )
      }

      const secondRowBottom = await cards.nth(3).boundingBox()
      console.log(
        `phone-layout: with mini-player, two rows end ${
          viewBottom - ((secondRowBottom?.y ?? 0) + (secondRowBottom?.height ?? 0))
        }px above the fold`,
      )
    })
  })

  // The source tabs, the Albums/Artists switch and the grid/list toggle share
  // one line. A wrap would silently give the height back, and every other
  // assertion here would still pass.
  test('the three library controls share one line', async ({ page }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="album-grid"]')

    const row = page.locator('[data-testid="library-controls-row"]')
    const rowBox = await row.boundingBox()
    // One line of 44px controls inside a 1px-bordered, 4px-padded group.
    expect(rowBox?.height).toBeLessThanOrEqual(60)

    for (const testId of ['source-selector', 'browse-mode-toggle', 'view-toggle']) {
      const control = page.locator(`[data-testid="${testId}"]`)
      await expect(control).toBeVisible()
      const box = await control.boundingBox()
      expect(box?.y ?? 0, `${testId} top`).toBeGreaterThanOrEqual(rowBox?.y ?? 0)
      expect((box?.y ?? 0) + (box?.height ?? 0), `${testId} bottom`).toBeLessThanOrEqual(
        (rowBox?.y ?? 0) + (rowBox?.height ?? 0),
      )
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('library filter chips stay on one scrollable line inside the phone sheet', async ({
    page,
  }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="filter-summary"]')

    // On a phone the chip rows only exist while the sheet is open.
    await expect(page.locator('[data-testid="sort-chip-row"]')).toHaveCount(0)
    await page.locator('[data-testid="filter-summary"]').click()
    await page.waitForSelector('[data-testid="genre-chips"]')

    for (const testId of ['sort-chip-row', 'decade-chip-row', 'genre-chips']) {
      const row = page.locator(`[data-testid="${testId}"]`)
      const box = await row.boundingBox()
      // A second wrapped line would put this past 88px (two 44px chips).
      expect(box?.height, `${testId} height`).toBeLessThan(70)
    }

    // All 20 genre chips stay reachable — the row scrolls instead of wrapping.
    const genreOverflow = await page
      .locator('[data-testid="genre-chips"]')
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(genreOverflow).toBeGreaterThan(0)
  })

  // The sheet is opened by a tap here on purpose. Popover.vue remembers
  // `document.activeElement` at open time, which on macOS/WebKit is <body>
  // after a click on a <button>; the sheet is handed its trigger instead, and
  // this is the case that proves it.
  test('the filter sheet returns focus to the summary line it was opened from', async ({
    page,
  }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="filter-summary"]')

    await page.locator('[data-testid="filter-summary"]').click()
    const sheet = page.locator('[data-testid="bottom-sheet"]')
    await expect(sheet).toBeVisible()
    await expect(sheet).toBeFocused()

    await page.keyboard.press('Escape')

    await expect(sheet).toBeHidden()
    await expect(page.locator('[data-testid="filter-summary"]')).toBeFocused()
  })

  // Every overflow assertion above measures `document.documentElement`, which is
  // structurally always 0: the app root is overflow-hidden, so a row that hangs
  // past its container scrolls an *inner* pane instead. These cases measure the
  // inner scroll containers.
  const DELIBERATE_HORIZONTAL_SCROLLERS = [
    'tag-chip-row',
    'sort-chip-row',
    'decade-chip-row',
    'genre-chips',
  ] as const

  type HorizontalOverflow = {
    readonly testId: string
    readonly className: string
    readonly overflowPx: number
  }

  const findHorizontalOverflow = async (page: Page): Promise<readonly HorizontalOverflow[]> =>
    await page.evaluate(
      (allowedTestIds: readonly string[]) =>
        Array.from(document.querySelectorAll('*')).flatMap((element) => {
          const overflowPx = element.scrollWidth - element.clientWidth
          if (overflowPx <= 1) {
            return []
          }

          // Only elements that can actually scroll: a `truncate` label reports
          // the very same overflow while `overflow-x: hidden` pins it in place.
          const overflowX = getComputedStyle(element).overflowX
          if (overflowX !== 'auto' && overflowX !== 'scroll') {
            return []
          }

          const testId = element.getAttribute('data-testid') ?? ''
          if (allowedTestIds.includes(testId)) {
            return []
          }

          return [
            {
              testId: testId === '' ? '(no data-testid)' : testId,
              className: element.getAttribute('class') ?? '',
              overflowPx,
            },
          ]
        }),
      [...DELIBERATE_HORIZONTAL_SCROLLERS],
    )

  const expectNoInnerHorizontalOverflow = async (page: Page, where: string): Promise<void> => {
    const offenders = await findHorizontalOverflow(page)

    expect(
      offenders,
      `${where}: unintended horizontal scrolling in ${offenders
        .map(
          (offender) =>
            `${offender.testId} (+${String(offender.overflowPx)}px, class="${offender.className}")`,
        )
        .join(' | ')}`,
    ).toEqual([])
  }

  // Long strings on purpose: the short values in `localTrackSearchResponse` fit
  // a 390px column with room to spare, which is why nothing here noticed the
  // chip row hanging past the pane.
  const remasteredSearchResponse = {
    tracks: [
      {
        id: 'track-long-1',
        title: 'Shine On You Crazy Diamond (Parts I-V) [2011 Remastered Version]',
        artist: 'The Deodato Symphonic Orchestra & The Nova Vale Ensemble',
        album: 'Wish You Were Here (50th Anniversary Deluxe Remastered Edition)',
        url: 'file:///music/shine-on-you-crazy-diamond.flac',
        source: 'local' as const,
        duration: 811,
      },
    ],
    albums: [
      {
        id: 'album-long-1',
        albumId: '4711',
        title: 'The Dark Side of the Moon (2023 Remastered Anniversary Box Set)',
        artist: 'The Deodato Symphonic Orchestra & The Nova Vale Ensemble',
        trackCount: 10,
        coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
      },
    ],
    artists: [
      {
        name: 'The Deodato Symphonic Orchestra & The Nova Vale Ensemble',
        artistId: 'artist-long-1',
      },
    ],
    query: 'remastered anniversary edition',
    totalResults: 3,
  }

  test.describe('no unintended horizontal scrolling on a 390x844 phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    // A broad guard over the four routes in their default state. None of them
    // renders the tag chip row, so all four stayed green while that row hung
    // past its pane — they cover future regressions, not the one below.
    const routeReadySelectors = [
      ['/', 'search-input'],
      ['/queue', 'queue-view'],
      ['/library', 'library-view'],
      ['/settings', 'settings-view'],
    ] as const

    for (const [path, readyTestId] of routeReadySelectors) {
      test(`nothing scrolls sideways at ${path}`, async ({ page }) => {
        await setupApiMocks(page, {})
        await page.goto(path)
        await page.waitForSelector(`[data-testid="${readyTestId}"]`)

        await expectNoInnerHorizontalOverflow(page, path)
      })
    }

    // The one case that fails without the fix: the tag chip row only sits
    // inside the full-results pane once a search ran, and no other spec
    // reaches that state.
    test('nothing scrolls sideways in the full search results', async ({ page }) => {
      await setupApiMocks(page, { search: remasteredSearchResponse })
      await page.goto('/')

      const searchInput = page.getByTestId('search-input')
      await searchInput.fill('remastered anniversary edition')
      await searchInput.press('Enter')

      await expect(page.getByTestId('full-results-list')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('tag-chip-row')).toBeVisible()

      await expectNoInnerHorizontalOverflow(page, 'full search results')
    })
  })

  // The vertical counterpart. Same blind spot: `document.documentElement` never
  // overflows, so a pane that hangs below the fold inside an overflow-hidden
  // ancestor is invisible to every assertion above — and unreachable to the
  // user, because a clipped box has no scrollbar and no touch scrolling.
  type VerticalReach = {
    readonly top: number
    readonly bottom: number
    readonly viewportHeight: number
    readonly scrollerTestId: string
    readonly scrollerScrollHeight: number
    readonly scrollerClientHeight: number
    readonly unreachableAbovePx: number
    readonly unreachableBelowPx: number
  }

  const measureVerticalReach = async (page: Page, selector: string): Promise<VerticalReach> =>
    await page.evaluate((targetSelector: string) => {
      const target = document.querySelector(targetSelector)
      if (!target) {
        throw new Error(`nothing matches ${targetSelector}`)
      }

      // A clipped ancestor is still programmatically scrollable, and Playwright's
      // own scroll-into-view before a click leaves it that way. Rewinding every
      // one of them — the whole chain up to the document root, not just those
      // below the nearest scroller — restores the only vertical position a user
      // can actually produce.
      const scroller = ((): Element | undefined => {
        let nearestScroller: Element | undefined

        for (let node = target.parentElement; node !== null; node = node.parentElement) {
          const overflowY = getComputedStyle(node).overflowY
          if (overflowY === 'auto' || overflowY === 'scroll') {
            nearestScroller ??= node
            continue
          }
          node.scrollTop = 0
        }

        return nearestScroller
      })()

      const rect = target.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      if (!scroller) {
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          viewportHeight,
          scrollerTestId: '(nothing scrolls)',
          scrollerScrollHeight: 0,
          scrollerClientHeight: 0,
          unreachableAbovePx: Math.max(0, Math.round(0 - rect.top)),
          unreachableBelowPx: Math.max(0, Math.round(rect.bottom - viewportHeight)),
        }
      }

      const scrollerRect = scroller.getBoundingClientRect()
      const remainingScroll = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      const visibleTop = Math.max(0, scrollerRect.top)
      const visibleBottom = Math.min(viewportHeight, scrollerRect.bottom)

      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        viewportHeight,
        scrollerTestId: scroller.getAttribute('data-testid') ?? '(no data-testid)',
        scrollerScrollHeight: scroller.scrollHeight,
        scrollerClientHeight: scroller.clientHeight,
        // Both edges measured against the scroll extent the user can reach:
        // rewinding to the start lifts the top edge by scrollTop, running to
        // the end lifts the bottom edge by whatever scrolling is left.
        unreachableAbovePx: Math.max(0, Math.round(visibleTop - (rect.top + scroller.scrollTop))),
        unreachableBelowPx: Math.max(0, Math.round(rect.bottom - remainingScroll - visibleBottom)),
      }
    }, selector)

  const expectVerticallyReachable = async (
    page: Page,
    selector: string,
    where: string,
  ): Promise<void> => {
    const reach = await measureVerticalReach(page, selector)

    const detail =
      `${where}: ${selector} spans ${String(reach.top)}..${String(reach.bottom)}px in a ` +
      `${String(reach.viewportHeight)}px viewport, nearest scroller "${reach.scrollerTestId}" ` +
      `(scrollHeight ${String(reach.scrollerScrollHeight)}, clientHeight ` +
      `${String(reach.scrollerClientHeight)})`

    expect(reach.unreachableBelowPx, `${detail} — cut off below the fold`).toBeLessThanOrEqual(1)
    expect(reach.unreachableAbovePx, `${detail} — cut off above the fold`).toBeLessThanOrEqual(1)
  }

  const SETUP_CARD = '[data-testid="setup-wizard"] > div'

  // Four servers, for the same reason as the players below: the discovered
  // list is what pushes the server step past both phone viewports here, and a
  // one-entry list would keep it accidentally short.
  const setupDiscoverResponse = {
    servers: [
      { host: '192.168.178.39', port: 9000, name: 'Lyrion Music Server', version: '9.0.1' },
      { host: '192.168.178.44', port: 9000, name: 'Basement Server', version: '8.5.2' },
      { host: '192.168.178.51', port: 9000, name: 'Attic Server', version: '8.3.1' },
      { host: '192.168.178.62', port: 9002, name: 'Garage Server', version: '9.0.0' },
    ],
  }

  // Four players: the step is only taller than a landscape phone with a
  // realistic list, and a one-entry list would keep it accidentally short.
  const setupPlayersResponse = {
    players: [
      { id: 'aa:bb:cc:dd:ee:01', name: 'Living Room', model: 'squeezelite', connected: true },
      { id: 'aa:bb:cc:dd:ee:02', name: 'Kitchen', model: 'squeezebox radio', connected: true },
      { id: 'aa:bb:cc:dd:ee:03', name: 'Bedroom', model: 'squeezelite', connected: false },
      { id: 'aa:bb:cc:dd:ee:04', name: 'Study', model: 'squeezebox touch', connected: true },
    ],
  }

  // `min-h-screen` sized the wizard against the viewport instead of against the
  // fixed-height, overflow-hidden box App.vue gives an immersive route, so
  // nothing scrolled anywhere and whatever did not fit was simply gone. In
  // landscape that hit on arrival, in portrait only once the discovered-server
  // list is on screen — which is why the scan below is not optional.
  const SETUP_VIEWPORTS = [
    { width: 375, height: 667 },
    { width: 667, height: 375 },
  ] as const

  for (const viewport of SETUP_VIEWPORTS) {
    const size = `${String(viewport.width)}x${String(viewport.height)}`

    test.describe(`setup wizard fits a ${size} phone`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      test(`every setup step stays reachable at ${size}`, async ({ page }) => {
        await setupApiMocks(page, {
          setupDiscover: setupDiscoverResponse,
          setupPlayers: setupPlayersResponse,
        })
        await page.goto('/setup')

        await expect(page.getByTestId('step-server')).toBeVisible()
        await expectVerticallyReachable(page, SETUP_CARD, `${size} step server on arrival`)

        // The discovered list is the tallest the server step ever gets, and
        // scanning is the only way to render it.
        await page.getByTestId('scan-button').click()
        await expect(page.getByTestId('discovered-server-item')).toHaveCount(
          setupDiscoverResponse.servers.length,
        )
        await expectVerticallyReachable(page, SETUP_CARD, `${size} step server after scan`)

        // Manual entry stays the path under test: it sits below the discovered
        // list, so it is only reachable once the taller step scrolls.
        await page.getByTestId('manual-host-input').fill('192.168.178.39')
        await page.getByTestId('proceed-to-player-button').click()
        await expect(page.getByTestId('player-item').first()).toBeVisible()
        await expectVerticallyReachable(page, SETUP_CARD, `${size} step player`)

        await page.getByTestId('player-item').first().click()
        await page.getByTestId('proceed-to-keys-button').click()
        await expect(page.getByTestId('step-keys')).toBeVisible()
        await expectVerticallyReachable(page, SETUP_CARD, `${size} step keys`)

        await page.getByTestId('save-button').click()
        await expect(page.getByTestId('step-done')).toBeVisible()
        await expectVerticallyReachable(page, SETUP_CARD, `${size} step done`)
      })
    })
  }
})
