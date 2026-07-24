export default [
  // Inherit workspace root config
  ...(await import("../../eslint.config.js")).default,

  // Shared-specific overrides
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Ignore patterns
  {
    ignores: ["dist/", "node_modules/", "*.config.js"],
  },
];
