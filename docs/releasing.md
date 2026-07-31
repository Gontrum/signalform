# Releasing Signalform

Signalform ships as one product version across the whole monorepo.
We do not use automated release-note or version orchestration tools.
Instead, we create a single manual version bump commit on `main` and
publish from a Git tag that points to that exact commit.

## Release flow

1. Ensure your local `main` is up to date and clean enough for a release.
2. Bump the version everywhere:

```bash
pnpm version:bump 0.10.0
```

3. Review and update `CHANGELOG.md`.
4. Run the required quality gates:

```bash
pnpm test
pnpm type-check
pnpm lint
```

5. Commit the release changes on `main`:

```bash
git add package.json packages/backend/package.json packages/frontend/package.json packages/shared/package.json README.md CHANGELOG.md
git commit -m "chore: release v0.10.0"
```

6. Push the release commit to `main`:

```bash
git push origin main
```

7. Create an annotated tag for the same commit and push it:

```bash
git tag -a v0.10.0 -m "Release v0.10.0"
git push origin v0.10.0
```

## What the tag does

Pushing `vX.Y.Z` triggers the release workflow in
`.github/workflows/release.yml`. That workflow:

- reruns quality checks in CI
- builds platform-specific tarballs
- creates the GitHub Release automatically
- publishes the Docker image tags

You do not need to create the GitHub Release manually.

## Building a release tarball locally

If you want to smoke-test the packaged artifact before tagging:

```bash
bash scripts/build-release.sh --version 0.10.0
```

The `--version` argument is required because the tarball name and embedded
release metadata use that exact version.
