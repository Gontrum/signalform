#!/usr/bin/env bash
# Signalform Installer
# POSIX-compatible installer script for Signalform.
# Usage: bash install.sh [SUBCOMMAND] [OPTIONS]
#
# Subcommands:
#   install   (default) Download and install Signalform
#   update              Download and install a new version while preserving config
#   uninstall           Stop the service, remove all files, and clean up the CLI symlink
#
# Options:
#   --dry-run              Show what would be installed without making any changes
#   --version VERSION      Signalform version to install (default: latest)
#   --install-dir DIR      Override the installation directory
#   --url URL              Override the download URL (supports file:// for local tarballs)
#   --lms-host HOST        LMS host to write into config.json
#   --lms-port PORT        LMS port to write into config.json (default: 9000)
#   --player-id ID         LMS player ID to write into config.json
#   --port PORT            Port the service listens on (default: 3001)
#   --no-service           Skip systemd/launchd service registration
#   --yes                  Skip confirmation prompts
#   --help                 Show this help message and exit

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly SCRIPT_VERSION="0.1.0"
readonly APP_NAME="signalform"
readonly GITHUB_ORG="Gontrum"
readonly GITHUB_REPO="signalform"
readonly DEFAULT_LMS_PORT=9000
readonly DEFAULT_PORT=3001
readonly SERVICE_NAME="signalform"
readonly LAUNCHD_LABEL="com.signalform.app"
readonly CONFIG_FILENAME="config.json"
readonly BINARY_NAME="signalform"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

# Print an info message to stdout (blue prefix).
info() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

# Print a warning to stderr (yellow prefix).
warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2
}

# Print an error and exit non-zero (red prefix).
die() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

# Print a step line (numbered, used in dry-run and real install).
step() {
  printf '  %s\n' "$*"
}

# ---------------------------------------------------------------------------
# show_help
# ---------------------------------------------------------------------------
show_help() {
  cat <<EOF
Signalform Installer v${SCRIPT_VERSION}

USAGE:
  bash install.sh [SUBCOMMAND] [OPTIONS]

SUBCOMMANDS:
  install    (default) Download and install Signalform
  update               Download and install a new version while preserving config.json
  uninstall            Stop the service, remove all files, and clean up the CLI symlink

OPTIONS:
  --dry-run              Show what would be installed without making any changes
  --version VERSION      Signalform version to install (default: latest)
  --install-dir DIR      Override the installation directory
  --url URL              Override the download URL (supports file:// for local tarballs)
  --lms-host HOST        LMS host to pre-fill in config.json (optional — setup wizard runs on first start)
  --lms-port PORT        LMS port to pre-fill in config.json (default: ${DEFAULT_LMS_PORT})
  --player-id ID         LMS player ID to pre-fill in config.json (optional — setup wizard runs on first start)
  --port PORT            Port the service listens on (default: ${DEFAULT_PORT})
  --no-service           Skip systemd/launchd service registration
  --yes                  Skip confirmation prompts
  --help                 Show this help message and exit

DESCRIPTION:
  Downloads and installs Signalform (a Last.fm-enhanced LMS music player) on
  Linux (x64/arm64) or macOS (x64/arm64).

  After installation, open http://localhost:${DEFAULT_PORT} in your browser.
  A setup wizard will guide you through LMS host, port and player selection
  on first launch — no flags required for a standard installation.

  Default installation directories:
    root user     : /opt/${APP_NAME}
    non-root user : \$HOME/.local/share/${APP_NAME}

  Node.js is bundled inside the release tarball — no prior installation needed.
  Only bash, curl (or wget), and tar are required to run this installer.

UPDATE:
  bash install.sh update [OPTIONS]

  Downloads and installs a new version on top of the existing installation.
  config.json is always preserved (it is not included in the release tarball).
  The service is stopped before the update and restarted after.

  Examples:
    bash install.sh update --yes
    bash install.sh update --url file:///tmp/signalform-v1.2.3-linux-x64.tar.gz --yes
    bash install.sh update --version 1.2.3 --yes

UNINSTALL:
  bash install.sh uninstall [OPTIONS]

  Stops the service, removes the installation directory, and deletes the CLI
  symlink. The operation is idempotent: if the installation directory does not
  exist, a warning is printed and the command exits successfully.

  Examples:
    bash install.sh uninstall --yes
    bash install.sh uninstall --install-dir /srv/signalform --yes

EXAMPLES:
  # Preview what the installer will do (no changes made):
  bash install.sh --dry-run

  # Install a specific version:
  bash install.sh --version 1.2.3

  # Install to a custom directory without prompts:
  bash install.sh --install-dir /srv/signalform --yes

  # Install from a local tarball:
  bash install.sh --url file:///tmp/signalform-v1.2.3-linux-x64.tar.gz --yes

  # Install without registering a system service:
  bash install.sh --no-service --yes

  # Install and listen on a custom port:
  bash install.sh --port 4000 --yes

EOF
  exit 0
}

# ---------------------------------------------------------------------------
# detect_platform
# ---------------------------------------------------------------------------
# Sets PLATFORM to one of: linux-x64, linux-arm64, darwin-x64, darwin-arm64
detect_platform() {
  local os_raw arch_raw os arch

  os_raw="$(uname -s)"
  arch_raw="$(uname -m)"

  case "${os_raw}" in
    Linux)  os="linux"  ;;
    Darwin) os="darwin" ;;
    *)      die "Unsupported operating system: ${os_raw}. Supported: Linux, Darwin." ;;
  esac

  case "${arch_raw}" in
    x86_64)          arch="x64"   ;;
    aarch64 | arm64) arch="arm64" ;;
    *)               die "Unsupported architecture: ${arch_raw}. Supported: x86_64, aarch64/arm64." ;;
  esac

  PLATFORM="${os}-${arch}"
}

