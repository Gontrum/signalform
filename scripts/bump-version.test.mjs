// The regex is the only part of the bump that can silently do the wrong thing:
// every other step overwrites a field it just parsed, but a tag replacement
// either finds the pattern or leaves the README on an old version and says so
// in a line nobody reads.
import assert from "node:assert/strict";
import test from "node:test";

import { replacePinnedImageTags } from "./bump-version.mjs";

test("replaces a pinned tag and reports the change", () => {
  const { updated, changed } = replacePinnedImageTags(
    "docker pull ghcr.io/gontrum/signalform:v0.16.13\n",
    "1.0.0",
  );

  assert.equal(updated, "docker pull ghcr.io/gontrum/signalform:v1.0.0\n");
  assert.equal(changed, true);
});

// The defect this replaced: matching `v${currentVersion}` instead of any pinned
// tag. A README that missed a release carries a version the package.json is not
// being bumped *from*, so the old form silently skipped it.
test("replaces a tag that is not the version being bumped from", () => {
  const { updated, changed } = replacePinnedImageTags(
    "ghcr.io/gontrum/signalform:v0.9.1",
    "1.0.0",
  );

  assert.equal(updated, "ghcr.io/gontrum/signalform:v1.0.0");
  assert.equal(changed, true);
});

test("replaces every occurrence, not just the first", () => {
  const { updated } = replacePinnedImageTags(
    [
      "image: ghcr.io/gontrum/signalform:v0.16.13",
      "docker run ghcr.io/gontrum/signalform:v0.16.13",
      "docker pull ghcr.io/gontrum/signalform:v0.15.0",
    ].join("\n"),
    "1.0.0",
  );

  assert.deepEqual(updated.match(/signalform:v[\d.]+/g), [
    "signalform:v1.0.0",
    "signalform:v1.0.0",
    "signalform:v1.0.0",
  ]);
});

// `:latest` is deliberately unpinned — the quickstart points at it so a reader
// gets the current image without editing anything. Rewriting it to a fixed
// version would defeat that.
test("leaves an unpinned tag alone", () => {
  const readme = "docker pull ghcr.io/gontrum/signalform:latest\n";

  assert.deepEqual(replacePinnedImageTags(readme, "1.0.0"), {
    updated: readme,
    changed: false,
    found: false,
  });
});

test("reports no change when the README carries no tag at all", () => {
  const readme = "# Signalform\n\nA music player.\n";

  assert.deepEqual(replacePinnedImageTags(readme, "1.0.0"), {
    updated: readme,
    changed: false,
    found: false,
  });
});

// A pre-release is a legal argument to the script (the semver check accepts
// `1.0.0-rc.1`), and the tag it writes has to be replaceable by the release it
// leads to. Matching only `X.Y.Z` would rewrite the `1.0.0` inside `1.0.0-rc.1`
// to itself, report no change, and leave the README pinned to the rc.
test("writes a pre-release version into the tag and bumps out of it again", () => {
  const { updated } = replacePinnedImageTags(
    "ghcr.io/gontrum/signalform:v0.16.13",
    "1.0.0-rc.1",
  );

  assert.equal(updated, "ghcr.io/gontrum/signalform:v1.0.0-rc.1");
  assert.deepEqual(replacePinnedImageTags(updated, "1.0.0"), {
    updated: "ghcr.io/gontrum/signalform:v1.0.0",
    changed: true,
    found: true,
  });
});

// `changed` alone cannot tell "no tag here" from "the tag is already right",
// and the caller reports those differently — denying a tag the README visibly
// carries sends the reader looking for a bug that is not there.
test("separates an already-correct tag from a missing one", () => {
  assert.deepEqual(
    replacePinnedImageTags("ghcr.io/gontrum/signalform:v1.0.0", "1.0.0"),
    {
      updated: "ghcr.io/gontrum/signalform:v1.0.0",
      changed: false,
      found: true,
    },
  );

  assert.equal(replacePinnedImageTags("# Signalform\n", "1.0.0").found, false);
});
