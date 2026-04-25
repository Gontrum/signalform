export default [
  // Inherit workspace root config
  ...(await import("../../eslint.config.js")).default,

  // Glob pattern covers all features automatically — new features need no config change.
  {
    files: ["src/features/**/*.ts"],
    settings: {
      "boundaries/elements": [
        {
          type: "adapter",
          pattern: "src/adapters/*/**",
          mode: "file",
        },
        {
          type: "shared-technical",
          pattern: [
            "src/infrastructure/config/**",
            "src/infrastructure/logger.ts",
            "src/infrastructure/normalizeArtist.ts",
            "src/infrastructure/http-errors.ts",
          ],
          mode: "file",
        },
        {
          type: "shared-shell",
          pattern: [
            "src/infrastructure/frontend-delivery.ts",
            "src/infrastructure/lms-registry.ts",
            "src/infrastructure/websocket/**",
          ],
          mode: "file",
        },
        {
          type: "app-shell",
          pattern: "src/server.ts",
          mode: "file",
        },
        {
          type: "feature-core",
          pattern: "src/features/*/core/**",
          mode: "file",
        },
        {
          type: "feature-shell",
          pattern: "src/features/*/shell/**",
          mode: "file",
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          message:
            "Backend architecture violation: {{from.type}} must not depend on {{to.type}}.",
          rules: [
            {
              from: { type: "feature-core" },
              disallow: {
                to: {
                  type: [
                    "adapter",
                    "shared-shell",
                    "app-shell",
                    "feature-shell",
                  ],
                },
              },
            },
            {
              from: { type: "adapter" },
              disallow: {
                to: {
                  type: ["feature-shell"],
                },
              },
            },
          ],
        },
      ],
    },
  },

  // Backend-specific overrides
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Backend-specific: Stricter console rule (must use logger)
      "no-console": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },

  {
    files: ["src/features/*/core/**/*.ts"],
    rules: {
      "functional/no-throw-statements": "error",
      "functional/no-try-statements": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "fastify",
              message: "Backend core must remain framework-free.",
            },
          ],
          patterns: [
            {
              group: ["**/shell/**"],
              message: "Backend core must not import shell modules.",
            },
            {
              group: ["**/websocket/**"],
              message:
                "Backend core must not import websocket/runtime infrastructure.",
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      "src/infrastructure/lms-registry.ts",
      "src/test-utils/no-real-lms-guard.ts",
    ],
    rules: {
      "functional/no-throw-statements": "off",
    },
  },

  // Shell state files use a ref-object pattern ({ current: ... }) to encapsulate
  // mutable state without module-level `let`. The immutable-data rule is disabled
  // for these files only because `ref.current = nextState` is the deliberate
  // mechanism — equivalent to a functional lens over a single mutable cell.
  {
    files: [
      "src/adapters/lastfm-client/circuit-breaker-client.ts",
      "src/features/enrichment/shell/cache.ts",
      "src/features/library/shell/service.ts",
      "src/features/metadata/shell/cache.ts",
      "src/features/radio-mode/shell/radio-state.ts",
      "src/features/search/shell/cache.ts",
      "src/features/setup/shell/discovery.ts",
      "src/infrastructure/lms-registry.ts",
    ],
    rules: {
      "functional/immutable-data": "off",
    },
  },

  // Single acceptance test needs throw in mock to simulate JSON parse failure
  {
    files: ["src/adapters/lms-client/client.acceptance.test.ts"],
    rules: {
      "functional/no-throw-statements": "off",
    },
  },

  // Ignore patterns
  {
    ignores: ["dist/", "node_modules/", "*.config.ts", "*.config.js"],
  },
];
