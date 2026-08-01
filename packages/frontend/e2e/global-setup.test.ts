import { beforeEach, describe, expect, it, vi } from 'vitest'

type SetupModule = {
  readonly default: () => Promise<void>
}

type ChildProcessStub = {
  readonly pid: number
  readonly exitCode: number | null
  unref: ReturnType<typeof vi.fn>
}

// vi.mock is hoisted above every declaration in this file, so the doubles it
// hands out have to be hoisted with it — a per-test `const` is still in its TDZ
// when the factory runs.
const mocks = vi.hoisted(() => ({
  spawn: vi.fn<(command: string, args: readonly string[], options: object) => unknown>(),
  execFileSync: vi.fn<(command: string, args: readonly string[], options: object) => string>(),
  mkdir: vi.fn<(target: string, options: object) => Promise<void>>(),
  writeFile: vi.fn<(target: string, data: string, encoding: string) => Promise<void>>(),
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
  execFileSync: mocks.execFileSync,
}))

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}))

const makeChildProcess = (pid: number): ChildProcessStub => ({
  pid,
  exitCode: null,
  unref: vi.fn(),
})

const setFetchResponses = (
  responses: readonly (number | Error)[],
): ReturnType<typeof vi.fn<(url: string) => Promise<{ readonly status: number }>>> => {
  const fetch = vi.fn<(url: string) => Promise<{ readonly status: number }>>()

  for (const response of responses) {
    if (response instanceof Error) {
      fetch.mockRejectedValueOnce(response)
      continue
    }
    fetch.mockResolvedValueOnce({ status: response })
  }

  // eslint-disable-next-line functional/immutable-data -- test-local fetch mock wiring
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch
  return fetch
}

const connectionRefused = (port: number): Error =>
  new Error(`connect ECONNREFUSED 127.0.0.1:${String(port)}`)

const ORIGINAL_ENV = process.env

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  mocks.spawn.mockReset()
  mocks.execFileSync.mockReset()
  mocks.mkdir.mockReset()
  mocks.writeFile.mockReset()
  mocks.spawn.mockImplementation(() => makeChildProcess(1234))
  mocks.execFileSync.mockReturnValue('')
  mocks.mkdir.mockResolvedValue(undefined)
  mocks.writeFile.mockResolvedValue(undefined)
  process.env = { ...ORIGINAL_ENV }
  delete process.env['LMS_URL']
})

describe('frontend e2e dev global setup guard', () => {
  it('allows loopback LMS_URL and starts both servers when not already ready', async () => {
    setFetchResponses([
      // initial readiness checks — nothing listening on either port
      connectionRefused(3000),
      connectionRefused(3001),
      // waitForReady frontend, then backend
      200,
      503,
    ])

    process.env['LMS_URL'] = 'http://localhost:9000'

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['--filter', 'frontend', 'run', 'dev'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['--filter', '@signalform/backend', 'run', 'dev'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(mocks.mkdir).toHaveBeenCalledTimes(1)
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
  })

  it('fails fast for private-network LMS_URL before any startup side effects', async () => {
    const fetch = setFetchResponses([])

    process.env['LMS_URL'] = 'http://192.168.1.20:9000'

    const module = (await import('./global-setup.ts')) as SetupModule

    await expect(module.default()).rejects.toThrow(/\[no-real-lms-guard\] Unsafe LMS target/)
    await expect(module.default()).rejects.toThrow(/in frontend-playwright-global-setup-dev\./)
    await expect(module.default()).rejects.toThrow(/"http:\/\/192\.168\.1\.20:9000"/)

    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.mkdir).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('uses localhost fallback when LMS_URL is undefined', async () => {
    setFetchResponses([connectionRefused(3000), connectionRefused(3001), 200, 503])

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(mocks.spawn).toHaveBeenCalledTimes(2)
  })

  it('reuses a backend whose /health answers 503 because no LMS is running', async () => {
    const fetch = setFetchResponses([200, 503])

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('starts only the backend when a foreign frontend answers and the backend port is dead', async () => {
    mocks.execFileSync.mockImplementation((command) =>
      command === 'lsof' ? '777' : '/usr/bin/some-other-server',
    )
    setFetchResponses([200, connectionRefused(3001), 503])

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['--filter', '@signalform/backend', 'run', 'dev'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
    expect(mocks.writeFile.mock.calls[0]?.[1]).toContain('"frontendPid": null')
  })
})
