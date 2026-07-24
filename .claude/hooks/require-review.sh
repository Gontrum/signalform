#!/bin/bash
# PreToolUse(Bash): best-effort gate for CLAUDE.md's "@reviewer MUST run
# before every commit that includes agent-written code". Catches the
# accidental case (forgot to run reviewer) via a timestamp marker reviewer.md
# writes on completion — not a defense against deliberate bypass, a bash
# hook can't verify that.

INPUT=$(cat)
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")

case "$CMD" in
  git\ commit*)
    if git diff --cached --name-only 2>/dev/null | grep -qE '/(core|shell)/'; then
      MARKER=".claude/.reviewer-ran"
      LAST=$(cat "$MARKER" 2>/dev/null || echo 0)
      NOW=$(date +%s)
      if [ $((NOW - LAST)) -gt 1800 ]; then
        jq -n '{
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "No recent @reviewer run recorded for staged core/shell changes (older than 30min or missing). Run @reviewer first."
          }
        }'
        exit 0
      fi
    fi
    ;;
esac

exit 0
