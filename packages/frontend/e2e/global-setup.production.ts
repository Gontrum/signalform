import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { assertSafeTestLmsTarget } from '../../backend/src/test-utils/no-real-lms-guard.js'

const BACKEND_PORT = 3001
const PID_FILE = path.resolve(process.cwd(), 'e2e/.playwright-production-pids.json')
const START_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 250
const REPO_ROOT = path.resolve(process.cwd(), '../..')

const delay = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const isOkStatus = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

const waitForReady = async (url: string, label: string): Promise<void> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (await isOkStatus(url)) {
      return
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`)
}

const waitForLauncherReady = async (child: ChildProcess): Promise<void> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Production launcher exited before readiness with code ${String(child.exitCode)}`)
    }

    const serverReady = await isOkStatus(`http://127.0.0.1:${BACKEND_PORT}/health`)

    if (serverReady) {
      return
    }

    await delay(POLL_INTERVAL_MS)
  }

  await waitForReady(`http://127.0.0.1:${BACKEND_PORT}/health`, 'production backend health')
}

const spawnProductionStack = (cwd: string): ChildProcess => {
  const child = spawn('node', ['scripts/start-production-stack.mjs'], {
    cwd,
    stdio: 'ignore',
    detached: true,
  })

  child.unref()
  return child
}

const killIfRunning = (pid: number): void => {
  try {
    process.kill(pid, 0)
  } catch {
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    process.kill(pid, 'SIGTERM')
  }
}

const getListeningPid = (port: number): number | null => {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    }).trim()

    if (output.length === 0) {
      return null
    }

    const [firstLine] = output.split('\n')
    const pid = Number.parseInt(firstLine ?? '', 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

const getProcessCommand = (pid: number): string => {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const killStaleProductionProcessIfOwnedByRepo = async (): Promise<void> => {
  const pid = getListeningPid(BACKEND_PORT)

  if (pid === null) {
    return
  }

  const command = getProcessCommand(pid)
  const isRepoOwned = command.includes(REPO_ROOT)

  if (!isRepoOwned) {
    throw new Error(`Port ${String(BACKEND_PORT)} is already in use by a non-repo process: ${command}`)
  }

  killIfRunning(pid)

  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (getListeningPid(BACKEND_PORT) === null) {
      break
    }

    await delay(POLL_INTERVAL_MS)
  }

  if (getListeningPid(BACKEND_PORT) !== null) {
    throw new Error(`Timed out waiting for stale process on port ${String(BACKEND_PORT)} to stop`)
  }
}

export default async (): Promise<void> => {
  const lmsTarget = process.env['LMS_URL'] ?? 'http://localhost:9000'
  assertSafeTestLmsTarget(lmsTarget, 'frontend-playwright-global-setup-production')

  const serverReady = await isOkStatus(`http://127.0.0.1:${BACKEND_PORT}/health`)

  if (serverReady) {
    return
  }

  await killStaleProductionProcessIfOwnedByRepo()

  const repoRoot = path.resolve(process.cwd(), '../..')
  const launcher = spawnProductionStack(repoRoot)

  try {
    await waitForLauncherReady(launcher)
  } catch (error) {
    if (typeof launcher.pid === 'number') {
      killIfRunning(launcher.pid)
    }
    throw error
  }

  await mkdir(path.dirname(PID_FILE), { recursive: true })
  await writeFile(
    PID_FILE,
    JSON.stringify(
      {
        launcherPid: launcher.pid ?? null,
      },
      null,
      2,
    ),
    'utf8',
  )
}
