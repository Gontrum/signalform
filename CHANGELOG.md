# Changelog

All notable changes to Signalform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Mobile app improvements
- Additional streaming service integrations
- Enhanced playlist management (rename, delete, edit tracks)

---

## [0.17.0] - 2026-07-21

### Added

- new `PageHeader` component: a compact, sticky 44px navigation bar used
  across Queue, Now Playing, Album/Artist detail, and (phone-only) Library
  and Settings, replacing per-view back links and freeing up vertical space
  on mobile

### Changed

- mobile queue view is dramatically denser: the header shrank from ~380px
  to 44px (playlists/select/clear moved into an overflow menu, radio mode
  is now a compact icon toggle) and track rows dropped from three lines to
  two (album text removed, duration inlined) — the queue now shows 10+
  tracks at once instead of 3
- bottom tab bar now tints the active tab with the app's accent color
  instead of near-black, switches tabs instantly instead of animating the
  color, and gives clear press feedback on tap — matching how native iOS
  tab bars behave
- navigating between screens now slides push/pop based on the route's
  navigation depth (e.g. opening an album slides in from the right,
  going back slides out to the right); switching between top-level tabs
  stays instant, matching how native apps distinguish drill-down
  navigation from tab switching
- restored Tailwind's pre-v4 `cursor: pointer` on buttons, and added
  visual hover states to interactive controls that only had press
  feedback, so mouse users get a hover affordance and not just a cursor
  change

### Fixed

- the radio-mode icon in the queue header no longer resembles a WiFi
  signal indicator — swapped for an unambiguous broadcast-wave icon

---

## [0.16.13] - 2026-07-21

### Fixed

- mobile Now Playing / setup: the global bottom tab bar is now hidden on
  these two full-screen routes, so it no longer sits behind the floating
  "view full queue" button. Now Playing and the setup wizard are treated as
  immersive views with their own chrome (back button, floating queue toggle),
  matching how native music apps present the now-playing screen
- dependency lockfile sync so `pnpm install --frozen-lockfile` passes on
  `main` again after a batch of Dependabot bumps left `pnpm-lock.yaml` and the
  `minimumReleaseAge` exclusions in `pnpm-workspace.yaml` out of date

---

## [0.16.12] - 2026-07-21

### Fixed

- installed iPhone PWA: removed `viewport-fit=cover`, which was the actual
  cause of the whole bottom-gap saga. On this device it shrank the
  standalone PWA's usable viewport to 62px less than the physical screen on
  cold start (a known, non-recalculable iOS dynamic-viewport bug), pushing
  the tab bar and its labels into an unpaintable dead zone. Without cover the
  app is full height again with the tab bar at the bottom; the bar keeps its
  content clear of the home-indicator/swipe area via a fixed bottom padding.
  Also drops the dead JS reflow nudge and safe-area env() paddings that only
  existed to work around cover

---

## [0.16.11] - 2026-07-20

### Fixed

- installed iPhone PWA: the tab bar labels render again. On-device the
  standalone window is only 812px tall (62px shorter than the physical
  screen), and the previous `100vh` shell was taller than that window, so
  the labels landed in the unpaintable bottom zone and vanished. The shell
  now uses plain `100dvh`, matching the real window

---

## [0.16.10] - 2026-07-20

### Fixed

- installed iPhone PWA: switched the iOS status bar style from
  `black-translucent` to `default`. On-device measurement showed the
  standalone layout viewport was 62px shorter than the physical screen (the
  size of the top safe area), leaving a dead zone at the bottom where the
  tab bar labels fell and disappeared; `default` gives the app the full
  usable height

---

## [0.16.9] - 2026-07-20

### Fixed

- installed iPhone PWA: the bottom tab bar's icons were clipped on the
  first paint and only snapped into place after the first navigation
  (measured: the nav settled ~9px). The app now nudges a reflow once the
  content has painted (only in standalone display-mode), so the tab bar is
  placed correctly from the start

---

## [0.16.8] - 2026-07-20

### Fixed

