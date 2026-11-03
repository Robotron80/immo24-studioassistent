<template>
  <v-combobox
    v-model:search="search"
    :model-value="chips"
    :label="label"
    :disabled="disabled"
    :rules="chipRules"
    :delimiters="[' ', ',', '+']"
    :items="[]"
    menu-icon=""
    multiple
    chips
    closable-chips
    hide-no-data
    hide-details="auto"
    @update:model-value="onChipsChange"
    @update:focused="onFocusChange"
  />
</template>

<script setup lang="ts">
/**
 * Das Eingabefeld für eine oder mehrere MoIDs: Jede MoID wird zu einem kleinen Chip.
 * Leerzeichen, Komma, Plus, Enter und das Verlassen des Felds schließen eine MoID ab,
 * das Kreuz entfernt sie wieder.
 *
 * Nach außen bleibt der Wert ein einziger Text wie "AB12+CD34", so wie er auch gespeichert wird.
 * Benutzt im Formular der Projektanlage und im Dialog zum Umbenennen.
 */
import { computed, ref } from 'vue'

import { formatMoids, moidList } from '../../core/names'

const props = defineProps<{
  modelValue: string
  label: string
  disabled?: boolean
  /** Prüfungen wie bei einem normalen Feld, sie bekommen den Text "AB12+CD34" */
  rules?: Array<(value: string) => boolean | string>
}>()
const emit = defineEmits(['update:modelValue'])

const chips = computed(() => moidList(props.modelValue))
const chipRules = computed(() => (props.rules ?? []).map((rule) => (value: string[]) => rule(value.join('+'))))

// Was gerade getippt wird und noch kein Chip ist
const search = ref('')

/** Schreibt die Chips groß, entfernt doppelte und gibt sie als gemeinsamen Text weiter. */
function onChipsChange(value: string[]) {
  emit('update:modelValue', [...new Set(moidList(formatMoids(value.join('+'))))].join('+'))
}

/** Verlässt man das Feld, wird auch das zuletzt Getippte zum Chip und geht nicht verloren. */
function onFocusChange(focused: boolean) {
  if (focused || !search.value?.trim()) return
  onChipsChange([...chips.value, search.value])
  search.value = ''
}
</script>
