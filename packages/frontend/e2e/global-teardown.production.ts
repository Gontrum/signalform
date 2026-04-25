import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const PID_FILE = path.resolve(process.cwd(), 'e2e/.playwright-production-pids.json')

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

export default async (): Promise<void> => {
  try {
    const pidFile = await readFile(PID_FILE, 'utf8')
    const parsed = JSON.parse(pidFile) as {
      readonly launcherPid?: number | null
    }

    if (typeof parsed.launcherPid === 'number') {
      killIfRunning(parsed.launcherPid)
    }

    await rm(PID_FILE, { force: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }
}
