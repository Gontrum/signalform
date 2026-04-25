# Contributing to Signalform

Thanks for your interest in contributing!

## Quick start

```bash
# 1. Fork & clone
git clone https://github.com/YOUR-USERNAME/signalform.git
cd signalform
git remote add upstream https://github.com/Gontrum/signalform.git

# 2. Install (requires Node.js >= 22, pnpm via Corepack)
corepack enable
pnpm install

# 3. Start dev servers
pnpm dev
```

- **Frontend**: http://localhost:5173 (proxies API to backend)
- **Backend**: http://localhost:3001

You need a running [Lyrion Music Server](https://lyrion.org/) instance.
The setup wizard at first launch configures the connection.

## Useful commands

```bash
pnpm dev              # Start all packages in dev mode
pnpm test             # Run all tests
pnpm test:coverage    # Tests + coverage (>= 70% enforced)
pnpm type-check       # TypeScript strict check
pnpm lint             # ESLint (functional rules + boundary enforcement)
pnpm precommit        # Run all checks manually
```

## Git workflow

1. Sync with upstream: `git fetch upstream && git merge upstream/main`
2. Create a branch: `git checkout -b feature/my-change`
3. Commit with conventional format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
4. Push to your fork and open a Pull Request

Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`, `test/`

## Pre-commit hooks

Husky + lint-staged run automatically before each commit:
Prettier formatting, TypeScript type-check, and coverage tests.
Emergency bypass: `git commit --no-verify -m "message"` (CI still catches issues).

## Architecture at a glance

Monorepo with three packages (`shared`, `backend`, `frontend`).
Every feature follows **Functional Core / Imperative Shell** (FCIS):

- **`core/`** -- pure functions, no I/O, no framework imports, errors as `Result<T, E>`
- **`shell/`** -- Fastify routes, Vue composables/stores, API calls

ESLint enforces these boundaries. See [docs/architecture.md](docs/architecture.md)
for the full reference.

## PR checklist

- [ ] `pnpm test` passes
- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] Core functions are pure (no `await`, no framework imports, no `throw`)
- [ ] New features have tests

## Building a release

Release management is maintainer-only. See
[docs/RELEASING.md](docs/RELEASING.md) for the canonical release process.

## Further reading

- [docs/architecture.md](docs/architecture.md) -- Architecture, FCIS principles, dependency rules
- [docs/contributing/TESTING.md](docs/contributing/TESTING.md) -- Testing guide and conventions
- [docs/contributing/TEST-TEMPLATES.md](docs/contributing/TEST-TEMPLATES.md) -- Copy-paste test templates
- [docs/contributing/FEATURE-EXAMPLE.md](docs/contributing/FEATURE-EXAMPLE.md) -- Full-stack feature walkthrough
- [docs/contributing/DEVELOPMENT-WORKFLOW.md](docs/contributing/DEVELOPMENT-WORKFLOW.md) -- Dev commands, debugging, configuration

## Getting help

- [GitHub Issues](https://github.com/Gontrum/signalform/issues) -- Bug reports and feature requests
- [GitHub Discussions](https://github.com/Gontrum/signalform/discussions) -- Questions and ideas
