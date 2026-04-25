# Frontend Package

**LMS Web Client** - Vue.js 3 Single Page Application

A search-centric music player interface for Lyrion Music Server with multi-source intelligence (Local, Qobuz, Tidal). Features context-aware radio mode, split-screen tablet layout, and progressive web app capabilities for iOS/iPadOS.

## Tech Stack

**Framework:**
- **Vue 3.5+** with Composition API (`<script setup lang="ts">`)
- **TypeScript 5.9+** in strict mode
- **Vite 7.3+** for development and bundling

**State Management & Routing:**
- **Vue Router 5.0+** for client-side routing
- **Pinia 3.0+** for reactive state management

**Styling & Components:**
- **Tailwind CSS 4.1+** for utility-first styling (v4 architecture with `@tailwindcss/postcss`)
- **Headless UI for Vue** for accessible unstyled components

**Testing:**
- **Vitest 4.0+** with happy-dom environment
- **Vue Test Utils 2.4+** for component testing
- BDD/TDD approach with co-located tests

**Code Quality:**
- **ESLint 9.39+** with functional programming rules
- **Prettier 3.8+** for code formatting
- **TypeScript strict mode** enabled
- **Functional programming patterns** enforced (immutability, no classes)

## Architecture Compliance

This package follows the **Epic 1 Architecture** requirements:

### Functional Programming (Mandatory)
- ✅ No `let` - only `const` (enforced by ESLint)
- ✅ No classes - functions only (enforced by ESLint)
- ✅ Immutable data patterns (controlled mutations for Vue reactivity)
- ✅ Pure functions for business logic
- ✅ Composition API (naturally functional)

### Code Organization
- **Feature-based structure** (to be introduced in Epic 2+)
- Co-located tests: `Component.vue` + `Component.test.ts`
- Composition API with `<script setup lang="ts">`

### TypeScript
- Strict mode enabled via `@vue/tsconfig`
- `noUncheckedIndexedAccess: true` for extra safety
- Type inference over explicit types (Composition API style)

## Project Setup

This package is part of a **pnpm monorepo**. Install dependencies from the workspace root:

```bash
# From workspace root
pnpm install
```

## Development

### Start Dev Server

```bash
# From workspace root
pnpm dev

# Or from this package
cd packages/frontend
pnpm dev
```

Dev server runs on **http://localhost:3000** (configured in `vite.config.ts`)

### Build for Production

```bash
pnpm build
```

Outputs to `dist/` directory. Runs type checking (`vue-tsc`) and Vite build in parallel.

### Run Tests

```bash
# Watch mode (default)
pnpm test:unit

# Run once
pnpm test:unit --run

# With coverage
pnpm test:unit --coverage
```

**Current Test Status:** 949 tests across 49 files

### Linting

```bash
# Run all linters (oxlint + ESLint)
pnpm lint

# ESLint only
pnpm lint:eslint

# Oxlint only
pnpm lint:oxlint
```

**ESLint Rules:**
- Functional programming enforcement (`eslint-plugin-functional`)
- Vue 3 best practices
- TypeScript strict rules
- Code quality checks

### Format Code

```bash
pnpm format
```

Uses Prettier with project-wide configuration.

## IDE Setup

### Recommended: VSCode

**Extensions:**
- [Volar (Vue Language Features)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) - **Required**
- [TypeScript Vue Plugin](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

**Important:** Disable Vetur if installed (conflicts with Volar)

### Browser DevTools

**Chrome/Edge/Brave:**
- [Vue.js DevTools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
- Enable "Custom Object Formatters" in DevTools settings

**Firefox:**
- [Vue.js DevTools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)

## Key Configuration Files

- **`vite.config.ts`** - Vite configuration (dev server on port 3000, Vue plugin)
- **`vitest.config.ts`** - Vitest configuration (happy-dom environment)
- **`eslint.config.ts`** - ESLint flat config with functional rules
- **`tsconfig.json`** - TypeScript project references
- **`tsconfig.app.json`** - App-specific TypeScript config (strict mode)
- **`tailwind.config.js`** - Tailwind CSS content paths
- **`postcss.config.js`** - PostCSS with Tailwind v4 plugin (`@tailwindcss/postcss`)

## Project Structure

```
packages/frontend/
├── src/
│   ├── api/             # API client functions
│   ├── assets/          # Static assets (CSS, images)
│   ├── components/      # Vue components
│   │   └── __tests__/   # Component tests (co-located)
│   ├── composables/     # Vue composables
│   ├── layouts/         # Layout components
│   ├── router/          # Vue Router configuration
│   ├── stores/          # Pinia stores (playbackStore, queueStore, searchStore)
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── views/           # Route views
│   ├── App.vue          # Root component
│   └── main.ts          # Application entry point
├── public/              # Public static files
├── dist/                # Build output (gitignored)
└── package.json         # Package dependencies and scripts
```

## Important Notes

### Tailwind CSS v4

This project uses **Tailwind CSS v4.1+** which requires the separate `@tailwindcss/postcss` plugin. This is a breaking change from v3.x:

```js
// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {}, // ← v4 specific plugin
    autoprefixer: {},
  },
}
```

See `postcss.config.js` for detailed v4 migration notes.

### Happy-dom Test Environment

Vitest is configured with **happy-dom** instead of jsdom due to ES Module compatibility issues encountered in Story 1.2:

```ts
// vitest.config.ts
test: {
  environment: 'happy-dom', // ← Replaces jsdom
}
```

### Node.js Version

**Required:** Node.js `^20.15.0` or `>=22.12.0`

Vite recommends 20.19+ or 22.12+, but works correctly on 20.15.1 (tested and verified).

## Links

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vite.dev/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs/v4-beta)
- [Headless UI for Vue](https://headlessui.com/)
- [Vitest Documentation](https://vitest.dev/)
- [Vue Router Documentation](https://router.vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
