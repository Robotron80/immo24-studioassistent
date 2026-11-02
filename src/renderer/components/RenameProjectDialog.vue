<template>
  <v-dialog :model-value="modelValue" max-width="600" persistent>
    <v-card>
      <v-card-title class="text-h6">Projekt umbenennen</v-card-title>

      <!-- Schritt 1: neue Werte -->
      <v-card-text v-if="step === 'form'">
        <v-text-field v-model="neuerName" label="Neuer Projektname" variant="outlined" density="comfortable" />
        <v-text-field v-model="neueMoid" label="Neue Mo-ID" variant="outlined" density="comfortable" />
        <v-alert v-if="error" type="error" density="compact" variant="tonal">{{ error }}</v-alert>
      </v-card-text>

      <!-- Schritt 2: Vorschau und Bestätigung -->
      <v-card-text v-else>
        <div class="text-caption text-medium-emphasis">Projektordner</div>
        <div class="path">{{ preview.von }}</div>
        <div class="text-caption text-medium-emphasis mt-2">wird zu</div>
        <div class="path font-weight-medium mb-3">{{ preview.nach }}</div>

        <v-alert v-if="preview.proToolsLaeuft" type="error" density="compact" variant="tonal" class="mb-3">
          Pro Tools läuft auf diesem Rechner. Bitte zuerst schließen und erneut prüfen.
        </v-alert>
        <v-alert v-if="preview.gesperrt.length" type="warning" density="compact" variant="tonal" class="mb-3">
          Im Projekt liegen Sperrdateien, vermutlich ist dort eine Session geöffnet:
          <div v-for="file in preview.gesperrt" :key="file" class="path">{{ file }}</div>
          <v-checkbox
            v-model="ignoreLocks"
            label="Ich habe geprüft, dass die Session nirgends geöffnet ist"
            density="compact"
            hide-details
          />
        </v-alert>

        <v-alert type="warning" density="compact" variant="tonal" class="mb-3">
          Videodateien müssen nach dem Umbenennen eventuell neu in die Session importiert werden.
        </v-alert>

        <div class="text-body-2">
          Vorhandene Sessions behalten ihren Namen und bleiben unverändert. Neue Sessions tragen
          den neuen Namen, die Version zählt weiter.
        </div>
        <v-checkbox
          v-if="!preview.gesperrt.length"
          v-model="confirmed"
          label="Das Projekt ist auf keinem anderen Rechner geöffnet"
          density="compact"
          hide-details
          class="mt-2"
        />
        <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mt-2">{{ error }}</v-alert>
      </v-card-text>

      <v-card-actions class="justify-end">
        <v-btn variant="text" :disabled="busy" @click="close">Abbrechen</v-btn>
        <v-btn v-if="step === 'form'" color="primary" :loading="busy" @click="loadPreview">Prüfen</v-btn>
        <template v-else>
          <v-btn variant="text" :disabled="busy" @click="loadPreview">Erneut prüfen</v-btn>
          <v-btn color="primary" :loading="busy" :disabled="!canRename" @click="doRename">Umbenennen</v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
/**
 * Führt in zwei Schritten durchs Umbenennen: neue Werte, dann Vorschau.
 * Die eigentliche Arbeit und alle Prüfungen passieren in src/core/rename.ts.
 */
import { computed, ref, watch } from 'vue'

import { backend } from '@/lib/backend'

const props = defineProps({
  modelValue: Boolean,
  kunde: { type: String, default: '' },
  project: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'renamed'])

const step = ref('form')
const neuerName = ref('')
const neueMoid = ref('')
const preview = ref(null)
const ignoreLocks = ref(false)
const confirmed = ref(false)
const error = ref('')
const busy = ref(false)

const canRename = computed(() => {
  if (!preview.value || preview.value.proToolsLaeuft) return false
  return preview.value.gesperrt.length ? ignoreLocks.value : confirmed.value
})

// Beim Öffnen alles zurücksetzen und mit den aktuellen Werten vorbelegen
watch(() => props.modelValue, (open) => {
  if (!open) return
  neuerName.value = props.project?.projektname ?? ''
  neueMoid.value = props.project?.moid ?? ''
  preview.value = null
  ignoreLocks.value = false
  confirmed.value = false
  error.value = ''
  step.value = 'form'
})

/** Die Angaben, an denen das Backend das Projekt und die neuen Werte erkennt. */
function request (extra = {}) {
  return {
    kunde: props.kunde,
    date: props.project.date,
    projektname: props.project.projektname,
    moid: props.project.moid,
    neuerName: neuerName.value,
    neueMoid: neueMoid.value,
    ...extra,
  }
}

/** Führt eine Aktion aus und zeigt Fehler im Dialog an. */
async function run (action) {
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    const lines = e.details?.details?.flatMap(report => report.errors.map(item => item.message))
    error.value = lines?.length ? lines.join(' ') : e.message
  } finally {
    busy.value = false
  }
}

function loadPreview () {
  return run(async () => {
    preview.value = await backend.previewRename(request())
    step.value = 'preview'
  })
}

function doRename () {
  return run(async () => {
    const result = await backend.renameProject(request({ trotzSperre: ignoreLocks.value }))
    emit('renamed', result)
    close()
  })
}

function close () {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.path {
  overflow-wrap: anywhere;
  font-family: monospace;
  font-size: 0.85rem;
}
</style>
