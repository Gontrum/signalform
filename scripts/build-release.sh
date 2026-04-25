#!/usr/bin/env bash
# build-release.sh — Build a Signalform release tarball from the monorepo.
#
# Usage:
#   bash scripts/build-release.sh --version VERSION [--output-dir DIR]
#
# Options:
#   --version VERSION    (required) Version string, e.g. 1.2.3 or 0.0.1-test
#   --output-dir DIR     Directory to write the tarball (default: ./dist-release/)
#   --help               Show this help and exit

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly SCRIPT_NAME="build-release.sh"
readonly APP_NAME="signalform"

# Node.js LTS version to embed in the release tarball.
# Update this when moving to a new LTS line.
readonly NODE_VERSION_EMBED="22.22.2"
readonly NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION_EMBED}"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
log() {
  printf '\033[1;34m[build]\033[0m %s\n' "$*"
}

die() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

show_help() {
  cat <<EOF
${SCRIPT_NAME} — Build a Signalform release tarball

USAGE:
  bash scripts/${SCRIPT_NAME} --version VERSION [--output-dir DIR]

OPTIONS:
  --version VERSION    (required) Version string, e.g. 1.2.3 or 0.0.1-test
  --output-dir DIR     Output directory for the tarball (default: ./dist-release/)
  --help               Show this help and exit

EXAMPLES:
  bash scripts/${SCRIPT_NAME} --version 1.2.3
  bash scripts/${SCRIPT_NAME} --version 0.0.1-test --output-dir /tmp/release/

EOF
  exit 0
}

# ---------------------------------------------------------------------------
# detect_platform
# ---------------------------------------------------------------------------
detect_platform() {
  local os_raw arch_raw os arch

  os_raw="$(uname -s)"
  arch_raw="$(uname -m)"

  case "${os_raw}" in
    Linux)  os="linux"  ;;
    Darwin) os="darwin" ;;
    *)      die "Unsupported OS: ${os_raw}" ;;
  esac

  case "${arch_raw}" in
    x86_64)          arch="x64"   ;;
    aarch64 | arm64) arch="arm64" ;;
    *)               die "Unsupported architecture: ${arch_raw}" ;;
  esac

  PLATFORM="${os}-${arch}"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
ARG_VERSION=""
ARG_OUTPUT_DIR="./dist-release/"

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --version)
        [ $# -ge 2 ] || die "--version requires an argument"
        ARG_VERSION="$2"
        shift 2
        ;;
      --output-dir)
        [ $# -ge 2 ] || die "--output-dir requires an argument"
        ARG_OUTPUT_DIR="$2"
        shift 2
        ;;
      --help | -h)
        show_help
        ;;
      -*)
        die "Unknown option: $1. Run 'bash scripts/${SCRIPT_NAME} --help' for usage."
        ;;
      *)
        die "Unexpected argument: $1. Run 'bash scripts/${SCRIPT_NAME} --help' for usage."
        ;;
    esac
  done

  [ -n "${ARG_VERSION}" ] || die "--version is required (e.g. --version 1.2.3)"
}