- installed iPhone PWA (root cause): on-device measurement showed that in
  standalone display-mode iOS reports `100dvh` as the screen height minus
  the top safe area (dvh 812 vs screen 874), so the shell was too short and
  left a gap under the tab bar, while `100vh` reports the full screen. The
  app shell now uses `100dvh` in the browser (where it correctly excludes
  the address bar) and `100vh` under `@media (display-mode: standalone)`

---

## [0.16.7] - 2026-07-20

### Fixed

- installed iPhone PWA (take 2): the previous release measured the height
  with `window.innerHeight`, but iOS reports that too short in standalone
  too, so the gap under the tab bar stayed. Reverted to the pure-CSS
  approach: a `100dvh` shell (which reflects the real usable height on iOS,
  unlike `vh`) with `viewport-fit=cover` and `env(safe-area-inset-bottom)`
  on the nav — self-calibrating between browser and standalone

---

## [0.16.6] - 2026-07-20

### Fixed

- installed iPhone PWA: the app now reaches the bottom of the screen. In
  standalone mode iOS reported the available height too short, so the shell
  ended above the bottom edge and left a gap under the tab bar (in the
  browser Safari's toolbar hid it). The shell height is now measured from
  `window.innerHeight` — which iOS reports correctly in standalone — via an
  `--app-height` variable updated on resize/rotation, so the tab bar sits
  flush at the bottom

---

## [0.16.5] - 2026-07-20

### Added

- the running app version is now shown at the bottom of Settings
  ("Signalform vX.Y.Z"), so you can tell which build the (aggressively
  caching) PWA is actually running after an update

---

## [0.16.4] - 2026-07-20

### Fixed

- iPhone: removed the large empty gap under the bottom nav. iOS standalone
  PWAs resolve `height:100%`/`100dvh` shorter than the physical screen, so
  the app shell ended above the bottom edge and the nav's safe-area padding
  stacked on top of it. The shell is now pinned with `position:fixed;
inset:0`, covering the full screen regardless of that iOS quirk, so the
  bottom nav sits flush at the bottom

---

## [0.16.3] - 2026-07-20

### Fixed

- iPhone layout: the app now fills the screen correctly. The 0.16.2
  safe-area work exposed two issues — the header overlapped the status bar
  (with `viewport-fit=cover` the web view extends under it, but the content
  had no top safe inset), and a large empty gap sat below the bottom nav
  (routed views still used `h-dvh`/full viewport while the global nav and
  mini player had shortened the content area, and iOS standalone
  miscomputes `100dvh`). The content area now gets top/left/right safe
  insets, and the height model uses a reliable `height:100%` chain so
  views fill their container and the nav sits flush at the bottom

---

## [0.16.2] - 2026-07-20

### Fixed

- current playback is now reachable from anywhere on the phone: the mini
  player is a persistent bar above the bottom nav on every screen (except
  Now Playing and Setup) whenever something is loaded — previously it only
  appeared on the home screen. "Back to now playing" in the queue now goes
  to Now Playing instead of the previous page (with the global nav, that
  back step could land anywhere)
- iOS safe areas are now respected: the viewport uses `viewport-fit=cover`
  (without it `env(safe-area-inset-*)` is always 0 on iPhone), and the
  bottom nav and mini player get left/right/bottom insets — so they clear
  the rounded corners and sit out of the home-indicator swipe zone instead
  of looking clipped
- the "LMS unreachable" banner now appears within seconds instead of never:
  it still needs two consecutive failed health probes, but the poll no
  longer waits 30s between them (the LMS usually woke via wake-on-LAN
  before the second failure) — failing probes now retry every 4s

---

## [0.16.1] - 2026-07-20

### Fixed

- mobile navigation no longer overflows the viewport: the four-item link
  row (with long German labels) forced an ugly horizontal scroll on
  phones. Primary navigation now lives in a bottom tab bar (icons + short
  labels) on every screen, in the thumb-reachable zone, with the mini
  player stacked above it. Tablet and desktop keep the top nav. An e2e
  test now guards against horizontal overflow and against a route losing
  its navigation on phone
- the queue view reclaims its vertical space on phones: the playlists
  panel added in 0.16.0 was always expanded and pushed the track list
  down to ~2 visible rows. It is now collapsed by default and expands on
  tap, so the queue list — the point of the view — gets the full height

---

## [0.16.0] - 2026-07-19

### Added

- playlists: save the current queue as an LMS playlist, list your saved
  playlists, and load one back into the queue — from a panel in the queue
  view. First slice; renaming, deleting, and editing tracks come later
- sleep timer: stop playback after 15/30/45/60 minutes, backed by the LMS
  `sleep` command so the timer survives closing the browser or locking the
  device; the player shows the remaining time
- Loved Tracks Radio: a continuous radio channel drawn from the tracks
  you've loved on Last.fm, alongside the existing artist and Personal Radio
  modes
- a global "LMS unreachable" banner: when health probes to the server fail
  repeatedly, a banner appears and the wake-on-LAN packet is sent, instead
  of scattered per-view errors
- the queue is now reachable from every screen — a Queue entry in the main
  nav bar and a dedicated queue button on the phone mini player

### Changed

- reordering the queue by drag-and-drop no longer shifts the list under
  your finger: the drop target used to displace the whole list on every
  move, making it hard to aim. The insertion point is now shown on the
  drag overlay, and a small hysteresis band stops the before/after target
  flickering at row midlines

---

## [0.15.1] - 2026-07-17

### Fixed

- the E2E test suite was red on main while the v0.15.0 release still went
  through: the release pipeline never ran it. The suite is fixed (the API
  mock now mirrors the backend's "null clears a config field" behavior)
  and both the release workflow and the pre-push hook now require a green
  E2E run — a release can no longer be built from a broken suite

### Changed

- dependency updates: @fastify/static 10 (backend), eslint-plugin-boundaries 7
  (tooling); TypeScript stays on 6.x until vue-tsc and typescript-eslint
  support the TS 7 package layout
- toolchain: pnpm 9.15.2 → 11.13.1 across local dev, CI, and the Docker
  image (build-script allowlist for esbuild, workspace package injection
  for `pnpm deploy` — no more legacy flags)

---

## [0.15.0] - 2026-07-17

### Added

- wake-on-LAN for a sleeping LMS server: configure the server's MAC address
  in the settings and Signalform sends a magic packet whenever the app is
  opened or comes back into the foreground (throttled to once per minute) —
  no more switching to a separate WOL app before listening. The packet goes
  out as unicast to the LMS host and as broadcast, so it works from inside
  a Docker bridge network (a static ARP entry for the LMS on the Docker
  host is recommended so the packet still reaches the sleeping machine)

### Fixed

- the settings page no longer scrolls horizontally on phones — the user
  rows now stack their action buttons below the name on narrow screens,
  and several inputs could previously force the page beyond the viewport
- user names in the settings are visible on phones again (they were
  squeezed to zero width by the row buttons)
- the Last.fm shared secret field now shows a "configured" badge and the
  correct placeholder when a secret is stored; before, the field looked
  empty and borrowed the API key's state

---

## [0.14.0] - 2026-07-15

### Added

- multi-user support: several people can use Signalform with their own
  Last.fm profiles, so loves and scrobbles no longer mix between accounts.
  There is no login — each device picks its user once from a full-screen
  dialog and remembers the choice; with a single configured user nothing
  changes and no dialog ever appears
- loves and personal radio always act as the user selected on the
  requesting device
- scrobbles follow whoever starts playback: pressing play, jumping in the
  queue or starting a radio claims the scrobble target for that device's
  user; the settings show who is currently being scrobbled to
- the settings gained a users section: add, rename and delete users,
  connect each one to their own Last.fm account, and mark "this is me"
  for the current device

### Changed

- `config.json` now stores a `users` array instead of a single global
  Last.fm session; existing configs migrate automatically on first load,
  nothing to do by hand
- the Last.fm auth endpoints operate per user
  (`POST /api/lastfm/auth/complete` takes a `userId`, disconnect is
  `DELETE /api/lastfm/auth/:userId`), and `GET /api/config` no longer
  exposes the Last.fm username/session — user data lives at
  `GET /api/users`

---

## [0.13.1] - 2026-07-06

### Fixed

- background queue resyncs (reconnect, app returning to the foreground) no
  longer unmount the track list — previously they flashed the loading state
  and threw the scroll position back to the top, which on a phone hit on
  every unlock
- playback state now also resyncs after a socket reconnect, not just on
  visibility/focus, so a network blip while the app stays visible no longer
  leaves the transport controls stale
- the drag & drop indicator line no longer renders for positions where the
  drop would be a no-op — the indicator and the commit logic now share one
  source of truth

---

## [0.13.0] - 2026-07-05

### Added

- the queue now auto-scrolls to the currently playing track — centered when
  the view opens, and it smooth-scrolls to follow track changes while the view
  stays open (suppressed during a drag or in select mode)
- drag & drop picks the drop position from where the cursor sits inside the row
  (upper half drops before it, lower half after it) instead of a bare index
  comparison; a drop that would not move the track no longer hits the server

### Fixed

- the queue and playback views no longer open a second, redundant WebSocket
  connection — `useWebSocket` is now a single shared socket
- the queue re-syncs after a dropped connection. The reconnect handler had been
  dead since Socket.IO v3 (the manager stopped forwarding reconnect events to
  the socket), so the UI silently went stale after the device slept or the
  network changed; reconnecting and bringing the app back to the foreground now
  both refetch the queue
- queue and playback actions no longer show a spurious error while the backend
  is still retrying — the frontend mutation timeouts were shorter than the
  backend's retry window and have been raised to 15s, which is what caused the
  "fails once, works on the second click" behaviour
- the drag auto-scroll followed the frozen start position; it now reads the
  live pointer on every tick

### Changed

- the queue's realtime timestamp barrier accepts a same-millisecond server
  event instead of discarding it as stale

---

## [0.12.1] - 2026-07-03

### Fixed

- personal radio no longer dies silently when Last.fm is unavailable — it now
  shows the same "radio unavailable" notice as genre radio instead of
  misreporting a queue error
- pre-commit hook no longer sweeps unrelated modified files into commits
- agent zone enforcement repaired: the permission deny rules had blocked the
  core-dev/shell-dev subagents themselves; replaced with an agent-aware hook
- two circular imports between feature barrels resolved

### Changed

- radio replenish engine decomposed: the four duplicated pipelines (generic,
  genre, personal discovery, personal comfort) now share one implementation,
  decision logic lives in the pure core with direct unit tests, and
  radio-service.ts shrank from 1904 to 533 lines
- health check core is fully pure; LMS probing moved to the shell route
- architecture lint now bans async/await and fetch in all core zones and
  fetch in domain UI components mechanically
- discovery→comfort radio fallback is now logged with its reason

### Added

- 16 integration tests covering the previously untested genre and personal
  radio replenish paths
- `scripts/release.sh` — one-shot version bump, changelog draft, commit and tag

---

## [0.12.0] - 2026-06-24

### Added

- Story 5 — Last.fm love/unlove button in NowPlayingPanel
- scrobble tracks to Last.fm while playing
- discovery channel via Last.fm neighbours and recommendations
- comfort-channel radio from listening history
- Last.fm account setup — config, auth flow, settings UI
- genre radio via Last.fm tag tracks

### Fixed

- persist personalRadioEnabled, scrobblingEnabled, personalRadioDiscovery
- scroll and Last.fm auth — missing shared secret and overflow

### Changed

- move pure helpers to core, complete DELETE test coverage
- extract business logic from route handler into core

---

## [0.11.0] - 2026-06-14

### Added

- **Artist page — Add Top Tracks to Queue**: Each top track on the artist page now has an
  individual "Add to queue" button. A second "Add all to queue" button in the section header
  enqueues all available tracks at once. Buttons are disabled when no playable URL is available
  (neither local nor Tidal). The top-track limit was raised from 10 to 15.
- **Artist page — Artist Radio**: A new "Artist Radio" button starts a personalized radio
  directly from the artist page. The radio blends the artist's own top tracks with tracks from
  similar artists (both sourced via Last.fm), interleaved in a 1:2 ratio (seed artist : similar
  artists). The button shows a loading indicator while the radio starts and an error state if
  it fails. New API endpoint: `POST /api/artist-radio/start`.
- **Queue — Multi-select delete and Clear Queue**: The queue view now has a select mode
  (checkbox per track, select-all bar) for removing multiple tracks at once. A separate
  "Clear Queue" button removes all tracks; it requires a two-step confirmation (3 s countdown)
  to prevent accidental clears. Clearing automatically disables Radio Mode so the queue is not
  immediately replenished. New API endpoints: `POST /api/queue/remove-batch`,
  `POST /api/queue/clear`.

### Fixed

- **Artist Top Tracks — Tidal tracks missing or non-deterministic**: Top tracks were showing
  only locally available tracks, or no tracks at all for artists without a local library entry.
  Two root causes were fixed: (1) Tidal search results initially carry an empty artist field
  (the `tidal_info` enrichment has a 500 ms budget and can time out) — the matching logic now
  accepts these unenriched tracks when the title matches, and also handles remastered/edition
  variants ("Like a Prayer (2009 Remaster)" matches "Like a Prayer"). (2) The previous strategy
  of firing 15 concurrent per-track Tidal searches saturated the LMS Tidal plugin and caused
  near-universal timeouts. Replaced with a single artist-level Tidal search whose results are
  shared across all top tracks, reducing Tidal load from 15 calls to 1.

---

## [0.10.1] - 2026-06-12

### Fixed

- **Tidal album navigation — wrong album / single track**: The artist page now uses the Tidal
  artist-browse API (`searchTidalArtists` → `getTidalArtistAlbums`) as the primary source for Tidal
  albums. This returns real browse IDs (e.g. `7_Berliner Philharmoniker.2.0.1.120`) that navigate
  directly to the correct album with all tracks. Previously, synthetic IDs derived from search
  results would open the wrong recording or show only a single "Track 1".
- **Tidal fallback — track names missing**: When the artist-browse returns no results, the
  search-derived fallback now populates `trackTitles` alongside `trackUrls` so individual movement
  and track names are shown correctly instead of generic "Track N" placeholders.
- **Queue navigation link hidden on narrow viewports**: The "View Full Queue" link in the Now
  Playing panel was conditionally hidden on phone-sized screens with no alternative navigation
  path. It is now always visible.

---

## [0.10.0] - 2026-05-22

### Added

- **Artist page — Top Tracks**: The artist view now shows the top tracks for an artist (via
  Last.fm), with playback buttons and inline rank/play-count ordering. Runs in parallel with the
  album load so it doesn't slow down navigation.
- **Artist page — Album sorting**: Sort buttons (Year / Popularity / A-Z) let you reorder both
  local and Tidal albums. Popularity data comes from the same Last.fm top-albums call as the
  playback statistics.
- **Refresh-safe Tidal album URLs**: Tidal album pages are now bookmarkable and survive browser
  refresh. A new `GET /api/tidal/albums/:albumId` endpoint fetches title, artist, cover and track
  list directly from the LMS OPML browser using the album ID in the URL. The old approach of
  carrying metadata in `history.state` (lost on reload) is kept only as a no-flicker hint.
- **Search: Tidal availability warning**: When the Tidal plugin is unreachable (auth failure,
  plugin crash), the search results page shows a banner instead of silently returning zero Tidal
  results. The backend `SearchResponse` now includes a `tidalAvailable` flag.
- **New API endpoints**:
  - `GET /api/tidal/albums/:albumId` — album detail (title, cover, tracks) from browse ID
  - `GET /api/tidal/albums/resolve` — resolve title+artist to a stable browse ID
  - `GET /api/artist/top-tracks` — Last.fm top tracks for an artist, matched against local/Tidal library
  - `GET /api/artist/top-albums` — Last.fm top album popularity scores

### Changed

- **Single artist view**: `ArtistDetailView` and `UnifiedArtistView` have been merged into one
  page (`/artist/unified`). All navigation paths (album artist links, search results, similar
  artists) lead to the same view, which now covers local albums, Tidal albums, top tracks, sorting,
  enrichment, and similar artists.

### Fixed

- **Playback**: LMS occasionally omits `time`, `duration`, `mixer volume`, or `url` from status
  responses. These fields are now treated as optional to prevent Zod parse failures.
- **Playback race condition**: A slow-returning `fetchCurrentStatus` HTTP call can no longer
  overwrite a more recent state update that arrived via WebSocket or a user action in the meantime.

---

## [0.9.10] - 2026-05-09

### Fixed

- **Radio Mode**: Playback no longer freezes after a local track when the next queued Tidal track
  fails to buffer (Tidal format mismatch: LMS requests FLAC, Tidal returns MP4). The status poller
  now detects when LMS is stuck at the very end of a track (`time ≈ duration`, mode stays "play")
  for 3+ consecutive seconds and automatically calls `nextTrack()` + `resume()` to skip past the
  broken track and continue playback.

---

## [0.9.9] - 2026-05-09

### Fixed

- **Now Playing / Mini-Player**: Selecting a track from the queue no longer leaves the Now Playing
  view and mini-player showing the previous track — the UI now refreshes immediately on navigation
  and stays in sync with WebSocket events after reconnects
- **Radio Mode**: Radio mode no longer stops when the current track has no Last.fm scrobble history
  (e.g. obscure or newly released tracks) — falls back to `artist.getSimilar` to keep the queue
  replenished
- **WebSocket**: Socket reconnection now automatically re-subscribes to player updates, preventing
  stale state after network interruptions

---

## [0.9.8] - 2026-05-08

### Fixed

- **Radio / Search**: Increased Tidal search timeout from 250ms to 450ms - Tidal responses typically
  arrive in 300-400ms, causing the previous limit to silently drop results
- Search autocomplete now reliably returns Tidal tracks
- Radio mode can again find similar tracks to keep the queue replenished; without this fix
  radio playback would stop when the queue ran low

---

## [0.9.7] - 2026-05-08

### Fixed

- **Critical**: Fixed LMS memory leak causing OOM-kills - reduced WebSocket event load by 99.7%
- Status polling no longer emits events on time changes (frontend has local time ticker)
- Eliminated 3600 unnecessary WebSocket broadcasts per hour that were triggering "Context not found" errors in LMS
- LMS now remains responsive during extended playback sessions

### Technical Details

- Removed time-based change detection from `hasStatusChanged()` in status-poller
- Events now only emit on actual state changes: track, mode, volume, queue
- This fix resolves LMS crashes after 30-60 minutes of use (7.4GB RAM + 7.8GB swap exhaustion)
- Frontend uses local progress ticker - server time updates were redundant

---

## [0.9.6] - 2026-05-08

### Fixed

- Queue now playing display is more stable and updates reliably
- Radio mode now prevents duplicate tracks by URL, avoiding repeated suggestions in the queue

---

## [0.9.5] - 2026-04-30

### Fixed

- Mobile playback and header layout now display more consistently across different viewport sizes
- Mobile navigation and sticky search header are unified for better user experience
- Search results no longer cause horizontal overflow on mobile devices
- PWA now recovers reliably from stale localhost service workers

---

## [0.9.4] - 2026-04-28

### Fixed

- Radio mode now keeps its enabled state consistent on toggle errors and avoids immediate recent-repeat suggestions more reliably
- Queue syncing is more robust after search add-actions and in stopped-state playback views
- Unified artist pages load Tidal albums more reliably while avoiding ambiguous fallback matches
- Queue rendering stays stable with duplicate tracks and long-list reorder interactions
- Local development recovers more safely from stale service workers and reports missing backend `.env` files more clearly

### Changed

- Live recovery smoke tests are now isolated from the default frontend E2E run
- Added regression coverage for radio toggle rollback, queued refresh races, artist fallback matching, and dev service-worker recovery

---

## [0.9.3] - 2026-04-26

### Fixed

- iPhone/PWA playback now loads the current track immediately on app start
- Playback progress stays in sync more reliably after focus, rotation, pause, and resume
- Queue drag-and-drop on iPhone suppresses accidental text selection and touch-callout interference
- LMS cover art now loads through the backend proxy, avoiding mixed-content and direct LMS reachability issues on mobile PWAs

### Changed

- Added automated regression coverage for playback sync, mobile queue drag handling, and proxied cover-art loading

---

## [0.9.0] - 2026-04-24

### 🎉 Initial Public Release

First public beta release of Signalform - a modern web interface for Lyrion Music Server.

#### Added

**Core Features**

- Modern web UI for Lyrion Music Server (LMS)
- Unified search across local library, Qobuz, and Tidal
- Artist enrichment via Last.fm (biographies, similar artists, top tracks)
- Artist hero images via Fanart.tv
- Queue management and playback control
- Radio mode with automatic track suggestions based on artist similarity
- PWA support for mobile devices (installable on iOS/Android)

**Installation & Deployment**

- One-line shell installer for Linux and macOS
- Docker support with bind mount and named volume options
- Setup wizard for first-time configuration
- Automatic service registration (systemd on Linux, launchd on macOS)
- Update and uninstall commands

**Developer Experience**

- Monorepo structure with TypeScript
- Functional Core / Imperative Shell (FCIS) architecture
- ESLint boundary enforcement
- Comprehensive test suite (unit + E2E)
- CI/CD with GitHub Actions
- Detailed contributor documentation

#### Technical Details

- **Architecture:** Functional core, Result-based error handling, pure functions
- **Frontend:** Vue 3, Pinia, TypeScript, Vite
- **Backend:** Fastify, Node.js 22+, Socket.IO
- **Testing:** Vitest, Playwright, ≥70% coverage enforced
- **Monorepo:** pnpm workspaces

#### Known Limitations

- **iOS/iPadOS:** Background audio not supported due to WebKit restrictions
- **iOS/iPadOS:** PWA installation only works in Safari
- **Security:** Designed for local network use; no built-in authentication
- **API Keys:** Stored in plaintext in `config.json` (file permissions protect)

#### Security Notes

- First public release - please report security issues via GitHub Security Advisories
- See [SECURITY.md](SECURITY.md) for vulnerability reporting process

---

## Release Notes

### What's Next?

This is a beta release (`0.x.x`). We're working towards a stable `1.0.0` release with:

- Improved mobile experience
- Performance optimizations
- Bug fixes based on community feedback

### How to Report Issues

- **Bugs:** [GitHub Issues](https://github.com/Gontrum/signalform/issues)
- **Feature Requests:** [GitHub Discussions](https://github.com/Gontrum/signalform/discussions)
- **Security:** [GitHub Security Advisories](https://github.com/Gontrum/signalform/security/advisories)

---

[Unreleased]: https://github.com/Gontrum/signalform/compare/v0.10.1...HEAD
[0.10.1]: https://github.com/Gontrum/signalform/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/Gontrum/signalform/compare/v0.9.10...v0.10.0
[0.9.10]: https://github.com/Gontrum/signalform/compare/v0.9.8...v0.9.10
[0.9.8]: https://github.com/Gontrum/signalform/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/Gontrum/signalform/releases/tag/v0.9.7
[0.9.6]: https://github.com/Gontrum/signalform/releases/tag/v0.9.6
[0.9.5]: https://github.com/Gontrum/signalform/releases/tag/v0.9.5
[0.9.4]: https://github.com/Gontrum/signalform/releases/tag/v0.9.4
[0.9.3]: https://github.com/Gontrum/signalform/releases/tag/v0.9.3
[0.9.0]: https://github.com/Gontrum/signalform/releases/tag/v0.9.0
