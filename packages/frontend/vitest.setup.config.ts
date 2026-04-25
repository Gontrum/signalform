import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['e2e/global-setup.test.ts', 'e2e/global-setup.production.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    globals: true,
  },
})
