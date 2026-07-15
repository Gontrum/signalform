<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import { useUserStore } from '../shell/useUserStore'

const i18nStore = useI18nStore()
const userStore = useUserStore()

const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-6"
    data-testid="user-select-dialog"
    role="dialog"
    aria-modal="true"
  >
    <div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
      <h1 class="mb-6 text-2xl font-bold text-neutral-900">{{ t('user.selectTitle') }}</h1>

      <div class="flex flex-col gap-3">
        <button
          v-for="user in userStore.users"
          :key="user.id"
          type="button"
          data-testid="user-select-option"
          class="w-full rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          @click="userStore.selectUser(user.id)"
        >
          {{ user.name }}
        </button>
      </div>
    </div>
  </div>
</template>
