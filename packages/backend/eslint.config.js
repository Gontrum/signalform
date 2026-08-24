export default [
  // Inherit workspace root config
  ...(await import("../../eslint.config.js")).default,

  // Glob pattern covers all features automatically — new features need no config change.
  {
    files: ["src/**/*.ts"],
    settings: {
      // Without a TypeScript-aware resolver the plugin falls back to node
      // resolution, which cannot follow the `.js` specifier that ESM requires
      // for a `.ts` source. Every dependency then reads as "unknown" and no
      // policy matches, so the rules below pass on everything — silently.
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: import.meta.dirname },
      },
      "boundaries/elements": [
        { type: "adapter", pattern: "src/adapters/*" },
        { type: "feature-core", pattern: "src/features/*/core" },
        { type: "feature-shell", pattern: "src/features/*/shell" },
      ],
      // Elements are folders in v7, so the runtime pieces of `infrastructure`
      // that are single files cannot be element types — they are file
      // categories instead, and the policies below select them as such.
      // `infrastructure/config` and the pure helpers beside it stay
      // unclassified on purpose: no policy ever named them, because core is
      // allowed to import them.
      "boundaries/files": [
        { pattern: "src/server.ts", category: "app-shell" },
        {
          pattern: [
            "src/infrastructure/frontend-delivery.ts",
            "src/infrastructure/lms-registry.ts",
            "src/infrastructure/transport-commands.ts",
            "src/infrastructure/websocket/**",
          ],
          category: "shared-shell",
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
          policies: [
            {
              from: { element: { type: "feature-core" } },
              disallow: { to: { element: { type: "feature-shell" } } },
            },
            {
              from: { element: { type: "feature-core" } },
              disallow: {
                to: { file: { categories: ["shared-shell", "app-shell"] } },
              },
              message:
                "Backend architecture violation: feature-core must not depend on shell runtime ({{dependency.source}}).",
            },
            {
              // docs/architecture.md grants core the adapter *types* and nothing
              // else from that layer, so the ban is on the value import alone —
              // `import type { SearchResult }` carries no runtime coupling.
              from: { element: { type: "feature-core" } },
              disallow: {
                to: { element: { type: "adapter" } },
                dependency: { kind: "value" },
              },
            },
            {
              from: { element: { type: "adapter" } },
              disallow: {
                to: { element: { type: ["feature-shell"] } },
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
        projectService: true,
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
      // Core must not perform I/O — fetch needs no import, so ban the global.
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Backend core must not perform I/O (FCIS)." },
      ],
      // Core must be synchronous — async signatures mean I/O has leaked in.
      "no-restricted-syntax": [
        "error",
        {
          selector: "AwaitExpression",
          message: "Backend core must be synchronous — no await (FCIS).",
        },
        {
          selector: ":function[async=true]",
          message:
            "Backend core must not declare async functions — move I/O to shell (FCIS).",
        },
      ],
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
      "src/features/album-tags/shell/local-albums.ts",
      "src/features/album-tags/shell/tag-lookup.ts",
      "src/features/enrichment/shell/cache.ts",
      "src/features/library/shell/service.ts",
      "src/features/metadata/shell/cache.ts",
      "src/features/radio-mode/shell/radio-state.ts",
      "src/features/scrobbling/shell/scrobbler.ts",
      "src/features/search/shell/cache.ts",
      "src/features/setup/shell/discovery.ts",
      "src/features/users/shell/active-listener.ts",
      "src/infrastructure/lms-registry.ts",
      "src/infrastructure/transport-commands.ts",
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