# ---------------------------------------------------------------------------
# check_embedded_node
# ---------------------------------------------------------------------------
# Verifies the embedded node binary in INSTALL_DIR/bin/node is executable.
# Called after extraction. Sets NODE_VERSION.
check_embedded_node() {
  local node_bin="${INSTALL_DIR}/bin/node"
  if [ ! -x "${node_bin}" ]; then
    die "Embedded Node.js binary not found at ${node_bin} — tarball may be corrupt."
  fi
  NODE_VERSION="$("${node_bin}" --version)"
}

# ---------------------------------------------------------------------------
# resolve_install_dir
# ---------------------------------------------------------------------------
# Sets INSTALL_DIR (uses --install-dir override if provided, then checks
# SIGNALFORM_INSTALL_DIR env var, then falls back to default paths).
resolve_install_dir() {
  if [ -n "${ARG_INSTALL_DIR}" ]; then
    INSTALL_DIR="${ARG_INSTALL_DIR}"
    return
  fi

  if [ -n "${SIGNALFORM_INSTALL_DIR:-}" ]; then
    INSTALL_DIR="${SIGNALFORM_INSTALL_DIR}"
    return
  fi

  # $EUID is available in bash; fall back to id -u for portability.
  local uid
  uid="${EUID:-$(id -u)}"

  if [ "${uid}" -eq 0 ]; then
    INSTALL_DIR="/opt/${APP_NAME}"
  else
    INSTALL_DIR="${HOME}/.local/share/${APP_NAME}"
  fi
}

# ---------------------------------------------------------------------------
# resolve_download_url
# ---------------------------------------------------------------------------
# Sets DOWNLOAD_URL. Uses --url override if provided; otherwise constructs
# the canonical GitHub Releases URL.
# When no --version is given (or version=latest), the GitHub Releases API is
# queried to resolve the actual tag name so the tarball filename is correct.
resolve_download_url() {
  if [ -n "${ARG_URL}" ]; then
    DOWNLOAD_URL="${ARG_URL}"
    return
  fi

  local version="${ARG_VERSION:-latest}"

  if [ "${version}" = "latest" ]; then
    local api_url="https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/releases/latest"
    local tag_name
    tag_name="$(curl -fsSL "${api_url}" 2>/dev/null \
      | grep '"tag_name"' \
      | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/' \
      | head -1)" || true

    if [ -z "${tag_name}" ]; then
      if [ -n "${ARG_DRY_RUN}" ]; then
        warn "Could not resolve latest release version from GitHub API — showing placeholder URL in dry-run."
        tag_name="UNRESOLVED"
      else
        die "Could not resolve latest release version from ${api_url}. Check your internet connection or specify --version explicitly."
      fi
    fi

    version="${tag_name}"
  fi

  local tarball_name="${APP_NAME}-v${version}-${PLATFORM}.tar.gz"
  DOWNLOAD_URL="https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/releases/download/v${version}/${tarball_name}"
}

# ---------------------------------------------------------------------------
# Service path helpers (pure — no side effects; reused by S03 uninstaller)
# ---------------------------------------------------------------------------

# Returns the systemd unit file path for the current user context.
get_systemd_unit_path() {
  local uid
  uid="${EUID:-$(id -u)}"
  if [ "${uid}" -eq 0 ]; then
    printf '/etc/systemd/system/%s.service' "${SERVICE_NAME}"
  else
    printf '%s/.config/systemd/user/%s.service' "${HOME}" "${SERVICE_NAME}"
  fi
}

