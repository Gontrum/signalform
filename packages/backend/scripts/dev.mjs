import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");
const envExamplePath = path.join(cwd, ".env.example");

const createMissingEnvMessage = () => {
  const exampleHint = fs.existsSync(envExamplePath)
    ? `Copy ${path.relative(cwd, envExamplePath)} to .env and fill in LMS_HOST and LMS_PLAYER_ID before starting the backend.`
    : "Create a .env file with at least LMS_HOST and LMS_PLAYER_ID before starting the backend.";

  return [
    "Backend dev startup aborted: missing .env file.",
    exampleHint,
    "Optional keys like LASTFM_API_KEY and FANART_API_KEY can stay empty if you do not need those integrations yet.",
  ].join("\n");
};

if (!fs.existsSync(envPath)) {
  console.error(createMissingEnvMessage());
  process.exit(1);
}

const tsxBinary = path.join(
  cwd,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

const child = spawn(
  tsxBinary,
  [
    "watch",
    "--env-file=.env",
    "--ignore",
    "node_modules",
    "--ignore",
    "dist",
    "src/index.ts",
  ],
  {
    cwd,
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
