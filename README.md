# Signalform

[![CI](https://img.shields.io/github/actions/workflow/status/Gontrum/signalform/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/Gontrum/signalform/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Gontrum/signalform?display_name=tag&sort=semver&style=flat-square)](https://github.com/Gontrum/signalform/releases)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Fgontrum%2Fsignalform-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/Gontrum/signalform/pkgs/container/signalform)
[![License](https://img.shields.io/github/license/Gontrum/signalform?style=flat-square)](LICENSE)

A self-hosted music player interface for [Lyrion Music Server (LMS)](https://lyrion.org/). Browse your local library, Qobuz, and Tidal from a single web UI — with artist enrichment via Last.fm and Fanart.tv.

## What is Signalform?

Signalform sits in front of your existing LMS installation and gives it a modern web interface. It does not replace LMS — LMS still manages your music library, streaming service integrations, and audio output. Signalform adds:

- **Unified search** across local library, Qobuz, and Tidal
- **Artist enrichment** — biographies, similar artists, and top tracks via Last.fm
- **Artist hero images** via Fanart.tv
- **Queue management** and playback control
- **Radio mode** — continuous playback based on artist similarity
- **PWA support** — installable on desktop and mobile via browser

## Architecture

Signalform follows a **Functional Core / Imperative Shell** architecture across
the monorepo. Pure domain logic lives in `core/`, while framework code, I/O,
and external integrations stay in `shell/`.

Contributor-facing architecture details live in
[CONTRIBUTING.md](CONTRIBUTING.md) and the full reference is in
[docs/architecture.md](docs/architecture.md).

## Requirements

- A running [Lyrion Music Server](https://lyrion.org/) instance reachable on your network
- Linux, macOS, or any Docker host that can run Linux containers
- The LMS player you want to control must already exist in LMS

## Installation

### Linux / macOS

Run the one-line installer on the machine where you want to host Signalform:

```bash
curl -fsSL https://raw.githubusercontent.com/Gontrum/signalform/main/install.sh | bash
```

The installer will:

1. Download the latest release
2. Walk you through a setup wizard (LMS host, port, player)
3. Register a system service (systemd on Linux, launchd on macOS) so Signalform starts automatically

After installation, open `http://<your-host>:3001` in your browser.

### Docker

Signalform is also available as a container image via GitHub Container Registry.
The container stores its runtime config in `/app/config/config.json`, so you should
persist `/app/config` either as a bind mount or as a named Docker volume.

#### Option A: Bind mount

This is often the most transparent setup because the config lives in a normal host directory:

```bash
mkdir -p ./signalform-config

docker run -d \
  --name signalform \
  --restart unless-stopped \
  -p 3001:3001 \
  -v "$(pwd)/signalform-config:/app/config" \
  ghcr.io/gontrum/signalform:latest
```

#### Option B: Named volume

This is the more Docker-native option and avoids host-path setup:

```bash
docker volume create signalform-config

docker run -d \
  --name signalform \
  --restart unless-stopped \
  -p 3001:3001 \
  -v signalform-config:/app/config \
  ghcr.io/gontrum/signalform:latest
```

Then open `http://<your-host>:3001` in your browser and complete the setup wizard.

Both approaches keep `config.json` persistent across container updates and restarts.

To use a specific release instead of `latest`, replace the tag, for example:

```bash
docker run -d \
  --name signalform \
  --restart unless-stopped \
  -p 3001:3001 \
  -v "$(pwd)/signalform-config:/app/config" \
  ghcr.io/gontrum/signalform:v0.9.0
```

### Installer options

| Option                 | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `--version <ver>`      | Install a specific release (e.g. `0.9.0`). Defaults to latest. |
| `--install-dir <path>` | Override the installation directory.                           |
| `--port <port>`        | Port Signalform listens on (default: `3001`).                  |
| `--lms-host <host>`    | LMS host address.                                              |
| `--lms-port <port>`    | LMS port (default: `9000`).                                    |
| `--player-id <id>`     | LMS player MAC address.                                        |
| `--no-service`         | Install files only; skip service registration.                 |
| `--yes`                | Non-interactive; accept all prompts.                           |
| `--dry-run`            | Show what would be done without making any changes.            |

## Update

```bash
signalform update
```

For Docker installs, pull the new image tag and recreate the container while reusing the
same bind-mounted directory or named volume.

## Uninstall

```bash
signalform uninstall
```

For Docker installs:

```bash
docker rm -f signalform
```

If you used a named volume and want to remove the saved config as well:

```bash
docker volume rm signalform-config
```

## Setup wizard

On first launch, Signalform opens a setup wizard in your browser. It will ask for:

1. **LMS connection** — the IP address and port of your LMS server
2. **Player** — which LMS player Signalform should control (auto-discovered)
3. **API keys** — optional, but recommended for the best experience:
   - **Last.fm** — enables artist biographies, similar artists, and top tracks
   - **Fanart.tv** — enables high-quality artist images

### Getting a Last.fm API key

1. Create a free account at [last.fm](https://www.last.fm/join) if you don't have one
2. Go to [last.fm/api/account/create](https://www.last.fm/api/account/create)
3. Fill in a name (e.g. "Signalform") and submit
4. Copy the **API key** shown on the next page and paste it into the wizard

### Getting a Fanart.tv API key

1. Create a free account at [fanart.tv](https://fanart.tv/register/)
2. After logging in, go to your [profile page](https://fanart.tv/profile/) and scroll down to **API key**
3. Copy the key and paste it into the wizard

Both keys are optional. You can skip them during setup and add them later via the Settings page.

## iOS / iPadOS (PWA)

Signalform can be installed as a PWA on iPhone and iPad via Safari → Share → Add to Home Screen.

**Known limitations on iOS:**

- **No background audio** — music pauses when the app is backgrounded or the screen locks. This is a WebKit restriction.
- **Safari only** — "Add to Home Screen" works only in Safari on iOS.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, and contribution guidelines.

## License

MIT — see [LICENSE](LICENSE).
