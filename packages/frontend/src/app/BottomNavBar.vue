<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import { useActiveNav } from '@/app/useActiveNav'

const { isSearch, isLibrary, isQueue, isSettings } = useActiveNav()

const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

const linkClasses = (isActive: boolean): readonly string[] => [
  'flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
  isActive ? 'text-neutral-950' : 'text-neutral-500',
]

const labelClasses = (isActive: boolean): readonly string[] => [
  'max-w-full truncate text-[10px] leading-tight',
  isActive ? 'font-semibold' : 'font-medium',
]
</script>

<template>
  <nav
    :aria-label="t('nav.primary')"
    data-testid="bottom-nav"
    class="flex w-full shrink-0 overflow-hidden border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
  >
    <RouterLink
      to="/"
      data-testid="bottom-nav-search"
      :aria-current="isSearch ? 'page' : undefined"
      :aria-label="t('nav.search')"
      :class="linkClasses(isSearch)"
    >
      <svg
        class="h-6 w-6 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span :class="labelClasses(isSearch)">{{ t('nav.search') }}</span>
    </RouterLink>

    <RouterLink
      to="/library"
      data-testid="bottom-nav-library"
      :aria-current="isLibrary ? 'page' : undefined"
      :aria-label="t('nav.library')"
      :class="linkClasses(isLibrary)"
    >
      <svg
        class="h-6 w-6 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span :class="labelClasses(isLibrary)">{{ t('nav.library') }}</span>
    </RouterLink>

    <RouterLink
      to="/queue"
      data-testid="bottom-nav-queue"
      :aria-current="isQueue ? 'page' : undefined"
      :aria-label="t('nav.queue')"
      :class="linkClasses(isQueue)"
    >
      <svg
        class="h-6 w-6 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h11" />
        <path d="M4 12h11" />
        <path d="M4 18h7" />
        <circle cx="18" cy="16" r="3" />
        <path d="M21 16V7l-3 1" />
      </svg>
      <span :class="labelClasses(isQueue)">{{ t('nav.queue') }}</span>
    </RouterLink>

    <RouterLink
      to="/settings"
      data-testid="bottom-nav-settings"
      :aria-current="isSettings ? 'page' : undefined"
      :aria-label="t('nav.settings')"
      :class="linkClasses(isSettings)"
    >
      <svg
        class="h-6 w-6 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      <span :class="labelClasses(isSettings)">{{ t('nav.settings') }}</span>
    </RouterLink>
  </nav>
</template>
