# Changelog

All notable changes to Signalform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Mobile app improvements
- Additional streaming service integrations
- Enhanced playlist management

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

[Unreleased]: https://github.com/Gontrum/signalform/compare/v0.9.8...HEAD
[0.9.8]: https://github.com/Gontrum/signalform/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/Gontrum/signalform/releases/tag/v0.9.7
[0.9.6]: https://github.com/Gontrum/signalform/releases/tag/v0.9.6
[0.9.5]: https://github.com/Gontrum/signalform/releases/tag/v0.9.5
[0.9.4]: https://github.com/Gontrum/signalform/releases/tag/v0.9.4
[0.9.3]: https://github.com/Gontrum/signalform/releases/tag/v0.9.3
[0.9.0]: https://github.com/Gontrum/signalform/releases/tag/v0.9.0