# Returns the launchd plist file path for the current user context.
get_launchd_plist_path() {
  local uid
  uid="${EUID:-$(id -u)}"
  if [ "${uid}" -eq 0 ]; then
    printf '/Library/LaunchDaemons/%s.plist' "${LAUNCHD_LABEL}"
  else
    printf '%s/Library/LaunchAgents/%s.plist' "${HOME}" "${LAUNCHD_LABEL}"
  fi
}

# ---------------------------------------------------------------------------
# write_service_systemd
# ---------------------------------------------------------------------------
# Writes the systemd unit file to disk.
write_service_systemd() {
  local unit_path
  unit_path="$(get_systemd_unit_path)"

  local uid wanted_by
  uid="${EUID:-$(id -u)}"
  if [ "${uid}" -eq 0 ]; then
    wanted_by="multi-user.target"
  else
    wanted_by="default.target"
  fi

  info "Writing systemd unit: ${unit_path}"
  mkdir -p "$(dirname "${unit_path}")"

  cat > "${unit_path}" <<SYSTEMD_UNIT
[Unit]
Description=Signalform — Last.fm-enhanced LMS music player
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/bin/${BINARY_NAME}
Restart=on-failure
RestartSec=5
Environment=PORT=${ARG_PORT}
Environment=PATH=${INSTALL_DIR}/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=${wanted_by}
SYSTEMD_UNIT
}

# ---------------------------------------------------------------------------
# write_service_launchd
# ---------------------------------------------------------------------------
# Writes the launchd plist file to disk and creates the logs directory.
write_service_launchd() {
  local plist_path
  plist_path="$(get_launchd_plist_path)"

  info "Writing launchd plist: ${plist_path}"
  mkdir -p "$(dirname "${plist_path}")"
  mkdir -p "${INSTALL_DIR}/logs"

  cat > "${plist_path}" <<LAUNCHD_PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${INSTALL_DIR}/bin/${BINARY_NAME}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${ARG_PORT}</string>
    <key>PATH</key>
    <string>${INSTALL_DIR}/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${INSTALL_DIR}/logs/${SERVICE_NAME}.log</string>
  <key>StandardErrorPath</key>
  <string>${INSTALL_DIR}/logs/${SERVICE_NAME}.err</string>
</dict>
</plist>
LAUNCHD_PLIST
}

# ---------------------------------------------------------------------------
# register_service_systemd
# ---------------------------------------------------------------------------
register_service_systemd() {
  write_service_systemd

  local uid
  uid="${EUID:-$(id -u)}"

  if [ "${uid}" -eq 0 ]; then
    info "Enabling and starting ${SERVICE_NAME} via systemd (system)..."
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}"
    systemctl start  "${SERVICE_NAME}"
  else
    info "Enabling and starting ${SERVICE_NAME} via systemd (user)..."
    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}"
    systemctl --user start  "${SERVICE_NAME}"
    if command -v loginctl > /dev/null 2>&1; then
      loginctl enable-linger "$(whoami)" || true
    fi
  fi
}

# ---------------------------------------------------------------------------
# register_service_launchd
# ---------------------------------------------------------------------------
register_service_launchd() {
  write_service_launchd

  local plist_path
  plist_path="$(get_launchd_plist_path)"

  info "Loading ${LAUNCHD_LABEL} via launchd..."
  launchctl load -w "${plist_path}"
}

# ---------------------------------------------------------------------------
# register_service  (dispatcher)
# ---------------------------------------------------------------------------
register_service() {
  if [ -n "${ARG_NO_SERVICE}" ]; then
    info "Skipping service registration (--no-service)"
    return
  fi

  case "${PLATFORM}" in
    linux-*)
      if command -v systemctl > /dev/null 2>&1; then
        register_service_systemd
      else
        warn "systemctl not found — skipping service registration. Start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      fi
      ;;
    darwin-*)
      if command -v launchctl > /dev/null 2>&1; then
        register_service_launchd
      else
        warn "launchctl not found — skipping service registration. Start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      fi
      ;;
    *)
      warn "Unknown platform '${PLATFORM}' — skipping service registration."
      ;;
  esac
}

# ---------------------------------------------------------------------------
# stop_service / disable_service / start_service
# ---------------------------------------------------------------------------

