#!/bin/bash
# SessionStart: pnpm on this machine is a corepack shim inside the mise node
# dir. A mise self-update has previously wiped it, silently breaking pnpm
# everywhere (git hooks, Claude hooks, subagent shells) with no indication
# why. Surface that early instead of letting every hook fail-open silently.

command -v pnpm >/dev/null 2>&1 && exit 0

echo "pnpm not on PATH. node and pnpm are mise tools here (.mise.toml); a
non-interactive shell does not load 'mise activate' from ~/.zshrc. Restore with:
export PATH=\"\$HOME/.local/share/mise/shims:\$PATH\"
(or 'mise install' if the tool itself is missing)" >&2
exit 0
