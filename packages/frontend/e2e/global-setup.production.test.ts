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

describe('frontend e2e production global setup guard', () => {
  it('allows loopback LMS_URL and launches production stack when backend is not ready', async () => {
    const spawn = vi.fn(() => makeChildProcess(4321))
    const execFileSync = vi.fn(() => '')
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)

    const fetch = vi
      .fn()
      // initial backend readiness check
      .mockResolvedValueOnce({ ok: false })
      // waitForLauncherReady backend check
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

    process.env['LMS_URL'] = 'http://127.0.0.1:9000'

    const module = (await import('./global-setup.production.ts')) as SetupModule
    await module.default()

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      'node',
      ['scripts/start-production-stack.mjs'],
      expect.objectContaining({ stdio: 'ignore', detached: true }),
    )
    expect(mkdir).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledTimes(1)
  })

  it('fails fast for non-loopback hostname before startup side effects', async () => {
    const spawn = vi.fn(() => makeChildProcess(4321))
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

    process.env['LMS_URL'] = 'http://lms.internal:9000'

    const module = (await import('./global-setup.production.ts')) as SetupModule

    await expect(module.default()).rejects.toThrow(/Unsafe LMS_URL for tests/)
    await expect(module.default()).rejects.toThrow(/context=frontend-playwright-global-setup-production/)
    await expect(module.default()).rejects.toThrow(/lmsTarget=http:\/\/lms\.internal:9000/)

    expect(fetch).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('uses localhost fallback when LMS_URL is empty string', async () => {
    const spawn = vi.fn(() => makeChildProcess(4321))
    const execFileSync = vi.fn(() => '')
    const mkdir = vi.fn(async () => undefined)
    const writeFile = vi.fn(async () => undefined)

    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
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

    process.env['LMS_URL'] = ''

    const module = (await import('./global-setup.production.ts')) as SetupModule
    await module.default()

    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
