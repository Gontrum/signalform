#!/bin/bash
# PostToolUse: format only the file that was just edited/written. No repo-wide
# sweep here — see the pre-commit hook's comment for why that broke grouped
# commits before. No typecheck/lint here either: keep the hot path fast.

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
PRETTIER="$ROOT_DIR/node_modules/.bin/prettier"

INPUT=$(cat)
FILE_PATH=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0

case "$FILE_PATH" in
  *.ts | *.tsx | *.vue | *.js | *.cjs | *.mjs | *.json | *.md | *.yml | *.yaml) ;;
  *) exit 0 ;;
esac

[ -x "$PRETTIER" ] || exit 0

"$PRETTIER" --write "$FILE_PATH" >/dev/null 2>&1
exit 0