stop_service() {
  case "${PLATFORM}" in
    linux-*)
      if ! command -v systemctl > /dev/null 2>&1; then return; fi
      local uid
      uid="${EUID:-$(id -u)}"
      if [ "${uid}" -eq 0 ]; then
        if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
          info "Stopping ${SERVICE_NAME} (systemd system)..."
          systemctl stop "${SERVICE_NAME}" || true
        fi
      else
        if systemctl --user is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
          info "Stopping ${SERVICE_NAME} (systemd user)..."
          systemctl --user stop "${SERVICE_NAME}" || true
        fi
      fi
      ;;
    darwin-*)
      if ! command -v launchctl > /dev/null 2>&1; then return; fi
      local plist_path
      plist_path="$(get_launchd_plist_path)"
      if [ -f "${plist_path}" ]; then
        info "Stopping ${LAUNCHD_LABEL} (launchd)..."
        launchctl unload "${plist_path}" 2>/dev/null || true
      fi
      ;;
  esac
}

disable_service() {
  case "${PLATFORM}" in
    linux-*)
      if ! command -v systemctl > /dev/null 2>&1; then return; fi
      local uid
      uid="${EUID:-$(id -u)}"
      if [ "${uid}" -eq 0 ]; then
        if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
          info "Disabling ${SERVICE_NAME} (systemd system)..."
          systemctl disable "${SERVICE_NAME}" || true
        fi
        local unit_path
        unit_path="$(get_systemd_unit_path)"
        rm -f "${unit_path}"
        systemctl daemon-reload || true
      else
        if systemctl --user is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
          info "Disabling ${SERVICE_NAME} (systemd user)..."
          systemctl --user disable "${SERVICE_NAME}" || true
        fi
        local unit_path
        unit_path="$(get_systemd_unit_path)"
        rm -f "${unit_path}"
        systemctl --user daemon-reload || true
      fi
      ;;
    darwin-*)
      if ! command -v launchctl > /dev/null 2>&1; then return; fi
      local plist_path
      plist_path="$(get_launchd_plist_path)"
      rm -f "${plist_path}"
      ;;
  esac
}

start_service() {
  if [ -n "${ARG_NO_SERVICE}" ]; then
    info "Skipping service start (--no-service)"
    return
  fi

  case "${PLATFORM}" in
    linux-*)
      if ! command -v systemctl > /dev/null 2>&1; then
        warn "systemctl not found — skipping service start. Start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
        return
      fi
      local uid
      uid="${EUID:-$(id -u)}"
      if [ "${uid}" -eq 0 ]; then
        info "Starting ${SERVICE_NAME} (systemd system)..."
        systemctl start "${SERVICE_NAME}" || warn "Failed to start ${SERVICE_NAME} — start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      else
        info "Starting ${SERVICE_NAME} (systemd user)..."
        systemctl --user start "${SERVICE_NAME}" || warn "Failed to start ${SERVICE_NAME} — start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      fi
      ;;
    darwin-*)
      if ! command -v launchctl > /dev/null 2>&1; then
        warn "launchctl not found — skipping service start. Start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
        return
      fi
      local plist_path
      plist_path="$(get_launchd_plist_path)"
      if [ -f "${plist_path}" ]; then
        info "Starting ${LAUNCHD_LABEL} (launchd)..."
        launchctl load -w "${plist_path}" || warn "Failed to load ${LAUNCHD_LABEL} — start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      else
        warn "launchd plist not found at ${plist_path} — start manually: ${INSTALL_DIR}/bin/${BINARY_NAME}"
      fi
      ;;
    *)
      warn "Unknown platform '${PLATFORM}' — skipping service start."
      ;;
  esac
}