# ---------------------------------------------------------------------------
# embed_node — Download and embed the Node.js binary for the target platform
# ---------------------------------------------------------------------------
embed_node() {
  local staging_dir="$1"
  local platform="$2"

  # Map our platform identifier to the Node.js download name
  local node_platform
  case "${platform}" in
    linux-x64)   node_platform="linux-x64"   ;;
    linux-arm64) node_platform="linux-arm64" ;;
    darwin-arm64) node_platform="darwin-arm64" ;;
    darwin-x64)  node_platform="darwin-x64"  ;;
    *) die "No Node.js download mapping for platform: ${platform}" ;;
  esac

  local node_tarball="node-v${NODE_VERSION_EMBED}-${node_platform}.tar.gz"
  local node_url="${NODE_BASE_URL}/${node_tarball}"
  local node_tmp
  node_tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${node_tmp}'; rm -rf '${staging_dir}'" EXIT

  log "  Downloading Node.js v${NODE_VERSION_EMBED} for ${node_platform}..."
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL --progress-bar "${node_url}" -o "${node_tmp}/${node_tarball}"
  elif command -v wget > /dev/null 2>&1; then
    wget -q --show-progress "${node_url}" -O "${node_tmp}/${node_tarball}"
  else
    die "Neither curl nor wget found — cannot download Node.js"
  fi

  log "  Extracting Node.js binary..."
  tar -xzf "${node_tmp}/${node_tarball}" -C "${node_tmp}"
  local node_dir
  node_dir="${node_tmp}/node-v${NODE_VERSION_EMBED}-${node_platform}"

  mkdir -p "${staging_dir}/bin"
  cp "${node_dir}/bin/node" "${staging_dir}/bin/node"
  chmod +x "${staging_dir}/bin/node"

  log "  Embedded Node.js: $("${staging_dir}/bin/node" --version)"
  rm -rf "${node_tmp}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"
  detect_platform

  local version="${ARG_VERSION}"
  local output_dir="${ARG_OUTPUT_DIR}"
  local tarball_name="${APP_NAME}-v${version}-${PLATFORM}.tar.gz"
  local staging_dir
  staging_dir="$(mktemp -d)"

  # Ensure staging dir is cleaned up on exit (success or failure).
  # shellcheck disable=SC2064
  trap "rm -rf '${staging_dir}'" EXIT

  log "Building Signalform v${version} for ${PLATFORM}"
  log "Staging directory: ${staging_dir}"
  log "Output directory:  ${output_dir}"

  # -------------------------------------------------------------------------
  # Step 1: Build all packages
  # -------------------------------------------------------------------------
  log "Step 1/6: Running pnpm build..."
  pnpm run build

  # -------------------------------------------------------------------------
  # Step 2: Deploy backend with production deps to staging dir
  # -------------------------------------------------------------------------
  log "Step 2/6: Deploying backend with production deps..."
  # Use node-linker=hoisted so pnpm writes real files instead of symlinks.
  # This produces a portable node_modules that works without pnpm on the target.
  pnpm --filter @signalform/backend deploy --prod \
    --config.node-linker=hoisted \
    "${staging_dir}"



  # -------------------------------------------------------------------------
  # Step 3: Embed Node.js binary for the target platform
  # -------------------------------------------------------------------------
  log "Step 3/6: Embedding Node.js v${NODE_VERSION_EMBED}..."
  embed_node "${staging_dir}" "${PLATFORM}"

  # Write the start wrapper that uses the embedded node binary.
  # The installer copies this directly — no need to generate it at install time.
  mkdir -p "${staging_dir}/bin"
  cat > "${staging_dir}/bin/signalform" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "${SCRIPT_DIR}")"
export SIGNALFORM_FRONTEND_DIST_PATH="${INSTALL_DIR}/frontend/dist"
exec "${INSTALL_DIR}/bin/node" "${INSTALL_DIR}/dist/index.js" "$@"
WRAPPER
  chmod +x "${staging_dir}/bin/signalform"

  # -------------------------------------------------------------------------
  # Step 4: Copy frontend dist into staging dir
  # -------------------------------------------------------------------------
  log "Step 4/6: Copying frontend dist..."
  mkdir -p "${staging_dir}/frontend"
  cp -r packages/frontend/dist "${staging_dir}/frontend/dist"

  # -------------------------------------------------------------------------
  # Step 5: Strip dev-only artifacts from staging dir
  # -------------------------------------------------------------------------
  log "Step 5/6: Stripping dev artifacts..."
  # Only strip src/ from the app dist, NOT from node_modules packages
  # (some packages like 'debug' ship their source in src/ as the main entry).
  find "${staging_dir}/dist" -name "src" -type d -exec rm -rf {} + 2>/dev/null || true
  find "${staging_dir}" -name "tsconfig*.json" \
    -not -path "*/node_modules/*" -delete 2>/dev/null || true
  find "${staging_dir}" -name "vitest*" -delete 2>/dev/null || true
  find "${staging_dir}" -name "*.test.ts" -delete 2>/dev/null || true
  find "${staging_dir}" -name "*.spec.ts" -delete 2>/dev/null || true
  find "${staging_dir}" -name ".env" -delete 2>/dev/null || true
  find "${staging_dir}" -name ".env.*" -delete 2>/dev/null || true
  find "${staging_dir}" -name "coverage" -type d -exec rm -rf {} + 2>/dev/null || true

  # -------------------------------------------------------------------------
  # Step 6: Create tarball
  # -------------------------------------------------------------------------
  log "Step 6/6: Creating tarball..."
  mkdir -p "${output_dir}"
  local output_path
  output_path="$(cd "${output_dir}" && pwd)/${tarball_name}"

  tar -czf "${output_path}" -C "${staging_dir}" .

  log "Done! Tarball written to: ${output_path}"
  log "Size: $(du -sh "${output_path}" | cut -f1)"
}

main "$@"
