<script setup lang="ts">
import { TAG_VOCABULARY } from '@signalform/shared'
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'
import { CHIP_ROW_FLUSH_CLASS, chipClass } from '@/platform/ui/chips'

const props = defineProps<{
  readonly activeTagId?: string
}>()

const emit = defineEmits<{
  (event: 'select', tagId: string | undefined): void
}>()

const i18nStore = useI18nStore()
const t = (key: MessageKey): string => i18nStore.t(key)

const toggleTag = (tagId: string): void => {
  emit('select', props.activeTagId === tagId ? undefined : tagId)
}
</script>

<template>
  <div
    data-testid="tag-chip-row"
    :class="CHIP_ROW_FLUSH_CLASS"
    role="group"
    :aria-label="t('search.tagFilterLabel')"
  >
    <button
      v-for="tag in TAG_VOCABULARY"
      :key="tag.id"
      type="button"
      :data-testid="`tag-chip-${tag.id}`"
      :aria-pressed="activeTagId === tag.id ? 'true' : 'false'"
      :class="chipClass(activeTagId === tag.id)"
      @click="toggleTag(tag.id)"
    >
      {{ tag.label }}
    </button>
  </div>
</template>
