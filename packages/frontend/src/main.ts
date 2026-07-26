import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { recoverLocalDevServiceWorkers } from '@/app/devServiceWorkerRecovery'

const bootstrap = async (): Promise<void> => {
  await recoverLocalDevServiceWorkers({
    hostname: window.location.hostname,
    port: window.location.port,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    caches: 'caches' in window ? window.caches : undefined,
  })

  const app = createApp(App)

  app.use(createPinia())
  app.use(router)

  // Vue Router's navigations (including the initial one) are always async.
  // Without this, the app renders once with the router's pre-navigation
  // START_LOCATION (path "/") before the real route resolves — causing a
  // transient, transition-animated flash of wrong nav-link styling on any
  // route other than "/" (e.g. loading /queue briefly shows "Search" as
  // active and "Queue" as inactive, then swaps). Awaiting isReady() ensures
  // the first paint already reflects the resolved route.
  // https://router.vuejs.org/guide/advanced/transitions.html#initial-navigation-and-transitions
  await router.isReady()

  app.mount('#app')
}

void bootstrap()
