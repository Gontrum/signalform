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

[Unreleased]: https://github.com/Gontrum/signalform/compare/v0.9.4...HEAD
[0.9.4]: https://github.com/Gontrum/signalform/releases/tag/v0.9.4
[0.9.3]: https://github.com/Gontrum/signalform/releases/tag/v0.9.3
[0.9.0]: https://github.com/Gontrum/signalform/releases/tag/v0.9.0
