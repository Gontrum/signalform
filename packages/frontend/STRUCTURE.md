# packages/frontend — Source Structure

Developer reference for the layout of `packages/frontend/src/`. Describes the role of each directory and the architectural patterns in use.

---

## Architectural Pattern: Functional Core / Imperative Shell

The codebase follows the **FC/IS** split throughout, adapted for Vue 3:

- **Functional Core** — pure functions with no side effects, no I/O, easily unit-tested. Lives in `utils/` (pure helpers), computed getters and pure selectors inside Pinia stores, and Zod schema definitions in `api/` files.
- **Imperative Shell** — all I/O, side effects, and external system calls. Lives in `api/` (HTTP client functions), the IS sections of Pinia stores (API calls and WebSocket subscriptions), `composables/` (Socket.IO lifecycle management), and `main.ts` (app bootstrap).
- **Mixed (Vue-idiomatic)** — `views/` and `components/` contain both pure template rendering and imperative event handlers. This is expected and idiomatic in Vue; components are not required to be pure. Template expressions are functional, event handlers are imperative.

---

## Top-Level Entry Points

```
src/
  main.ts   — Process entry point: creates the Vue app instance, registers Pinia
              and the Vue Router plugin, mounts the app to #app.
  App.vue   — Root component: hosts <RouterView>, runs a config-check on mount to
              redirect to /setup if the app has never been configured, and registers
              a global keyboard handler (Ctrl/Cmd+K → home, Ctrl/Cmd+F → search).
```

---

## api/

HTTP client functions — all Imperative Shell. One file per backend domain. Each function calls `fetch`, passes the response through `parseResponse` (from `utils/`), and returns a typed `Result<T>` from `@signalform/shared`.

```
src/api/
  albumApi.ts        — Album detail and track listing
  artistApi.ts       — Artist detail and discography
  configApi.ts       — App configuration read/write (getConfig, saveConfig)
  enrichmentApi.ts   — Track metadata enrichment (artwork, artist bio)
  heroImageApi.ts    — Hero/banner image resolution for artist views
  libraryApi.ts      — LMS local library browsing
  playbackApi.ts     — Playback controls (play, pause, next, volume, seek)
  queueApi.ts        — Queue inspection and manipulation
  searchApi.ts       — Local + Tidal unified search with autocomplete
  setupApi.ts        — First-run LMS discovery and setup
  tidalAlbumsApi.ts  — Tidal album browse and detail
  tidalArtistsApi.ts — Tidal artist search
```

Zod schemas are defined in the `api/` files alongside their fetch calls — schema parsing is pure (Functional Core), but the HTTP call that feeds them is Imperative Shell.

---

## composables/

Vue 3 composable hooks that encapsulate stateful lifecycle logic. These are Imperative Shell: they manage side effects such as Socket.IO connections and DOM observation.

```
src/composables/
  useWebSocket.ts        — Socket.IO client lifecycle: connects on mount, disconnects
                           on unmount, exposes ConnectionState, and provides a
                           type-safe subscribe/unsubscribe API for named events.
  useResponsiveLayout.ts — Breakpoint detection via ResizeObserver: exposes boolean
                           flags isPhone, isTablet, isDesktop.
  useTransientSet.ts     — Auto-expiring Set<K> for transient UI feedback (success/error
                           indicators). Per-key timers with reset-on-re-add and
                           cleanup on scope dispose.
  useArtistImage.ts      — Lazy artist image loader backed by /api/enrichment/artist/images
                           (Fanart.tv). Module-level cache + in-flight deduplication ensure
                           each artist name is fetched at most once per session.
```

---

## components/

Reusable presentational Vue components. Mixed FC/IS: templates are pure declarative renders; event handlers and emits are imperative. Components are scoped to UI concerns and do not own server I/O (that lives in stores or views).

```
src/components/
  AlbumActionButtons.vue    — Play / Add-to-Queue / Go-to-Artist button group for
                              album result rows; accepts callbacks so callers supply
                              the correct action without duplicating button markup.
  AlbumCard.vue             — Album grid tile with cover art and metadata
  AlbumCover.vue            — Cover art image with lazy-load and fallback
  AlbumListRow.vue          — Compact album row for list layouts
  ArtistHero.vue            — Hero banner for artist pages: full-bleed background image
                              with gradient overlay; exposes a scoped slot with hasImage
                              so callers adapt text colours without repeating the null-check.
  AutocompleteDropdown.vue  — Keyboard-navigable autocomplete results overlay
  MainNavBar.vue            — Primary navigation bar (responsive: phone/desktop)
  NowPlayingPanel.vue       — Persistent now-playing sidebar panel
  PlaybackControls.vue      — Transport controls (play/pause, prev/next, seek)
  ProgressBar.vue           — Playback progress bar with scrub interaction
  QualityBadge.vue          — Audio quality indicator badge (FLAC, MQA, etc.)
  SearchPanel.vue           — Search input with autocomplete integration
  SearchResultsList.vue     — Formatted list of search results
  SimilarArtistGrid.vue     — 2–3-column grid of similar artist cards with match %
                              and in-library accent border; shared by both artist views.
  VolumeControl.vue         — Volume slider with mute toggle
  autocompleteConstants.ts  — Autocomplete key codes and timing constants
```

