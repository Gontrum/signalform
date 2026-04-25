# Backend package (Fastify)

## FCIS boundary

Structure: `src/features/{feature}/core` and `src/features/{feature}/shell`

Core (`*/core/`): domain logic, transformations, query builders.
No `await`. No DB imports. No HTTP client imports.

Shell (`*/shell/`): Fastify handlers, DB calls, external HTTP.
Handlers must be thin: validate input → call core → send response.
No business logic inside handlers.

## Before implementing any Fastify API

Use context7 to check current Fastify documentation.

## Tests

Core: pure unit tests, no mocks, no DB.
Shell: integration tests with a real Fastify instance and test DB.
