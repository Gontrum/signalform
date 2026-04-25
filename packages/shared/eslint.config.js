export default [
  // Inherit workspace root config
  ...(await import("../../eslint.config.js")).default,

  // Shared-specific overrides
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Ignore patterns
  {
    ignores: ["dist/", "node_modules/", "*.config.js"],
  },
];
