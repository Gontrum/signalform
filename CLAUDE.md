# Signalform – Claude Code

Project rules are in AGENTS.md. This file adds Claude-specific tooling only.

## LSP

TypeScript (vtsls) and Vue (vue-language-server v2) are active.
Prefer LSP over grep for all navigation:

- `findReferences` before any rename
- `hover` to understand types and signatures
- `goToDefinition` to understand unfamiliar symbols

## MCP

- Use `context7` before implementing any Fastify or Vue API
- Use `github` MCP to read issues before implementing features
- Use `playwright` MCP to verify Vue UI behaviour when needed

## Agents

IMPORTANT: You MUST delegate all implementation to the appropriate agent. NEVER write
implementation code directly in the main context.

- `@core-dev` – MUST be used for all pure functions in any `core/` subdirectory
- `@shell-dev` – MUST be used for all Fastify handlers, Vue components, and composables
- `@reviewer` – MUST be run before every release commit; architectural checks and full test suite

After any agent writes code, ALWAYS run `@reviewer` before committing.

### Test coverage in agent prompts

Every `@core-dev` and `@shell-dev` delegation for a new feature or bug fix MUST include
explicit test requirements. Tests are part of the implementation, not a separate task.

Checklist for every agent prompt that adds new behaviour:

- [ ] Specify which test file(s) to update
- [ ] List the cases to cover (happy path, error paths, edge cases)
- [ ] Require the agent to run the test suite before returning
