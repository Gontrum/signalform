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
</script>

<template>
  <nav
    :aria-label="t('nav.brandTagline')"
    data-testid="main-nav"
    class="mb-4 flex items-center gap-3 border-b border-neutral-200 pb-2"
  >
    <div data-testid="brand-badge" class="flex min-w-0 items-center gap-3 pr-2">
      <img src="/icon-192.png" alt="Signalform icon" class="h-9 w-9 rounded-xl shadow-sm" />
      <div class="min-w-0">
        <p class="text-sm font-semibold text-neutral-900">Signalform</p>
        <p class="text-xs text-neutral-500">{{ t('nav.brandTagline') }}</p>
      </div>
    </div>

    <RouterLink
      to="/"
      data-testid="nav-search"
      :aria-current="isSearch ? 'page' : undefined"
      :aria-label="t('nav.search')"
      :class="[
        'flex min-h-[44px] items-center rounded px-4 text-sm font-medium transition-colors',
        isSearch ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900',
      ]"
    >
      {{ t('nav.search') }}
    </RouterLink>
    <RouterLink
      to="/library"
      data-testid="nav-library"
      :aria-current="isLibrary ? 'page' : undefined"
      :aria-label="t('nav.library')"
      :class="[
        'flex min-h-[44px] items-center rounded px-4 text-sm font-medium transition-colors',
        isLibrary ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900',
      ]"
    >
      {{ t('nav.library') }}
    </RouterLink>
    <RouterLink
      to="/settings"
      data-testid="nav-settings"
      :aria-current="isSettings ? 'page' : undefined"
      :aria-label="t('nav.settings')"
      :class="[
        'ml-auto flex min-h-[44px] items-center rounded px-4 text-sm font-medium transition-colors',
        isSettings ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900',
      ]"
    >
      {{ t('nav.settings') }}
    </RouterLink>
  </nav>
</template>
