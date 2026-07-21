import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../app/HomeView.vue'

// Module augmentation: routes carry a `depth` used to derive push/pop page
// transitions (see App.vue's afterEach hook). Top-level tabs (home, library,
// queue, settings, setup) are depth 1; drill-down/detail screens are depth 2.
declare module 'vue-router' {
  interface RouteMeta {
    readonly depth?: number
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { depth: 1 },
    },
    {
      path: '/album/tidal-search',
      name: 'tidal-search-album',
      component: (): Promise<typeof import('../domains/album/ui/AlbumDetailView.vue')> =>
        import('../domains/album/ui/AlbumDetailView.vue'),
      meta: { depth: 2 },
    },
    {
      path: '/album/:albumId',
      name: 'album-detail',
      component: (): Promise<typeof import('../domains/album/ui/AlbumDetailView.vue')> =>
        import('../domains/album/ui/AlbumDetailView.vue'),
      meta: { depth: 2 },
    },
    {
      path: '/setup',
      name: 'setup',
      component: (): Promise<typeof import('../domains/setup/ui/SetupWizardView.vue')> =>
        import('../domains/setup/ui/SetupWizardView.vue'),
      meta: { depth: 1 },
    },
    {
      path: '/artist/unified',
      name: 'unified-artist',
      component: (): Promise<typeof import('../domains/artist/ui/UnifiedArtistView.vue')> =>
        import('../domains/artist/ui/UnifiedArtistView.vue'),
      meta: { depth: 2 },
    },
    {
      path: '/queue',
      name: 'queue',
      component: (): Promise<typeof import('../domains/queue/ui/QueueView.vue')> =>
        import('../domains/queue/ui/QueueView.vue'),
      meta: { depth: 1 },
    },
    {
      path: '/library',
      name: 'library',
      component: (): Promise<typeof import('../domains/library/ui/LibraryView.vue')> =>
        import('../domains/library/ui/LibraryView.vue'),
      meta: { depth: 1 },
    },
    {
      path: '/settings',
      name: 'settings',
      component: (): Promise<typeof import('../domains/settings/ui/SettingsView.vue')> =>
        import('../domains/settings/ui/SettingsView.vue'),
      meta: { depth: 1 },
    },
    {
      path: '/now-playing',
      name: 'now-playing',
      component: (): Promise<typeof import('../domains/playback/ui/NowPlayingView.vue')> =>
        import('../domains/playback/ui/NowPlayingView.vue'),
      meta: { depth: 2 },
    },
  ],
})

export default router
