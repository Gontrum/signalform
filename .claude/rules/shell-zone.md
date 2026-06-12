---
paths:
  - "**/shell/**"
---

This file is in the **Imperative Shell** zone. Delegate all edits to the `shell-dev` agent. Never edit directly.

Constraints in this zone:

- All I/O, network calls, and framework code lives here
- Handlers must be thin: validate → call core → respond
- No business logic — that belongs in `core/`
- Call core functions, handle `Result<T, E>`
