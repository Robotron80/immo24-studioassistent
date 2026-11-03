<template>
  <v-menu v-model="open" :close-on-content-click="false" :disabled="disabled">
    <template #activator="{ props: menuProps }">
      <v-text-field
        :model-value="modelValue"
        :label="label"
        :disabled="disabled"
        :rules="[isValidDate]"
        placeholder="JJJJ-MM-TT"
        @update:model-value="emit('update:modelValue', $event)"
      >
        <template #append-inner>
          <v-icon v-bind="menuProps" icon="mdi-menu-down" aria-label="Kalender öffnen" />
        </template>
      </v-text-field>
    </template>
    <v-date-picker
      :model-value="asDate"
      first-day-of-week="1"
      show-adjacent-months
      hide-header
      color="primary"
      @update:model-value="pick"
    />
  </v-menu>
</template>

<script setup lang="ts">
/**
 * Datumsfeld mit festem Format JJJJ-MM-TT und Kalender mit Montag als erstem Wochentag.
 *
 * Das eingebaute Datumsfeld des Browsers richtet sich nach der Sprache des Betriebssystems
 * und sah deshalb auf jedem Rechner anders aus. Dieses hier ist überall gleich.
 */
import { computed, ref } from 'vue'

import { localDate } from '../../core/dates'

const props = defineProps<{
  modelValue: string
  label: string
  disabled?: boolean
}>()
const emit = defineEmits(['update:modelValue'])

const open = ref(false)

/** Prüft das Format und ob es den Tag wirklich gibt, der 31.02. fällt also durch. */
function parse (text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '')
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getMonth() === Number(match[2]) - 1 ? date : null
}

function isValidDate (text: string) {
  return parse(text) !== null || 'Format: JJJJ-MM-TT'
}

const asDate = computed(() => parse(props.modelValue))

/** Übernimmt den Tag aus dem Kalender, in Ortszeit, damit sich das Datum nicht verschiebt. */
function pick (date: unknown) {
  emit('update:modelValue', localDate(date as Date))
  open.value = false
}
</script>