# ---------------------------------------------------------------------------
# print_dry_run
# ---------------------------------------------------------------------------
print_dry_run() {
  local config_path="${INSTALL_DIR}/${CONFIG_FILENAME}"
  local bin_dir bin_symlink
  local uid
  uid="${EUID:-$(id -u)}"

  if [ "${uid}" -eq 0 ]; then
    bin_dir="/usr/local/bin"
  else
    bin_dir="${HOME}/.local/bin"
  fi
  bin_symlink="${bin_dir}/${BINARY_NAME}"

  printf '\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;32m   Signalform Installer — Dry-Run Plan\033[0m\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  %-22s %s\n' "Platform:"        "${PLATFORM}"
  printf '  %-22s %s\n' "Install version:" "${ARG_VERSION:-latest}"
  printf '  %-22s %s\n' "Install dir:"     "${INSTALL_DIR}"
  printf '  %-22s %s\n' "Download URL:"    "${DOWNLOAD_URL}"
  printf '  %-22s %s\n' "Config file:"     "${config_path}"
  printf '  %-22s %s\n' "CLI symlink:"     "${bin_symlink}"
  printf '  %-22s %s\n' "Service port:"    "${ARG_PORT}"
  printf '\n'
  printf '\033[1;34mInstallation steps that would be performed:\033[0m\n'
  step "1. Create installation directory: ${INSTALL_DIR}"
  step "2. Download tarball from: ${DOWNLOAD_URL}"
  step "3. Extract tarball into: ${INSTALL_DIR}"
  step "   (tarball includes Node.js — no system Node.js required)"
  step "4. Write start wrapper: ${INSTALL_DIR}/bin/${BINARY_NAME}"
  step "   (uses embedded ${INSTALL_DIR}/bin/node)"
  step "6. Write config skeleton: ${config_path}"
  if [ -n "${ARG_LMS_HOST}" ]; then
    step "   lmsHost  = ${ARG_LMS_HOST}"
  fi
  step "   lmsPort  = ${ARG_LMS_PORT}"
  if [ -n "${ARG_PLAYER_ID}" ]; then
    step "   playerId = ${ARG_PLAYER_ID}"
  fi
  step "7. Create CLI symlink: ${bin_symlink} -> ${INSTALL_DIR}/bin/${BINARY_NAME}"
  if [ -n "${ARG_NO_SERVICE}" ]; then
    step "8-9. Service registration: skipped (--no-service)"
  else
    local service_file_path
    case "${PLATFORM}" in
      linux-*)  service_file_path="$(get_systemd_unit_path)" ;;
      darwin-*) service_file_path="$(get_launchd_plist_path)" ;;
      *)        service_file_path="(unknown platform)" ;;
    esac
    step "8. Write service file: ${service_file_path}"
    step "   WorkingDirectory = ${INSTALL_DIR}"
    step "   ExecStart        = ${INSTALL_DIR}/bin/${BINARY_NAME}"
    step "   PORT             = ${ARG_PORT}"
    case "${PLATFORM}" in
      linux-*)
        local uid2
        uid2="${EUID:-$(id -u)}"
        if [ "${uid2}" -eq 0 ]; then
          step "9. systemctl daemon-reload && systemctl enable ${SERVICE_NAME} && systemctl start ${SERVICE_NAME}"
        else
          step "9. systemctl --user daemon-reload && systemctl --user enable ${SERVICE_NAME} && systemctl --user start ${SERVICE_NAME}"
        fi
        ;;
      darwin-*)
        step "9. launchctl load -w ${service_file_path}"
        ;;
    esac
  fi
  step "10. Copy installer script: ${INSTALL_DIR}/installer.sh"
  printf '\n'
  printf '\033[1;33m[DRY-RUN] No files were written. Re-run without --dry-run to install.\033[0m\n'
  printf '\033[1;32mDry-run complete.\033[0m\n'
  printf '\n'
  exit 0
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
ARG_SUBCOMMAND="install"
ARG_DRY_RUN=""
ARG_VERSION=""
ARG_INSTALL_DIR=""
ARG_URL=""
ARG_LMS_HOST=""
ARG_LMS_PORT="${DEFAULT_LMS_PORT}"
ARG_PLAYER_ID=""
ARG_PORT="${DEFAULT_PORT}"
ARG_NO_SERVICE=""
ARG_YES=""

