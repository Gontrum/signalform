#!/bin/bash
# Regressionstest für no-comment-orders.sh.
# Aufruf: bash .claude/hooks/no-comment-orders.test.sh
#
# Die "quiet"-Fälle sind die wichtigeren: über Kommentare zu reden oder sie
# entfernen zu lassen darf nie warnen. Die auslösenden Prompts sind wörtlich
# aus einer echten Sitzung übernommen, in der so bestellte Kommentare im Code
# gelandet sind.

cd "$(dirname "$0")" || exit 1

# want<TAB>tool<TAB>prompt
cases=(
  # deutsch
  "warn	Agent	Eine Kommentarzeile soll festhalten, warum die Parameternamen aus der LMS-CLI-Konvention stammen."
  "warn	Agent	Implementiere den Mapper und halte das als Kommentarzeile fest."
  "warn	Agent	Erklaer die LMS-Konvention mit einer Kommentarzeile ueber dem Aufruf."
  "warn	Agent	Setz den Fallback um, plus einen Kommentar dazu, warum die Route 204 liefert."
  "warn	Agent	Die Kommentarzeile soll begruenden, warum der Cache invalidiert wird."
  # englisch
  "warn	Agent	Add a comment explaining why the retry limit is three."
  "warn	Agent	Document the LMS quirk in a comment above the call."
  "warn	Agent	A one-line comment is enough here."
  "warn	Agent	Annotate the fallback with a short comment."
  # gemischt
  "warn	Agent	Implementiere die Route in shell/route.ts and add a short comment for the fallback."
  "warn	Agent	Erklaer die Konvention mit einer Kommentarzeile, one-line comment reicht."
  # Falsch-positiv-Faelle: Rede ueber vorhandene Kommentare
  "quiet	Agent	Entferne die Kommentare in packages/backend/src/features/queue/core/queue-mapper.ts."
  "quiet	Agent	Pruefe, ob der Kommentar noch stimmt."
  "quiet	Agent	Der Kommentar ist veraltet, streich ihn."
  "quiet	Agent	Der Kommentar dazu ist veraltet."
  "quiet	Agent	Kommentiere den auskommentierten Code aus."
  "quiet	Agent	Verboten sind: Banner, Changelog-Notizen, commented-out code, JSDoc, das die Signatur wiederholt."
  "quiet	Agent	Remove all comments that only restate the code."
  "quiet	Agent	Leave the comments untouched and only rename the function."
  "quiet	Agent	Halte dich an die Regel: keine Kommentare."
  "quiet	Agent	Schreib die Tests neu und entferne die Kommentare in der Datei."
  "quiet	Agent	Korrigiere Tippfehler in Kommentaren."
  # anderes Werkzeug: derselbe Prompt darf nichts ausloesen
  "quiet	Bash	Add a comment explaining why the retry limit is three."
  "quiet	Edit	Eine Kommentarzeile soll festhalten, warum das so ist."
  # leerer Prompt
  "quiet	Agent	"
)

fail=0
for case in "${cases[@]}"; do
  IFS=$'\t' read -r want tool prompt <<<"$case"
  out=$(jq -nc --arg t "$tool" --arg p "$prompt" '{tool_name:$t,tool_input:{prompt:$p}}' | ./no-comment-orders.sh)
  if [ -z "$out" ]; then
    got=quiet
  else
    got=warn
  fi
  if [ "$got" != "$want" ]; then
    fail=1
    printf 'FAIL want=%s got=%s : %s\n' "$want" "$got" "$prompt"
    continue
  fi
  if [ "$got" = warn ]; then
    # Kern der Anforderung: warnen, nicht blockieren.
    decision=$(jq -r '.hookSpecificOutput.permissionDecision // "none"' <<<"$out")
    context=$(jq -r '.hookSpecificOutput.additionalContext // empty' <<<"$out")
    if [ "$decision" != none ]; then
      fail=1
      printf 'FAIL blockiert statt zu warnen (permissionDecision=%s) : %s\n' "$decision" "$prompt"
    fi
    if [[ "$context" != *"AGENTS.md, section Comments"* || "$context" != *"commit message"* ]]; then
      fail=1
      printf 'FAIL Warnung nennt Regel oder Ersatz nicht : %s\n' "$prompt"
    fi
  fi
done

# Sonderfaelle, die sich nicht als Prompt-String ausdruecken lassen.
for payload in '{"tool_name":"Agent","tool_input":{}}' '{"tool_name":"Agent"}' '{}'; do
  out=$(./no-comment-orders.sh <<<"$payload")
  status=$?
  if [ $status -ne 0 ] || [ -n "$out" ]; then
    fail=1
    printf 'FAIL exit=%s out=%s : %s\n' "$status" "$out" "$payload"
  fi
done

if [ $fail -eq 0 ]; then
  echo "no-comment-orders.sh: $((${#cases[@]} + 3)) Faelle ok"
fi
exit $fail
