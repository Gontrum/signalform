---
name: fcis
description: >
  Load when implementing or reviewing code in Signalform to understand
  the Functional Core / Imperative Shell boundaries per package.
---

# FCIS in Signalform

## The single rule

If a function has a side effect, it is Shell. If it has none, it is Core.

## Per-package boundaries

**shared**: entirely Core. No framework imports, no side effects.

**backend**: `src/features/{feature}/core` and `src/features/{feature}/shell`

- Core = no `await`, no DB/HTTP imports
- Shell = Fastify handlers, DB calls, external HTTP
- Handlers: validate → call core → respond. Nothing else.

**frontend**: `src/domains/{domain}/core` and `src/domains/{domain}/shell`

- Core = no import from `'vue'`. Plain TS objects only.
- Shell = anything that imports from `'vue'`, uses lifecycle hooks, or fetches
- Composables → core. Two layers, clean separation.

## Result<T, E>

Core functions never throw. They return Result<T, E> from shared.
Shell unwraps results and converts them to HTTP responses or UI state.
