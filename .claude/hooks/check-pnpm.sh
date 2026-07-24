#!/bin/bash
# SessionStart: pnpm on this machine is a corepack shim inside the mise node
# dir. A mise self-update has previously wiped it, silently breaking pnpm
# everywhere (git hooks, Claude hooks, subagent shells) with no indication
# why. Surface that early instead of letting every hook fail-open silently.

command -v pnpm >/dev/null 2>&1 && exit 0

echo "pnpm not on PATH — known mise/corepack shim issue. Restore with:
export PATH=\"\$HOME/.local/share/mise/installs/node/24.18.0/bin:\$PATH\"
corepack enable --install-directory \"\$HOME/.local/share/mise/installs/node/24.18.0/bin\"
(check 'mise ls' if the active node version differs)" >&2
exit 0
