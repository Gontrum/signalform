#!/usr/bin/env node
// Runs every check:* script, writes its raw stdout+stderr to .review-artifacts/,
// and keeps going even if a check fails — this is for seeing the current
// state of the codebase, not for gating a commit (that's `pnpm precommit`).

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(rootDir, ".review-artifacts");
mkdirSync(artifactsDir, { recursive: true });

const checks = [
  "check:types",
  "check:dead",
  "check:arch",
  "check:any",
  "check:dupes",
];

const results = checks.map((name) => {
  const result = spawnSync("pnpm", ["run", name], {
    cwd: rootDir,
    encoding: "utf-8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const artifactName = name.replace(":", "-");
  writeFileSync(join(artifactsDir, `${artifactName}.txt`), output);
  return { name, status: result.status ?? 1 };
});

console.log("\nreview:collect summary");
for (const { name, status } of results) {
  console.log(
    `  ${status === 0 ? "PASS" : "FAIL"}  ${name}  (.review-artifacts/${name.replace(":", "-")}.txt)`,
  );
}

const failed = results.filter((r) => r.status !== 0);
if (failed.length > 0) {
  console.log(
    `\n${failed.length}/${results.length} checks failed — see raw output above for baseline numbers.`,
  );
}
