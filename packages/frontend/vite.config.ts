import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

export const createViteConfig = (mode: string): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '')
  const enablePwaInDev = env.VITE_ENABLE_PWA_DEV === 'true'

  return {
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          // Only enable the dev service worker when explicitly requested.
          // Otherwise vite-plugin-pwa generates transient files in dev-dist/,
          // which should never become part of normal source control flow.
          enabled: enablePwaInDev,
        },
        manifest: false, // we manage manifest.json manually in public/
        workbox: {
          // Cache static assets only — never cache API or socket.io
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [
            /^\/api\//, // backend API
            /^\/socket\.io\//, // WebSocket
            /^\/jsonrpc/, // LMS JSON-RPC (if proxied)
          ],
          runtimeCaching: [], // no runtime caching — stale music data is worse than no cache
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => createViteConfig(mode))