parse_args() {
  # Detect optional leading subcommand (install|update|uninstall).
  if [ $# -gt 0 ]; then
    case "$1" in
      install | update | uninstall)
        ARG_SUBCOMMAND="$1"
        shift
        ;;
    esac
  fi

  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run)
        ARG_DRY_RUN="1"
        shift
        ;;
      --version)
        [ $# -ge 2 ] || die "--version requires an argument"
        ARG_VERSION="$2"
        shift 2
        ;;
      --install-dir)
        [ $# -ge 2 ] || die "--install-dir requires an argument"
        ARG_INSTALL_DIR="$2"
        shift 2
        ;;
      --url)
        [ $# -ge 2 ] || die "--url requires an argument"
        ARG_URL="$2"
        shift 2
        ;;
      --lms-host)
        [ $# -ge 2 ] || die "--lms-host requires an argument"
        ARG_LMS_HOST="$2"
        shift 2
        ;;
      --lms-port)
        [ $# -ge 2 ] || die "--lms-port requires an argument"
        ARG_LMS_PORT="$2"
        shift 2
        ;;
      --player-id)
        [ $# -ge 2 ] || die "--player-id requires an argument"
        ARG_PLAYER_ID="$2"
        shift 2
        ;;
      --port)
        [ $# -ge 2 ] || die "--port requires an argument"
        ARG_PORT="$2"
        shift 2
        ;;
      --no-service)
        ARG_NO_SERVICE="1"
        shift
        ;;
      --yes | -y)
        ARG_YES="1"
        shift
        ;;
      --help | -h)
        show_help
        ;;
      -*)
        die "Unknown option: $1. Run 'bash install.sh --help' for usage."
        ;;
      *)
        die "Unexpected argument: $1. Run 'bash install.sh --help' for usage."
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# confirm_install
# ---------------------------------------------------------------------------
# Prints the install summary and prompts for confirmation (unless --yes).
confirm_install() {
  local uid
  uid="${EUID:-$(id -u)}"
  local bin_dir
  if [ "${uid}" -eq 0 ]; then
    bin_dir="/usr/local/bin"
  else
    bin_dir="${HOME}/.local/bin"
  fi

  printf '\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;32m   Signalform Installer\033[0m\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  %-22s %s\n' "Platform:"        "${PLATFORM}"
  printf '  %-22s %s\n' "Install version:" "${ARG_VERSION:-latest}"
  printf '  %-22s %s\n' "Install dir:"     "${INSTALL_DIR}"
  printf '  %-22s %s\n' "Download URL:"    "${DOWNLOAD_URL}"
  printf '  %-22s %s\n' "CLI symlink:"     "${bin_dir}/${BINARY_NAME}"
  printf '  %-22s %s\n' "Service port:"    "${ARG_PORT}"
  printf '\n'

  if [ -n "${ARG_YES}" ]; then
    return
  fi

  printf 'Proceed with installation? [y/N] '
  read -r reply
  case "${reply}" in
    [Yy] | [Yy][Ee][Ss]) ;;
    *) die "Installation cancelled." ;;
  esac
}

# ---------------------------------------------------------------------------
# do_install
# ---------------------------------------------------------------------------
do_install() {
  local tarball_path
  tarball_path="$(mktemp /tmp/signalform-install-XXXXXX.tar.gz)"
  # shellcheck disable=SC2064
  trap "rm -f '${tarball_path}'" EXIT

  # ---- Step 1: Download or copy tarball -----------------------------------
  info "Fetching tarball..."
  case "${DOWNLOAD_URL}" in
    file://*)
      # Strip the file:// prefix to get the local filesystem path.
      local local_path
      local_path="${DOWNLOAD_URL#file://}"
      [ -f "${local_path}" ] || die "Local tarball not found: ${local_path}"
      cp "${local_path}" "${tarball_path}"
      info "Copied local tarball: ${local_path}"
      ;;
    http://* | https://*)
      curl --fail --location --progress-bar \
        --output "${tarball_path}" \
        "${DOWNLOAD_URL}" \
        || die "Failed to download tarball from: ${DOWNLOAD_URL}"
      info "Downloaded tarball from: ${DOWNLOAD_URL}"
      ;;
    *)
      die "Unsupported URL scheme in: ${DOWNLOAD_URL}"
      ;;
  esac

  # ---- Step 2: Create install directory and extract -----------------------
  info "Creating install directory: ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}"

  info "Extracting tarball into: ${INSTALL_DIR}"
  tar -xzf "${tarball_path}" -C "${INSTALL_DIR}"

  # ---- Step 3: Verify embedded Node.js and make wrapper executable --------
  check_embedded_node
  info "Embedded Node.js: ${NODE_VERSION}"
  chmod +x "${INSTALL_DIR}/bin/${BINARY_NAME}"

  # Wrap the tarball's bin/signalform with a CLI dispatcher that also handles
  # update/uninstall subcommands by delegating to the installer script.
  local wrapper_path="${INSTALL_DIR}/bin/${BINARY_NAME}"
  cat > "${wrapper_path}" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR}"
export SIGNALFORM_FRONTEND_DIST_PATH="\${INSTALL_DIR}/frontend/dist"
_cmd="\${1:-}"
case "\${_cmd}" in
  update | uninstall | install)
    shift
    exec bash "\${INSTALL_DIR}/installer.sh" "\${_cmd}" "\$@"
    ;;
  *)
    exec "\${INSTALL_DIR}/bin/node" "\${INSTALL_DIR}/dist/index.js" "\$@"
    ;;
