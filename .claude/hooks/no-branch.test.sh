#!/bin/bash
# Regressionstest für no-branch.sh. Die Fälle unten sind real aufgetreten:
# der erste Regex-Wurf blockte `git commit -m "... block branch creation ..."`,
# weil der Wildcard zwischen `git` und dem Keyword durch die Message lief.
# Aufruf: bash .claude/hooks/no-branch.test.sh

cd "$(dirname "$0")" || exit 1

cases=(
  "deny	git switch -c feat/x"
  "deny	git checkout -b feat/x"
  "deny	cd packages/frontend && git checkout -B foo"
  "deny	git worktree add ../wt -b feat/y"
  "deny	git branch feat/z"
  "deny	git -C /repo switch -c feat/a"
  "allow	git commit -q -m 'build(hooks): block branch creation to keep trunk-based flow'"
  "allow	git branch -d old"
  "allow	git branch --list"
  "allow	git branch"
  "allow	git switch main"
  "allow	git merge --ff-only feat/playlist-delete"
)

fail=0
for case in "${cases[@]}"; do
  want=${case%%$'\t'*}
  cmd=${case#*$'\t'}
  out=$(jq -nc --arg c "$cmd" '{tool_input:{command:$c}}' | ./no-branch.sh)
  if [ -z "$out" ]; then
    got=allow
  else
    got=$(jq -r '.hookSpecificOutput.permissionDecision' <<<"$out")
  fi
  if [ "$got" != "$want" ]; then
    fail=1
    printf 'FAIL want=%s got=%s : %s\n' "$want" "$got" "$cmd"
  fi
done

if [ $fail -eq 0 ]; then
  echo "no-branch.sh: ${#cases[@]} Faelle ok"
fi
exit $fail
