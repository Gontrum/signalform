import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import eslintConfigPrettier from 'eslint-config-prettier'
import functionalPlugin from 'eslint-plugin-functional'
import pluginBoundaries from 'eslint-plugin-boundaries'

const workspaceRootConfig = (await import('../../eslint.config.js')).default.map((config) => {
  if (!config.plugins) {
    return config
  }

  const {
    ['@typescript-eslint']: _tsPlugin,
    boundaries: _boundariesPlugin,
    functional: _functionalPlugin,
    ...remainingPlugins
  } = config.plugins

  return {
    ...config,
    plugins: remainingPlugins,
  }
})

export default [
  // Inherit workspace root config
  ...workspaceRootConfig,

  // Vue 3 recommended config
  ...pluginVue.configs['flat/recommended'],

  // Vue TypeScript config
  ...vueTsEslintConfig(),

  // Frontend-specific overrides
  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
    plugins: {
      boundaries: pluginBoundaries,
      functional: functionalPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Use project references (tsconfig.app.json + tsconfig.vitest.json)
        project: ['./tsconfig.app.json', './tsconfig.vitest.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // Vue-specific overrides
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'warn',
      // Relax rules for test files
      '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }],
    },
  },

  // Functional/immutable-data: Vue refs require .value mutation for reactivity.
  // This is the idiomatic Vue pattern — exempt **.value and **.current from the rule.
  {
    files: ['**/*.ts'],
    rules: {
      'functional/immutable-data': [
        'error',
        {
          ignoreAccessorPattern: [
            '**.value', // Vue ref mutations (reactivity system requirement)
            '**.current', // Timer/ref container pattern (clearTimeout coordination)
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // FCIS Architecture Boundary Rules
  //
  // Enforces the Functional Core / Imperative Shell separation.
  // Single generic block covers all domains automatically — no manual updates
  // needed when a new domain is added.
  // ---------------------------------------------------------------------------
  {
    name: 'domain-boundaries',
    files: ['src/domains/**/*.{vue,ts,tsx}'],
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**', mode: 'file' },
        { type: 'platform-api', pattern: 'src/platform/api/**', mode: 'file' },
        { type: 'ui', pattern: 'src/ui/**', mode: 'file' },
        { type: 'domain-core', pattern: 'src/domains/*/core/**', mode: 'file' },
        { type: 'domain-shell', pattern: 'src/domains/*/shell/**', mode: 'file' },
        { type: 'domain-ui', pattern: 'src/domains/*/ui/**', mode: 'file' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          message: 'FCIS violation: {{from.type}} must not depend on {{to.type}}.',
          rules: [
            {
              // Core must not import Shell, UI, or platform APIs
              from: { type: 'domain-core' },
              disallow: {
                to: { type: ['app', 'platform-api', 'ui', 'domain-shell', 'domain-ui'] },
              },
            },
            {
              // Domain UI must not directly call platform APIs
              from: { type: 'domain-ui' },
              disallow: { to: { type: ['platform-api'] } },
            },
          ],
        },
      ],
    },
  },

  // Domain core: no Vue imports, no try/throw, no platform API
  {
    name: 'domain-core-hardening',
    files: ['src/domains/*/core/**/*.{ts,tsx}'],
    rules: {
      'functional/no-throw-statements': 'error',
      'functional/no-try-statements': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'Domain core must stay Vue-free.' },
            { name: 'vue-router', message: 'Domain core must stay router-free.' },
            { name: 'pinia', message: 'Domain core must stay store-free.' },
          ],
          patterns: [
            {
              group: ['@/platform/api', '@/platform/api/*'],
              message: 'Domain core must not depend on platform APIs.',
            },
          ],
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/',
      'dev-dist/',
      'coverage/',
      'node_modules/',
      'e2e/**',
      '*.config.ts',
      '*.config.js',
    ],
  },

  // Disable all ESLint rules that conflict with Prettier (MUST be last).
  // Fixes: vue/html-self-closing reverting Prettier's /> formatting on void elements.
  eslintConfigPrettier,
]
