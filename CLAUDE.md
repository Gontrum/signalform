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

- `@core-dev` – pure functions in core/ subdirectories of any package
- `@shell-dev` – Fastify handlers (backend) or Vue components/composables (frontend)
- `@reviewer` – architectural checks and full test suite, read-only
