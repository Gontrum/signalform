#!/bin/bash
FILE_PATH=$(jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" == *"/core/"* ]]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "shell-dev darf core/ nicht editieren – delegiere an @core-dev"
    }
  }'
fi
