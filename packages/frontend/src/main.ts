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

  app.mount('#app')
}

void bootstrap()
