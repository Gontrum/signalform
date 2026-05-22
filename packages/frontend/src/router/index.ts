import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../app/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/album/tidal-search',
      name: 'tidal-search-album',
      component: (): Promise<typeof import('../domains/album/ui/AlbumDetailView.vue')> =>
        import('../domains/album/ui/AlbumDetailView.vue'),
    },
    {
      path: '/album/:albumId',
      name: 'album-detail',
      component: (): Promise<typeof import('../domains/album/ui/AlbumDetailView.vue')> =>
        import('../domains/album/ui/AlbumDetailView.vue'),
    },
    {
      path: '/setup',
      name: 'setup',
      component: (): Promise<typeof import('../domains/setup/ui/SetupWizardView.vue')> =>
        import('../domains/setup/ui/SetupWizardView.vue'),
    },
    {
      path: '/artist/unified',
      name: 'unified-artist',
      component: (): Promise<typeof import('../domains/artist/ui/UnifiedArtistView.vue')> =>
        import('../domains/artist/ui/UnifiedArtistView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: (): Promise<typeof import('../domains/queue/ui/QueueView.vue')> =>
        import('../domains/queue/ui/QueueView.vue'),
    },
    {
      path: '/library',
      name: 'library',
      component: (): Promise<typeof import('../domains/library/ui/LibraryView.vue')> =>
        import('../domains/library/ui/LibraryView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: (): Promise<typeof import('../domains/settings/ui/SettingsView.vue')> =>
        import('../domains/settings/ui/SettingsView.vue'),
    },
    {
      path: '/now-playing',
      name: 'now-playing',
      component: (): Promise<typeof import('../domains/playback/ui/NowPlayingView.vue')> =>
        import('../domains/playback/ui/NowPlayingView.vue'),
    },
  ],
})

export default router
