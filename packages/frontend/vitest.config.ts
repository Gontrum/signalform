import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import { createViteConfig } from './vite.config'

export default mergeConfig(
  createViteConfig('test'),
  defineConfig({
    test: {
      environment: 'happy-dom',
      setupFiles: ['./src/vitest.setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.ts', 'src/**/*.vue'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'dist/**',
          'node_modules/**',
          'e2e/**',
          'src/main.ts', // Entry point - bootstrapping only, no business logic
          'src/components/icons/**', // Icon components - pure SVG, no business logic
        ],
        thresholds: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
  }),
)
