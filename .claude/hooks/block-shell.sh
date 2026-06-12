#!/bin/bash
FILE_PATH=$(jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" == *"/shell/"* ]]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "core-dev darf shell/ nicht editieren – delegiere an @shell-dev"
    }
  }'
fi
