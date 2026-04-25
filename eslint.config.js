import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import boundariesPlugin from "eslint-plugin-boundaries";
import functionalPlugin from "eslint-plugin-functional";

export default [
  // Global ignores
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "*.config.js",
      "*.config.ts",
      "*.config.cjs",
      "*.config.mjs",
      ".husky/",
      "_bmad/",
      "_bmad-output/",
    ],
  },

  // TypeScript files configuration
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      boundaries: boundariesPlugin,
      functional: functionalPlugin,
    },
    rules: {
      // Architecture Requirement: Functional Core, Imperative Shell
      // IMMUTABILITY - Only const, no let
      "prefer-const": "error",
      "no-param-reassign": "error",
      "no-var": "error",

      // Functional Programming Rules (eslint-plugin-functional)
      "functional/immutable-data": "error",
      "functional/no-let": "error",
      "functional/prefer-readonly-type": "error",
      "functional/no-classes": "error", // Note: plural "classes" not "class"
      "functional/no-this-expressions": "error", // Note: plural "expressions"
      "functional/no-throw-statements": "error",
      "functional/no-loop-statements": "error", // use .map/.filter/.reduce instead of for/while

      // TypeScript Specific
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",

      // Code Quality
      "no-console": "error",
      "no-debugger": "error",
      "no-alert": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "brace-style": ["error", "1tbs"],
    },
  },

  {
    files: ["**/*.test.ts", "**/*.acceptance.test.ts", "**/*.integration.test.ts", "**/*.spec.ts"],
    rules: {
      // Disable functional/no-let in tests to allow standard beforeEach/afterEach patterns.
      // Rationale: Vitest idiomatically uses `let server` + `beforeEach`/`afterEach` for
      // shared setup state. Calling afterEach inside each test body is an anti-pattern.
      // We rely on code review to ensure `let` is only used in describe-level setup/teardown,
      // not inside test bodies. See docs/contributors/TESTING.md for examples.
      "functional/no-let": "off",

      // Still enforce prefer-const to catch unnecessary let usage inside test bodies.
      "prefer-const": "error",

      // Keep other safety rules.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
    },
  },

  // Override for Playwright E2E files: disable functional/* rules.
  // Playwright tests are inherently imperative (page.goto, expect, await, etc.)
  // and cannot follow functional programming constraints.
  {
    files: ["packages/frontend/e2e/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./packages/frontend/tsconfig.e2e.json",
      },
    },
    rules: {
      "functional/no-expression-statements": "off",
      "functional/no-return-void": "off",
      "functional/immutable-data": "off",
      "functional/no-let": "off",
      "functional/prefer-readonly-type": "off",
      "functional/no-loop-statements": "off",
      "no-console": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
];
