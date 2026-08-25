import { describe, it, expect } from 'vitest'
import router from './index'

const isLazyRouteComponent = (value: unknown): value is () => Promise<unknown> =>
  typeof value === 'function'

describe('Router', () => {
  it('creates router instance', () => {
    expect(router).toBeDefined()
    expect(router.getRoutes).toBeDefined()
  })

  it('has home route configured', () => {
    const routes = router.getRoutes()
    const homeRoute = routes.find((route) => route.path === '/')
    expect(homeRoute).toBeDefined()
    expect(homeRoute?.name).toBe('home')
  })

  it('uses web history mode', () => {
    expect(router.options.history.base).toBeDefined()
  })

  it('has album-detail route configured', () => {
    const routes = router.getRoutes()
    const albumRoute = routes.find((route) => route.path === '/album/:albumId')
    expect(albumRoute).toBeDefined()
    expect(albumRoute?.name).toBe('album-detail')
  })

  it('album-detail route is lazy loaded', async () => {
    const routes = router.getRoutes()
    const albumRoute = routes.find((route) => route.path === '/album/:albumId')
    expect(albumRoute?.components?.default).toBeDefined()

    const component = albumRoute?.components?.default
    if (isLazyRouteComponent(component)) {
      const loaded = await component()
      expect(loaded).toBeDefined()
    }
  })

  it('redirects the legacy tag route onto the home route as a tag filter', async () => {
    await router.push('/tags?q=qsound')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query).toEqual({ tag: 'qsound' })
  })

  it('maps a legacy tag value the vocabulary does not know onto the plain home route', async () => {
    await router.push('/tags?q=chiptune')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('redirects the legacy tag route without a query onto the plain home route', async () => {
    await router.push('/tags')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.query).toEqual({})
  })
})
