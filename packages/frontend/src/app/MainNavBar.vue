<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'

const route = useRoute()
const isSearch = computed(() => route.path === '/')
const isLibrary = computed(() => route.path === '/library')
const isSettings = computed(() => route.path === '/settings')

const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

const navLinkClasses = (isActive: boolean): readonly string[] => [
  'flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all sm:flex-none sm:px-4',
  isActive
    ? 'bg-neutral-950 text-white shadow-sm'
    : 'text-neutral-600 hover:bg-white hover:text-neutral-900',
]
</script>

<template>
  <nav
    :aria-label="t('nav.brandTagline')"
    data-testid="main-nav"
    class="mb-4 border-b border-neutral-200 pb-3"
  >
    <div class="flex flex-wrap items-start gap-x-3 gap-y-3 sm:flex-nowrap sm:items-center">
      <div
        data-testid="brand-badge"
        class="flex min-w-0 flex-1 items-center gap-3 sm:max-w-[15rem] sm:flex-none"
      >
        <img
          src="/icon-192.png"
          alt="Signalform icon"
          class="h-10 w-10 flex-shrink-0 rounded-2xl border border-neutral-200 bg-neutral-950/5 p-1 shadow-sm"
        />
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold tracking-tight text-neutral-950">
            Signalform
          </p>
          <p
            data-testid="brand-motto"
            class="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600"
          >
            {{ t('nav.brandMotto') }}
          </p>
        </div>
      </div>

      <div
        data-testid="nav-links"
        class="flex w-full items-center gap-1 rounded-2xl bg-neutral-100/80 p-1 sm:ml-auto sm:w-auto"
      >
        <RouterLink
          to="/"
          data-testid="nav-search"
          :aria-current="isSearch ? 'page' : undefined"
          :aria-label="t('nav.search')"
          :class="navLinkClasses(isSearch)"
        >
          {{ t('nav.search') }}
        </RouterLink>
        <RouterLink
          to="/library"
          data-testid="nav-library"
          :aria-current="isLibrary ? 'page' : undefined"
          :aria-label="t('nav.library')"
          :class="navLinkClasses(isLibrary)"
        >
          {{ t('nav.library') }}
        </RouterLink>
        <RouterLink
          to="/settings"
          data-testid="nav-settings"
          :aria-current="isSettings ? 'page' : undefined"
          :aria-label="t('nav.settings')"
          :class="navLinkClasses(isSettings)"
        >
          {{ t('nav.settings') }}
        </RouterLink>
      </div>
    </div>
  </nav>
</template>
