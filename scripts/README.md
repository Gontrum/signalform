# Scripts

Utility scripts for Signalform development and releases.

## Version Management

### `bump-version.mjs`

Automatically updates version across all package.json files and README.md.
Signalform uses one product version for the whole monorepo, so releases are
handled with a single manual version bump commit plus a matching Git tag.

**Usage:**

```bash
# Patch release (bug fixes)
pnpm version:bump 0.9.1

# Minor release (new features, backwards compatible)
pnpm version:bump 0.10.0

# Major release (breaking changes)
pnpm version:bump 1.0.0
```

**What it does:**

1. Updates `version` in all package.json files:
   - `package.json` (root)
   - `packages/backend/package.json`
   - `packages/frontend/package.json`
   - `packages/shared/package.json`

2. Updates version references in `README.md` (Docker tags)

3. Shows next steps for creating a release

**After running:**

```bash
# 1. Update CHANGELOG.md manually
# 2. Run quality gates
pnpm test
pnpm type-check
pnpm lint

# 3. Commit the release on main
git add -A
git commit -m "chore: release v0.9.1"

# 4. Push main, then create and push the matching tag
git push origin main
git tag -a v0.9.1 -m "Release v0.9.1"
git push origin v0.9.1

# 5. GitHub Actions creates the GitHub Release automatically
```

See `docs/RELEASING.md` for the complete release checklist and rationale.

---

## Other Scripts

### `build-release.sh`

Builds a production release tarball for distribution.
Run it with an explicit version:

```bash
bash scripts/build-release.sh --version 0.9.1
```

### `start-production-stack.mjs`

Starts the production stack for local testing.

### `verify-production-stack.mjs`

Verifies the production build works correctly.

### `measure-lms-host-viability.mjs`

Measures LMS host connection performance.
