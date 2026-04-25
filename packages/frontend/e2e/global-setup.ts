import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { assertSafeTestLmsTarget } from '../../backend/src/test-utils/no-real-lms-guard.js'

const FRONTEND_PORT = 3000
const BACKEND_PORT = 3001
const PID_FILE = path.resolve(process.cwd(), 'e2e/.playwright-dev-pids.json')
const START_TIMEOUT_MS = 30_000
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

const spawnDevServer = (command: string, args: readonly string[], cwd: string): ChildProcess => {
  const child = spawn(command, args, {
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

const killStaleFrontendIfOwnedByRepo = async (): Promise<boolean> => {
  const frontendPid = getListeningPid(FRONTEND_PORT)

  if (frontendPid === null) {
    return false
  }

  const command = getProcessCommand(frontendPid)
  const isRepoViteProcess = command.includes(path.join(REPO_ROOT, 'packages', 'frontend')) &&
    command.includes('vite')

  if (!isRepoViteProcess) {
    return true
  }

  killIfRunning(frontendPid)

  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (getListeningPid(FRONTEND_PORT) === null) {
      return false
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for stale frontend process on port ${String(FRONTEND_PORT)} to stop`)
}

export default async (): Promise<void> => {
  const lmsTarget = process.env['LMS_URL'] ?? 'http://localhost:9000'
  assertSafeTestLmsTarget(lmsTarget, 'frontend-playwright-global-setup-dev')

  const frontendReady = await isOkStatus(`http://127.0.0.1:${FRONTEND_PORT}/`)
  const backendReady = await isOkStatus(`http://127.0.0.1:${BACKEND_PORT}/health`)

  if (frontendReady && backendReady) {
    return
  }

  if (frontendReady && !backendReady) {
    const shouldReuseExistingFrontend = await killStaleFrontendIfOwnedByRepo()
    if (shouldReuseExistingFrontend) {
      const backend = spawnDevServer('pnpm', ['--filter', '@signalform/backend', 'run', 'dev'], path.resolve(process.cwd(), '../..'))

      try {
        await waitForReady(`http://127.0.0.1:${BACKEND_PORT}/health`, 'backend dev server')
      } catch (error) {
        if (typeof backend.pid === 'number') {
          killIfRunning(backend.pid)
        }
        throw error
      }

      await mkdir(path.dirname(PID_FILE), { recursive: true })
      await writeFile(
        PID_FILE,
        JSON.stringify(
          {
            frontendPid: null,
            backendPid: backend.pid ?? null,
          },
          null,
          2,
        ),
        'utf8',
      )
      return
    }
  }

  const repoRoot = path.resolve(process.cwd(), '../..')
  const frontend = spawnDevServer('pnpm', ['--filter', 'frontend', 'run', 'dev'], repoRoot)
  const backend = spawnDevServer('pnpm', ['--filter', '@signalform/backend', 'run', 'dev'], repoRoot)

  try {
    await Promise.all([
      waitForReady(`http://127.0.0.1:${FRONTEND_PORT}/`, 'frontend dev server'),
      waitForReady(`http://127.0.0.1:${BACKEND_PORT}/health`, 'backend dev server'),
    ])
  } catch (error) {
    if (typeof frontend.pid === 'number') {
      killIfRunning(frontend.pid)
    }
    if (typeof backend.pid === 'number') {
      killIfRunning(backend.pid)
    }
    throw error
  }

  await mkdir(path.dirname(PID_FILE), { recursive: true })
  await writeFile(
    PID_FILE,
    JSON.stringify(
      {
        frontendPid: frontend.pid ?? null,
        backendPid: backend.pid ?? null,
      },
      null,
      2,
    ),
    'utf8',
  )
}
