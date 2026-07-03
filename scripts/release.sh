#!/usr/bin/env bash
# Usage: bash scripts/release.sh <version>
#   e.g. bash scripts/release.sh 0.12.0
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  (e.g. $0 0.12.0)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"
LAST_TAG="$(git -C "$ROOT" describe --tags --abbrev=0 2>/dev/null || echo "")"

# ── 1. Bump version in all package.json files + README ────────────────────────
node "$ROOT/scripts/bump-version.mjs" "$VERSION"

# ── 2. Generate CHANGELOG section from conventional commits ───────────────────
RANGE="${LAST_TAG:+${LAST_TAG}..HEAD}"
RANGE="${RANGE:-HEAD}"

ADDED=""
FIXED=""
CHANGED=""

while IFS= read -r subject; do
  type="${subject%%(*}"         # everything before the first '('
  type="${type%%:*}"            # or before ':' if no scope
  msg="${subject#*: }"          # everything after ': '
  case "$type" in
    feat)     ADDED+="- ${msg}"$'\n' ;;
    fix)      FIXED+="- ${msg}"$'\n' ;;
    refactor|perf) CHANGED+="- ${msg}"$'\n' ;;
  esac
done < <(git -C "$ROOT" log "$RANGE" --format="%s" --no-merges)

TODAY="$(date +%Y-%m-%d)"

# Build the new section as a variable
NEW_SECTION="## [$VERSION] - $TODAY"$'\n'
if [[ -n "$ADDED" ]]; then
  NEW_SECTION+=$'\n'"### Added"$'\n\n'"${ADDED}"
fi
if [[ -n "$FIXED" ]]; then
  NEW_SECTION+=$'\n'"### Fixed"$'\n\n'"${FIXED}"
fi
if [[ -n "$CHANGED" ]]; then
  NEW_SECTION+=$'\n'"### Changed"$'\n\n'"${CHANGED}"
fi

# Insert after the first '---' separator (end of [Unreleased] block)
python3 - "$CHANGELOG" "$NEW_SECTION" <<'PYEOF'
import sys, re
path = sys.argv[1]
section = sys.argv[2]
content = open(path).read()
# Replace the first '---\n\n## [digit' with '---\n\nSECTION\n---\n\n## [digit'
content = re.sub(
    r'(---\n\n)(## \[\d)',
    r'\1' + section.replace('\\', r'\\') + r'\n---\n\n\2',
    content,
    count=1,
)
open(path, 'w').write(content)
PYEOF

echo ""
echo "──────────────────────────────────────────────"
echo "  CHANGELOG draft written — REVIEW BEFORE COMMIT"
echo "  $CHANGELOG"
echo "──────────────────────────────────────────────"
echo ""
echo "Press Enter to commit + tag, or Ctrl-C to abort and edit manually."
read -r

# ── 3. Commit and tag ─────────────────────────────────────────────────────────
git -C "$ROOT" add \
  package.json \
  packages/backend/package.json \
  packages/frontend/package.json \
  packages/shared/package.json \
  README.md \
  CHANGELOG.md

git -C "$ROOT" commit -m "chore: release v${VERSION}"
git -C "$ROOT" tag -a "v${VERSION}" -m "Release v${VERSION}"

echo ""
echo "✅ Committed and tagged v${VERSION}"
echo ""
echo "Push to trigger the release workflow:"
echo "  git push origin main && git push origin v${VERSION}"
