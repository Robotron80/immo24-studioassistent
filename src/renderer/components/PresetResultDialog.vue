<template>
  <v-dialog :model-value="modelValue" max-width="560" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-h6">{{ result?.message }}</v-card-title>
      <v-list density="compact">
        <v-list-item v-for="detail in result?.details" :key="detail.category">
          <template #prepend>
            <v-icon :color="STATUS[detail.status].color" :icon="STATUS[detail.status].icon" />
          </template>
          <v-list-item-title>{{ LABELS[detail.category] || detail.category }}</v-list-item-title>
          <v-list-item-subtitle class="wrap-subtitle">{{ detail.note || STATUS[detail.status].text }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <v-card-actions class="justify-end">
        <v-btn color="primary" @click="emit('update:modelValue', false)">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * Zeigt nach Store oder Recall, was pro Kategorie passiert ist.
 * Erscheint nur, wenn nicht alles glatt lief, sonst reicht die kurze Meldung.
 */
defineProps<{
  modelValue: boolean
  result: any
}>()
const emit = defineEmits(['update:modelValue'])

const STATUS: Record<string, { color: string; icon: string; text: string }> = {
  ok: { color: 'success', icon: 'mdi-check-circle', text: 'Erfolgreich kopiert' },
  partial: { color: 'warning', icon: 'mdi-alert', text: 'Nichts zu kopieren' },
  error: { color: 'error', icon: 'mdi-close-circle', text: 'Fehler beim Kopieren' },
}

const LABELS: Record<string, string> = {
  templates: 'Templates',
  trackpresets: 'Track Presets',
  pluginsettings: 'Plug-In Settings',
  fadePresets: 'Fade Presets',
  clipfxpresets: 'Clip Effects Presets',
  memoryLocation: 'Memory Location Presets',
  trackdatarecall: 'Track Data to Recall Presets',
  keyboardshortcuts: 'Keyboard Shortcuts',
  tablayouts: 'Tab Layouts',
  preflight: 'Prüfung vor dem Start',
}
</script>