---

## layouts/

App shell layout components. Responsible for the overall page structure; swap between phone, tablet, and desktop arrangements.

```
src/layouts/
  AppLayout.vue — Responsive shell: renders a different slot arrangement for
                  phone (bottom-bar nav), tablet, and desktop (sidebar nav)
                  based on breakpoint flags from useResponsiveLayout.
```

---

## router/

Vue Router configuration. Routes are registered with lazy imports so each view is code-split into its own chunk.

```
src/router/
  index.ts — HTML5 history mode router. Routes:
               /                      → HomeView
               /album/:albumId        → AlbumDetailView
               /album/tidal-search    → AlbumDetailView (Tidal variant)
               /artist/:artistId      → ArtistDetailView
               /artist/unified        → UnifiedArtistView
               /queue                 → QueueView
               /library               → LibraryView
               /settings              → SettingsView
               /setup                 → SetupWizard
               /now-playing           → NowPlayingView
```

---

## stores/

Pinia state stores. Each store mixes Functional Core (computed getters, pure selectors) with Imperative Shell (API calls, WebSocket subscriptions). Store files are annotated with `// --- Functional Core ---` and `// --- Imperative Shell ---` section comments.

```
src/stores/
  playbackStore.ts — Player state: current track, playback status, volume level,
                     seek position. IS section calls playbackApi and subscribes
                     to WebSocket player-state events.
  queueStore.ts    — Queue track list, radio boundary index, polling timer for
                     queue refresh. IS section calls queueApi and manages the
                     poll interval lifecycle.
  searchStore.ts   — Search query text, search results, autocomplete suggestions.
                     IS section calls searchApi on query changes.
```

---

## types/

Frontend-only TypeScript type definitions not shared with backend or the `@signalform/shared` workspace package.

```
src/types/
  autocomplete.ts — AutocompleteSuggestion and AutocompleteResponse types used
                    by the search autocomplete feature.
```

---

## utils/

Pure utility functions — Functional Core. No side effects, no I/O, no Vue lifecycle dependencies. All exports are independently unit-testable with plain inputs.

```
src/utils/
  parseResponse.ts   — Fetch response → Result<T>: checks HTTP status, parses JSON,
                        validates against a Zod schema, returns typed Result.
  errorMessages.ts   — Human-readable error message resolver for Result error types.
  historyState.ts    — History state helpers for browser back-navigation context.
  runtimeUrls.ts     — Derives API base URL from window.location at runtime
                        (supports both dev-server proxy and production same-origin).
  searchRanking.ts   — Pure scoring functions for ranking autocomplete suggestions.
  sourceInfo.ts      — Source metadata helpers (source name, badge color, icon).
  index.ts           — Re-exports all utils for convenient barrel imports.
```

---

## views/

Page-level routed Vue components. Mixed FC/IS: each view owns a slice of the page lifecycle (data fetching on mount, navigation guards) and renders via child components. Views call stores or APIs directly for their initial data load.

```
src/views/
  HomeView.vue         — Search landing page; hosts SearchPanel + recent results
  AlbumDetailView.vue  — Album page: track listing, cover art, playback actions
  ArtistDetailView.vue — Single-source artist page: albums and artist info
  UnifiedArtistView.vue — Cross-source (local + Tidal) unified artist view
  LibraryView.vue      — LMS local library browser
  QueueView.vue        — Current playback queue with drag-reorder
  NowPlayingView.vue   — Full-screen now-playing (phone layout)
  SettingsView.vue     — App settings form (LMS host, port, config save)
  SetupWizard.vue      — First-run wizard: LMS auto-discovery + manual config
```

---

## assets/

Static assets bundled by Vite. CSS is imported in `main.ts`; images are referenced in components.

```
src/assets/
  main.css — Global CSS reset and base styles
  (images) — Static image assets
```

---

## Quick Reference

```
packages/frontend/
  src/
    main.ts          — Vue app bootstrap (createApp + Pinia + Router + mount)
    App.vue          — Root component (config-check redirect + keyboard shortcuts)
    api/             — HTTP client functions, one file per domain (Imperative Shell)
    assets/          — Static CSS and images
    components/      — Reusable presentational Vue components (Mixed FC/IS)
    composables/     — Vue composable hooks (Imperative Shell: Socket.IO, layout)
    layouts/         — App shell layout components
    router/          — Vue Router configuration with lazy-loaded views
    stores/          — Pinia stores (FC computed + IS API/WebSocket calls)
    types/           — Frontend-only TypeScript types
    utils/           — Pure utility functions (Functional Core, no side effects)
    views/           — Page-level routed Vue components (Mixed FC/IS)
  STRUCTURE.md       — this file
```
