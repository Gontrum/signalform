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

  it('has artist-detail route configured', () => {
    const routes = router.getRoutes()
    const artistRoute = routes.find((route) => route.path === '/artist/:artistId')
    expect(artistRoute).toBeDefined()
    expect(artistRoute?.name).toBe('artist-detail')
  })

  it('artist-detail route is lazy loaded', async () => {
    const routes = router.getRoutes()
    const artistRoute = routes.find((route) => route.path === '/artist/:artistId')
    expect(artistRoute?.components?.default).toBeDefined()

    const component = artistRoute?.components?.default
    if (isLazyRouteComponent(component)) {
      const loaded = await component()
      expect(loaded).toBeDefined()
    }
  })
})