esac
WRAPPER
  chmod +x "${wrapper_path}"

  # ---- Step 4: Write config.json skeleton (preserve if already exists) ----
  local config_path="${INSTALL_DIR}/${CONFIG_FILENAME}"

  if [ -f "${config_path}" ]; then
    warn "config.json already exists at ${config_path} — preserving existing configuration."
  else
    info "Writing config skeleton: ${config_path}"
    cat > "${config_path}" <<CONFIG
{
  "lmsHost": "${ARG_LMS_HOST}",
  "lmsPort": ${ARG_LMS_PORT},
  "playerId": "${ARG_PLAYER_ID}",
  "lastFmApiKey": "",
  "fanartApiKey": ""
}
CONFIG
  fi

  # ---- Step 5: Create CLI symlink -----------------------------------------
  local uid
  uid="${EUID:-$(id -u)}"
  local bin_dir
  if [ "${uid}" -eq 0 ]; then
    bin_dir="/usr/local/bin"
  else
    bin_dir="${HOME}/.local/bin"
  fi
  local bin_symlink="${bin_dir}/${BINARY_NAME}"

  info "Creating CLI symlink: ${bin_symlink} -> ${wrapper_path}"
  mkdir -p "${bin_dir}"
  ln -sf "${wrapper_path}" "${bin_symlink}"

  # ---- Step 6: Register system service ------------------------------------
  register_service

  # ---- Step 7: Copy installer script for future update/uninstall ----------
  info "Copying installer script: ${INSTALL_DIR}/installer.sh"
  cp "${BASH_SOURCE[0]}" "${INSTALL_DIR}/installer.sh"
  chmod +x "${INSTALL_DIR}/installer.sh"

  # ---- Completion banner --------------------------------------------------
  local service_note
  if [ -n "${ARG_NO_SERVICE}" ]; then
    service_note="(service registration skipped — use --no-service was set)"
  else
    case "${PLATFORM}" in
      linux-*)  service_note="systemd unit: $(get_systemd_unit_path)" ;;
      darwin-*) service_note="launchd plist: $(get_launchd_plist_path)" ;;
      *)        service_note="(service registration not supported on ${PLATFORM})" ;;
    esac
  fi

  printf '\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;32m   Installation complete!\033[0m\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  Installed to: %s\n' "${INSTALL_DIR}"
  printf '  Start wrapper: %s\n' "${wrapper_path}"
  printf '  CLI symlink:   %s\n' "${bin_symlink}"
  if [ ! -f "${config_path}" ]; then
    printf '  Config file:   %s (skeleton written)\n' "${config_path}"
  else
    printf '  Config file:   %s (preserved)\n' "${config_path}"
  fi
  printf '  Service:       %s\n' "${service_note}"
  printf '\n'
  printf '  Run \033[1msignalform\033[0m (or \033[1mbash %s\033[0m) to start.\n' "${wrapper_path}"
  printf '\n'
  if [ -z "${ARG_LMS_HOST}" ]; then
    printf '  \033[1;33m→ Open http://localhost:%s in your browser.\033[0m\n' "${ARG_PORT}"
    printf '    A setup wizard will guide you through LMS configuration.\n'
  else
    printf '  \033[1;33m→ Open http://localhost:%s in your browser.\033[0m\n' "${ARG_PORT}"
  fi
  printf '\n'
}

# ---------------------------------------------------------------------------
# confirm_uninstall
# ---------------------------------------------------------------------------
confirm_uninstall() {
  printf '\n'
  printf '\033[1;33m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;33m   Signalform Uninstaller\033[0m\n'
  printf '\033[1;33m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  %-22s %s\n' "Install dir:"  "${INSTALL_DIR}"
  printf '\n'
  printf '  This will:\n'
  printf '    - Stop and disable the %s service\n'    "${SERVICE_NAME}"
  printf '    - Remove the installation directory\n'
  printf '    - Remove the CLI symlink\n'
  printf '\n'

  if [ -n "${ARG_YES}" ]; then
    return
  fi

  printf 'Proceed with uninstallation? [y/N] '
  read -r reply
  case "${reply}" in
    [Yy] | [Yy][Ee][Ss]) ;;
    *) die "Uninstallation cancelled." ;;
  esac
}

