#!/bin/bash
# Stop hook: typecheck the whole workspace once the agent is done responding.
# Deliberately not in PostToolUse — too slow to run after every single edit.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"

command -v pnpm >/dev/null 2>&1 || exit 0

cd "$ROOT_DIR" || exit 0

OUTPUT=$(pnpm -r run type-check 2>&1)
STATUS=$?
[ $STATUS -eq 0 ] && exit 0

echo "$OUTPUT" >&2
exit 2
