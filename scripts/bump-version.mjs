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

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Parse arguments
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('❌ Error: No version specified');
  console.error('');
  console.error('Usage:');
  console.error('  pnpm version:bump <version>');
  console.error('');
  console.error('Examples:');
  console.error('  pnpm version:bump 0.9.1   # Patch release');
  console.error('  pnpm version:bump 0.10.0  # Minor release');
  console.error('  pnpm version:bump 1.0.0   # Major release');
  process.exit(1);
}

// Validate version format (basic semver check)
const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
if (!semverRegex.test(newVersion)) {
  console.error(`❌ Error: Invalid version format: ${newVersion}`);
  console.error('   Expected format: X.Y.Z (e.g., 0.9.1, 1.0.0)');
  process.exit(1);
}

console.log(`📦 Bumping version to ${newVersion}...\n`);

// Files to update
const packageJsonFiles = [
  'package.json',
  'packages/backend/package.json',
  'packages/frontend/package.json',
  'packages/shared/package.json'
];

let currentVersion = null;

// Update package.json files
packageJsonFiles.forEach(file => {
  const filePath = join(rootDir, file);
  try {
    const content = readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);

    // Store current version from root package.json
    if (file === 'package.json' && currentVersion === null) {
      currentVersion = pkg.version;
    }

    pkg.version = newVersion;
    writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✓ Updated ${file}`);
  } catch (error) {
    console.error(`❌ Failed to update ${file}:`, error.message);
    process.exit(1);
  }
});

// Update README.md (Docker image tags)
try {
  const readmePath = join(rootDir, 'README.md');
  let readme = readFileSync(readmePath, 'utf8');

  // Replace old version in Docker examples (e.g., v0.9.0 -> v0.10.0)
  const oldVersionTag = `v${currentVersion}`;
  const newVersionTag = `v${newVersion}`;

  if (readme.includes(oldVersionTag)) {
    readme = readme.replace(new RegExp(oldVersionTag, 'g'), newVersionTag);
    writeFileSync(readmePath, readme);
    console.log(`✓ Updated README.md (${oldVersionTag} → ${newVersionTag})`);
  } else {
    console.log(`ℹ README.md: No version tags found to update`);
  }
} catch (error) {
  console.warn(`⚠ Warning: Could not update README.md:`, error.message);
  // Don't fail the script for README updates
}

console.log('');
console.log(`✅ All packages bumped to ${newVersion}`);
console.log('');
console.log('Next steps:');
console.log('  1. Update CHANGELOG.md with the release notes');
console.log('  2. Run: pnpm test');
console.log('  3. Run: pnpm type-check');
console.log('  4. Run: pnpm lint');
console.log(`  5. git add -A`);
console.log(`  6. git commit -m "chore: release v${newVersion}"`);
console.log('  7. git push origin main');
console.log(`  8. git tag -a v${newVersion} -m "Release v${newVersion}"`);
console.log(`  9. git push origin v${newVersion}`);
console.log(' 10. GitHub Actions will create the GitHub Release and publish assets');