# ---------------------------------------------------------------------------
# do_update
# ---------------------------------------------------------------------------
do_update() {
  info "Stopping service before update..."
  stop_service

  local tarball_path
  tarball_path="$(mktemp /tmp/signalform-update-XXXXXX.tar.gz)"
  # shellcheck disable=SC2064
  trap "rm -f '${tarball_path}'" EXIT

  # ---- Download or copy tarball -------------------------------------------
  info "Fetching tarball for update..."
  case "${DOWNLOAD_URL}" in
    file://*)
      local local_path
      local_path="${DOWNLOAD_URL#file://}"
      [ -f "${local_path}" ] || die "Local tarball not found: ${local_path}"
      cp "${local_path}" "${tarball_path}"
      info "Copied local tarball: ${local_path}"
      ;;
    http://* | https://*)
      curl --fail --location --progress-bar \
        --output "${tarball_path}" \
        "${DOWNLOAD_URL}" \
        || die "Failed to download tarball from: ${DOWNLOAD_URL}"
      info "Downloaded tarball from: ${DOWNLOAD_URL}"
      ;;
    *)
      die "Unsupported URL scheme in: ${DOWNLOAD_URL}"
      ;;
  esac

  # ---- Extract into install dir (config.json is not in tarball) -----------
  info "Extracting tarball into: ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}"
  tar -xzf "${tarball_path}" -C "${INSTALL_DIR}"

  # ---- Rewrite start wrapper with updated version -------------------------
  local wrapper_dir="${INSTALL_DIR}/bin"
  local wrapper_path="${wrapper_dir}/${BINARY_NAME}"

  info "Updating start wrapper: ${wrapper_path}"
  mkdir -p "${wrapper_dir}"

  cat > "${wrapper_path}" <<WRAPPER
#!/usr/bin/env bash
# Signalform CLI wrapper — generated by installer v${SCRIPT_VERSION}
# Routes subcommands: install/update/uninstall go to installer, everything
# else is forwarded to the Node.js application.
export SIGNALFORM_INSTALL_DIR="${INSTALL_DIR}"
export SIGNALFORM_FRONTEND_DIST_PATH="${INSTALL_DIR}/frontend/dist"
_cmd="\${1:-}"
case "\${_cmd}" in
  update | uninstall | install)
    shift
    exec bash "${INSTALL_DIR}/installer.sh" "\${_cmd}" "\$@"
    ;;
  *)
    exec node "${INSTALL_DIR}/dist/index.js" "\$@"
    ;;
esac
WRAPPER

  chmod +x "${wrapper_path}"

  # ---- Copy updated installer script --------------------------------------
  info "Updating installer script: ${INSTALL_DIR}/installer.sh"
  cp "${BASH_SOURCE[0]}" "${INSTALL_DIR}/installer.sh"
  chmod +x "${INSTALL_DIR}/installer.sh"

  # ---- Restart service -----------------------------------------------------
  info "Restarting service after update..."
  start_service

  printf '\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;32m   Update complete!\033[0m\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  Updated to: %s\n' "${INSTALL_DIR}"
  printf '\n'
}

# ---------------------------------------------------------------------------
# do_uninstall
# ---------------------------------------------------------------------------
do_uninstall() {
  if [ ! -d "${INSTALL_DIR}" ]; then
    warn "Installation directory not found: ${INSTALL_DIR} — nothing to uninstall."
    exit 0
  fi

  # ---- Stop and disable the service ---------------------------------------
  info "Stopping service..."
  stop_service

  info "Disabling service..."
  disable_service

  # ---- Remove CLI symlink --------------------------------------------------
  local uid
  uid="${EUID:-$(id -u)}"
  local bin_dir
  if [ "${uid}" -eq 0 ]; then
    bin_dir="/usr/local/bin"
  else
    bin_dir="${HOME}/.local/bin"
  fi
  local bin_symlink="${bin_dir}/${BINARY_NAME}"

  if [ -L "${bin_symlink}" ]; then
    info "Removing CLI symlink: ${bin_symlink}"
    rm -f "${bin_symlink}"
  else
    warn "CLI symlink not found at ${bin_symlink} — skipping."
  fi

  # ---- Remove installation directory --------------------------------------
  info "Removing installation directory: ${INSTALL_DIR}"
  rm -rf "${INSTALL_DIR}"

  printf '\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\033[1;32m   Uninstallation complete!\033[0m\n'
  printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n'
  printf '\n'
  printf '  Removed: %s\n'    "${INSTALL_DIR}"
  printf '  Removed: %s\n'    "${bin_symlink}"
  printf '\n'
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"

  detect_platform
  resolve_install_dir

  case "${ARG_SUBCOMMAND}" in
    uninstall)
      confirm_uninstall
      do_uninstall
      ;;
    update)
      resolve_download_url

      if [ -n "${ARG_DRY_RUN}" ]; then
        print_dry_run
      fi

      do_update
      ;;
    install)
      resolve_download_url

      if [ -n "${ARG_DRY_RUN}" ]; then
        print_dry_run
      fi

      confirm_install
      do_install
      ;;
    *)
      die "Unknown subcommand: ${ARG_SUBCOMMAND}. Run 'bash install.sh --help' for usage."
      ;;
  esac
}

main "$@"
