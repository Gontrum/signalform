import { beforeEach, describe, expect, it, vi } from 'vitest'

type SetupModule = {
  readonly default: () => Promise<void>
}

type ChildProcessStub = {
  readonly pid: number
  readonly exitCode: number | null
  unref: ReturnType<typeof vi.fn>
}

const makeChildProcess = (pid: number): ChildProcessStub => ({
  pid,
  exitCode: null,
  unref: vi.fn(),
})

const ORIGINAL_ENV = process.env

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
  delete process.env['LMS_URL']
})

describe('frontend e2e dev global setup guard', () => {
  it('allows loopback LMS_URL and starts both servers when not already ready', async () => {
    const spawn = vi.fn(() => makeChildProcess(1234))
    const execFileSync = vi.fn(() => '')
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)

    const fetch = vi
      .fn()
      // initial readiness check frontend
      .mockResolvedValueOnce({ ok: false })
      // initial readiness check backend
      .mockResolvedValueOnce({ ok: false })
      // waitForReady frontend
      .mockResolvedValueOnce({ ok: true })
      // waitForReady backend
      .mockResolvedValueOnce({ ok: true })

    vi.mock('node:child_process', () => ({
      spawn,
      execFileSync,
    }))

    vi.mock('node:fs/promises', () => ({
      mkdir,
      writeFile,
    }))

    // eslint-disable-next-line functional/immutable-data -- test-local fetch mock wiring
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch

    process.env['LMS_URL'] = 'http://localhost:9000'

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['--filter', 'frontend', 'run', 'dev'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'pnpm',
      ['--filter', '@signalform/backend', 'run', 'dev'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(mkdir).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledTimes(1)
  })

  it('fails fast for private-network LMS_URL before any startup side effects', async () => {
    const spawn = vi.fn(() => makeChildProcess(1234))
    const execFileSync = vi.fn(() => '')
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)
    const fetch = vi.fn()

    vi.mock('node:child_process', () => ({
      spawn,
      execFileSync,
    }))

    vi.mock('node:fs/promises', () => ({
      mkdir,
      writeFile,
    }))

    // eslint-disable-next-line functional/immutable-data -- test-local fetch mock wiring
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch

    process.env['LMS_URL'] = 'http://192.168.1.20:9000'

    const module = (await import('./global-setup.ts')) as SetupModule

    await expect(module.default()).rejects.toThrow(/Unsafe LMS_URL for tests/)
    await expect(module.default()).rejects.toThrow(/context=frontend-playwright-global-setup-dev/)
    await expect(module.default()).rejects.toThrow(/lmsTarget=http:\/\/192\.168\.1\.20:9000/)

    expect(fetch).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('uses localhost fallback when LMS_URL is undefined', async () => {
    const spawn = vi.fn(() => makeChildProcess(1234))
    const execFileSync = vi.fn(() => '')
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)

    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })

    vi.mock('node:child_process', () => ({
      spawn,
      execFileSync,
    }))

    vi.mock('node:fs/promises', () => ({
      mkdir,
      writeFile,
    }))

    // eslint-disable-next-line functional/immutable-data -- test-local fetch mock wiring
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch

    const module = (await import('./global-setup.ts')) as SetupModule
    await module.default()

    expect(spawn).toHaveBeenCalledTimes(2)
  })
})
