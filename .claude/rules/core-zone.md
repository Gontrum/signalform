---
paths:
  - "**/core/**"
---

This file is in the **Functional Core** zone. Delegate all edits to the `core-dev` agent. Never edit directly.

Constraints in this zone:

- Pure functions only — no side effects, no `await`, no I/O
- No imports from `vue`, `fastify`, or any framework
- Errors as `Result<T, E>` — never `throw`
- All data `readonly`, no mutation
