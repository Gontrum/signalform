# Troubleshooting

Common issues specific to Signalform development. For general TypeScript or
Node.js questions, refer to the respective documentation.

---

## `Cannot find module '@signalform/shared'`

The shared package needs to be built before backend or frontend can resolve it.

```bash
cd packages/shared && pnpm build

# Or rebuild everything
pnpm -r run build

# Nuclear option: clean install
rm -rf node_modules packages/*/node_modules
pnpm install
```

---

## ESLint boundary violations

If ESLint reports an import violation (e.g. core importing from shell),
the fix is always structural: move the offending code to the correct layer.

| Error pattern                        | Meaning                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `core` imports from `shell`          | Move the import target into `core`, or move the importing code into `shell` |
| `core` imports Fastify / Vue / Pinia | Framework code belongs in `shell`, not `core`                               |
| `core` uses `await`                  | Async code belongs in `shell`                                               |
| `core` uses `throw`                  | Use `Result<T, E>` instead                                                  |

---

## `functional/no-let` — Cannot use `let`

`let` is only allowed in test setup blocks (`describe`-level `beforeEach`).
Everywhere else, use `const` and immutable operations:

```typescript
// Instead of push:
const updated = [...items, newItem];

// Instead of sort (mutates):
const sorted = [...items].sort(compareFn);
```

---

## `Property 'value' does not exist on type 'Result<T, E>'`

You need to narrow the discriminated union before accessing `.value` or `.error`:

```typescript
if (result.ok) {
  console.log(result.value); // OK
} else {
  console.log(result.error); // OK
}
```

---

## Pre-commit hook fails

Run the checks manually to see which one fails:

```bash
pnpm test
pnpm type-check
pnpm lint
```

Emergency bypass (CI still catches issues):

```bash
git commit --no-verify -m "message"
```

---

## Port already in use

```bash
lsof -i :3001          # Find the process
kill -9 <PID>           # Kill it
```

---

## WebSocket connection fails

1. Ensure the backend is running (`pnpm dev` in `packages/backend`)
2. Check the Vite proxy config in `packages/frontend/vite.config.ts`
   (`/socket.io` must proxy to `http://localhost:3001` with `ws: true`)
3. Restart both servers

---

## pnpm-lock.yaml merge conflicts

```bash
git checkout --ours pnpm-lock.yaml   # or --theirs
pnpm install                          # regenerate
git add pnpm-lock.yaml
git commit
```

---

## Getting more help

- [GitHub Issues](https://github.com/Gontrum/signalform/issues)
- [GitHub Discussions](https://github.com/Gontrum/signalform/discussions)
