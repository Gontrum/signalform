#!/usr/bin/env node
/**
 * Version Bump Script
 *
 * Updates version across all package.json files and README.md
 *
 * Usage:
 *   pnpm version:bump 0.10.0
 *   pnpm version:bump 1.0.0
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Matches any pinned tag, not `v${currentVersion}`: the README may have missed
// earlier releases, and then the tag it carries is not the one the package.json
// is being bumped from. The pre-release suffix is part of the match, or bumping
// v1.0.0-rc.1 to 1.0.0 rewrites the `1.0.0` inside it to itself and leaves the
// README on the rc.
const PINNED_IMAGE_TAG =
  /(ghcr\.io\/gontrum\/signalform:v)\d+\.\d+\.\d+(?:-[\w.]+)?/g;

export const replacePinnedImageTags = (readme, newVersion) => {
  const found = readme.match(PINNED_IMAGE_TAG) !== null;
  const updated = readme.replace(PINNED_IMAGE_TAG, `$1${newVersion}`);
  return { updated, changed: updated !== readme, found };
};

const main = () => {
  const newVersion = process.argv[2];

  if (!newVersion) {
    console.error("❌ Error: No version specified");
    console.error("");
    console.error("Usage:");
    console.error("  pnpm version:bump <version>");
    console.error("");
    console.error("Examples:");
    console.error("  pnpm version:bump 0.9.1   # Patch release");
    console.error("  pnpm version:bump 0.10.0  # Minor release");
    console.error("  pnpm version:bump 1.0.0   # Major release");
    process.exit(1);
  }

  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
  if (!semverRegex.test(newVersion)) {
    console.error(`❌ Error: Invalid version format: ${newVersion}`);
    console.error("   Expected format: X.Y.Z (e.g., 0.9.1, 1.0.0)");
    process.exit(1);
  }

  console.log(`📦 Bumping version to ${newVersion}...\n`);

  const packageJsonFiles = [
    "package.json",
    "packages/backend/package.json",
    "packages/frontend/package.json",
    "packages/shared/package.json",
  ];

  let currentVersion = null;

  packageJsonFiles.forEach((file) => {
    const filePath = join(rootDir, file);
    try {
      const content = readFileSync(filePath, "utf8");
      const pkg = JSON.parse(content);

      if (file === "package.json" && currentVersion === null) {
        currentVersion = pkg.version;
      }

      pkg.version = newVersion;
      writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`✓ Updated ${file} (${currentVersion} → ${newVersion})`);
    } catch (error) {
      console.error(`❌ Failed to update ${file}:`, error.message);
      process.exit(1);
    }
  });

  try {
    const readmePath = join(rootDir, "README.md");
    const { updated, changed, found } = replacePinnedImageTags(
      readFileSync(readmePath, "utf8"),
      newVersion,
    );

    if (changed) {
      writeFileSync(readmePath, updated);
      console.log(`✓ Updated README.md (→ v${newVersion})`);
    } else if (found) {
      console.log(`ℹ README.md: already pinned to v${newVersion}`);
    } else {
      console.log(`ℹ README.md: No version tags found to update`);
    }
  } catch (error) {
    console.warn(`⚠ Warning: Could not update README.md:`, error.message);
    // Warn, never exit: the four package.json files are already rewritten at
    // this point, and exiting here would leave the bump half-applied.
  }

  console.log("");
  console.log(`✅ All packages bumped to ${newVersion}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Update CHANGELOG.md with the release notes");
  console.log("  2. Run: pnpm test");
  console.log("  3. Run: pnpm type-check");
  console.log("  4. Run: pnpm lint");
  console.log(`  5. git add -A`);
  console.log(`  6. git commit -m "chore: release v${newVersion}"`);
  console.log("  7. git push origin main");
  console.log(`  8. git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`  9. git push origin v${newVersion}`);
  console.log(
    " 10. GitHub Actions will create the GitHub Release and publish assets",
  );
};

if (import.meta.main) main();
