#!/bin/bash
# Zonen-Enforcement für FCIS-Agent-Routing (siehe AGENTS.md "Agent Routing").
# Ersetzt die früheren permissions.deny-Regeln: deny gilt in Claude Code immer
# global (auch für Subagents) und hätte core-dev/shell-dev selbst blockiert.
# Dieser Hook prüft stattdessen agent_type aus dem Hook-Input:
#   */core/*  → nur core-dev darf schreiben
#   */shell/* → nur shell-dev darf schreiben
#   Hauptkontext (kein agent_type) → immer deny in beiden Zonen

INPUT=$(cat)
FILE_PATH=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")
AGENT_TYPE=$(jq -r '.agent_type // empty' <<<"$INPUT")

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

case "$FILE_PATH" in
  */core/*)
    if [[ "$AGENT_TYPE" != "core-dev" ]]; then
      deny "Functional-Core-Zone: nur @core-dev darf core/ editieren (aktuell: ${AGENT_TYPE:-Hauptkontext}) – delegiere an @core-dev"
    fi
    ;;
  */shell/*)
    if [[ "$AGENT_TYPE" != "shell-dev" ]]; then
      deny "Imperative-Shell-Zone: nur @shell-dev darf shell/ editieren (aktuell: ${AGENT_TYPE:-Hauptkontext}) – delegiere an @shell-dev"
    fi
    ;;
esac

exit 0
