import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { createTestRouter, setupTestEnv } from '@/test-utils'
import { useActiveNav } from './useActiveNav'

const createRouter = async (initialPath: string): Promise<Router> => {
  return createTestRouter(
    [
      { path: '/', component: { template: '<div />' } },
      { path: '/library', component: { template: '<div />' } },
      { path: '/library/artist/1', component: { template: '<div />' } },
      { path: '/queue', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/settings/profile', component: { template: '<div />' } },
      { path: '/unknown/path', component: { template: '<div />' } },
    ],
    initialPath,
  )
}

const Harness = defineComponent({
  setup() {
    return useActiveNav()
  },
  template: `<div
    :data-search="String(isSearch)"
    :data-library="String(isLibrary)"
    :data-queue="String(isQueue)"
    :data-settings="String(isSettings)"
  />`,
})

interface Flags {
  readonly search: string | undefined
  readonly library: string | undefined
  readonly queue: string | undefined
  readonly settings: string | undefined
}

const readFlags = async (initialPath: string): Promise<Flags> => {
  const router = await createRouter(initialPath)
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  const root = wrapper.find('div')
  return {
    search: root.attributes('data-search'),
    library: root.attributes('data-library'),
    queue: root.attributes('data-queue'),
    settings: root.attributes('data-settings'),
  }
}

beforeEach(() => {
  setupTestEnv()
})

describe('useActiveNav', () => {
  it('marks search active on the root path', async () => {
    const flags = await readFlags('/')
    expect(flags).toEqual({
      search: 'true',
      library: 'false',
      queue: 'false',
      settings: 'false',
    })
  })

  it('marks library active on /library', async () => {
    const flags = await readFlags('/library')
    expect(flags).toEqual({
      search: 'false',
      library: 'true',
      queue: 'false',
      settings: 'false',
    })
  })

  it('keeps library active on nested library paths', async () => {
    const flags = await readFlags('/library/artist/1')
    expect(flags.library).toBe('true')
    expect(flags.search).toBe('false')
  })

  it('marks queue active on /queue', async () => {
    const flags = await readFlags('/queue')
    expect(flags).toEqual({
      search: 'false',
      library: 'false',
      queue: 'true',
      settings: 'false',
    })
  })

  it('marks settings active on /settings', async () => {
    const flags = await readFlags('/settings')
    expect(flags).toEqual({
      search: 'false',
      library: 'false',
      queue: 'false',
      settings: 'true',
    })
  })

  it('keeps settings active on nested settings paths', async () => {
    const flags = await readFlags('/settings/profile')
    expect(flags.settings).toBe('true')
    expect(flags.search).toBe('false')
  })

  it('falls back to search for unknown paths', async () => {
    const flags = await readFlags('/unknown/path')
    expect(flags).toEqual({
      search: 'true',
      library: 'false',
      queue: 'false',
      settings: 'false',
    })
  })
})
