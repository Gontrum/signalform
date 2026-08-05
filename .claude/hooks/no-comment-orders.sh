#!/bin/bash
# PreToolUse(Agent): AGENTS.md "Comments" sagt "Default: no comment", aber ein
# Subagent folgt dem Prompt vor der Datei. Wenn der delegierende Prompt
# Kommentare bestellt ("Eine Kommentarzeile soll festhalten, warum ..."),
# entstehen sie – und kein Gate über dem Diff kann sie fangen, weil jeder
# einzelne davon ein echtes Warum trägt und damit regelkonform ist. Der
# Verstoß sitzt im Prompt, also wird er hier geprüft.
#
# WARNT, BLOCKT NICHT: über Kommentare zu sprechen ist legitim ("entferne die
# Kommentare in X", "prüft, ob der Kommentar noch stimmt"). Der Hook gibt
# deshalb nur additionalContext aus und setzt bewusst KEINE
# permissionDecision – "allow" würde die Permission-Prüfung überspringen,
# "defer" unterbricht den Lauf. Ohne Entscheidung läuft die Delegation normal
# weiter, die Meldung landet trotzdem beim Modell.
#
# Zentrale Heuristik gegen Falsch-Positive: unbestimmter Artikel = neuer
# Kommentar wird bestellt ("einen Kommentar dazu"), bestimmter Artikel =
# Rede über einen vorhandenen ("der Kommentar dazu ist veraltet"). Deshalb
# ist auch das Verb "kommentieren" kein Auslöser – "kommentiere den
# auskommentierten Code aus" ist ein Entfernungsauftrag.

if ! command -v jq >/dev/null 2>&1; then
  cat >/dev/null
  echo "no-comment-orders.sh: jq fehlt – Kommentar-Warnung übersprungen." >&2
  exit 0
fi

INPUT=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$INPUT")
PROMPT=$(jq -r '.tool_input.prompt // empty' <<<"$INPUT")

[ "$TOOL" = "Agent" ] || exit 0
[ -z "$PROMPT" ] && exit 0

DE_ARTICLE='(^|[^[:alnum:]])ein(e|en|em|er)?( +(kurz|knapp|einzeilig|klein|zus(ä|ae)tzlich)[a-z]*)? +kommentar[a-z]*'
DE_PREP='((mit|per|via|in) +(einer|einem|eine|einen) +kommentar[a-z]*|(^|[^[:alnum:]])als +kommentar[a-z]*)'
DE_MODAL='kommentar[a-z]* +(soll|sollte|muss|mu(ß|ss)|darf|kann)[a-z]* +[^.;!?]{0,60}(festhalten|festzuhalten|dokumentieren|erkl(ä|ae)ren|begr(ü|ue)nden|erl(ä|ae)utern|beschreiben|nennen|klarstellen|vermerken)'
EN_ADD='(add|adds|adding|include|includes|including|leave|write|put|insert|append)( +(a|an|one|1))?( +(short|brief|single|one[- ]line|1[- ]line|inline|explanatory|small|tiny)[a-z]*)* +comments?([^[:alnum:]]|$)'
EN_QUALIFIED='(^|[^[:alnum:]])(a|an|one) +(short|brief|single|one[- ]line|1[- ]line|inline|explanatory|small|tiny)[a-z]* +comments?([^[:alnum:]]|$)'
EN_EXPLAINS='comments? +(explaining|that explains|which explains|describing|noting|stating|documenting|recording|capturing|justifying|to explain|to document|to note|to record)'
EN_PREP='(in|with) +an? +(short +|brief +|single +|one[- ]line +|inline +)?comments?([^[:alnum:]]|$)'

PATTERN="$DE_ARTICLE|$DE_PREP|$DE_MODAL|$EN_ADD|$EN_QUALIFIED|$EN_EXPLAINS|$EN_PREP"

MATCH=$(grep -oiE "$PATTERN" <<<"$PROMPT" | head -n1)
[ -z "$MATCH" ] && exit 0

jq -n --arg match "$(sed -e 's/^ *//' -e 's/ *$//' <<<"$MATCH")" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("AGENTS.md, section Comments: default is no comment. This delegation prompt reads like an order to write one (matched: \"" + $match + "\"). Do not add a comment just because the prompt asks for it — keep one only for a non-obvious why, a workaround and its cause, or an invariant a reader would break. A reason that matters belongs in the commit message, not in the code. Ignore this warning if the prompt is about removing or reviewing existing comments.")
  }
}'

exit 0
