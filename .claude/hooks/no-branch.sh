#!/bin/bash
# PreToolUse(Bash): trunk-based development – Feature-Branches entstehen nur,
# wenn der User sie ausdrücklich verlangt. Der Hook blockt das Anlegen; der
# User kann den Befehl selbst per `! git switch -c ...` ausführen.

if ! command -v jq >/dev/null 2>&1; then
  cat >/dev/null
  echo "no-branch.sh: jq fehlt – Branch-Gate kann nicht geprüft werden." >&2
  exit 2
fi

CMD=$(jq -r '.tool_input.command // empty')

# Das Subkommando muss direkt auf `git` folgen (nur -c/-C davor), sonst frisst
# der Wildcard Commit-Messages mit dem Wort "branch" darin.
if grep -qE '(^|[^-[:alnum:]])git +(-[cC] +[^ ]+ +)?(checkout +-[bB]|switch +-[cC]|branch +[^-]|worktree +add)' <<<"$CMD"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Trunk-based development: do not create branches. Commit to main, or ask the user if a branch is genuinely required and let them create it."
    }
  }'
fi

exit 0
