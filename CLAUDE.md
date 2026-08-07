# Signalform – Claude Code

@AGENTS.md

This file adds Claude-specific tooling on top of the rules imported above.

## LSP

TypeScript (`typescript-language-server`, via the official LSP plugin) and Vue
(`vue-language-server` v2, via this repo's own marketplace) are active. Both
binaries come from the workspace devDependencies — no global install needed.
Prefer LSP over grep for all navigation:

- `findReferences` before any rename
- `hover` to understand types and signatures
- `goToDefinition` to understand unfamiliar symbols

## MCP

- Use `github` MCP to read issues before implementing features
- Use `playwright` MCP to verify Vue UI behaviour when needed

## Agents

IMPORTANT: You MUST delegate all implementation to the appropriate agent. NEVER write
implementation code directly in the main context.

- `@core-dev` – MUST be used for all pure functions in any `core/` subdirectory
- `@shell-dev` – MUST be used for all Fastify handlers, Vue components, and composables
- `@reviewer` – MUST be run before every commit that includes agent-written code; architectural checks and full test suite

The test requirements for every delegation are in AGENTS.md, section "Testing" —
deliberately in one place only.

A delegating prompt must not override AGENTS.md. The rule that broke first was
"Comments": never instruct an agent to record a reason in a comment — an agent
obeys the prompt over the file, and no gate catches it, because each such
comment reads as a legitimate why. A reason that matters goes in the commit
message.

## Style plugins

Output-style plugins (ponytail, caveman) govern tone and solution size, never
the definition of done. Where "lazy" collides with AGENTS.md — skipping tests,
skipping the agent delegation, skipping input validation — AGENTS.md wins.
Lazy here means: the smallest diff that still brings its tests along.
