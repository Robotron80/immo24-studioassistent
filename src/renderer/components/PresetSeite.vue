<template>
  <v-container fluid class="pa-4">

    <!-- Kopf: Titel und Statuspunkt -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <div class="text-subtitle-1 font-weight-medium">{{ name }} Presets</div>
        <div class="text-caption text-medium-emphasis">Auswahl unten, dann Store/Recall</div>
      </div>
      <div class="d-flex align-center ga-2 text-body-2">
        <span class="status-dot" :class="isOnline ? 'bg-success' : 'bg-error'" />
        {{ isOnline ? `${name} läuft` : `${name} nicht geöffnet` }}
      </div>
    </div>

    <!-- Jede Gruppe ist eine eigene Karte. Einträge mit dem Feld "quick" bekommen rechts die Quick Presets. -->
    <v-card v-for="(group, index) in selection" :key="index" class="mb-3">
      <v-list density="compact">
        <v-list-item v-for="item in group" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
          <template v-if="item.quick !== undefined" #append>
            <v-checkbox
              v-model="item.quick"
              label="Quick Presets"
              hide-details
              density="compact"
              :disabled="!item.selected"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <div class="sticky-bottom-bar d-flex justify-space-between align-center ga-2">
      <div class="d-flex ga-2">
        <v-btn size="small" variant="outlined" @click="selectAll(true)">Alles auswählen</v-btn>
        <v-btn size="small" variant="outlined" @click="selectAll(false)">Alles abwählen</v-btn>
      </div>
      <div class="d-flex ga-2">
        <v-btn variant="outlined" :disabled="!anySelected" @click="askAndRun('recall')">Recall</v-btn>
        <v-btn color="primary" :disabled="!anySelected" @click="askAndRun('store')">Store</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="2000">{{ snack.text }}</v-snackbar>

    <!-- Ergebnis pro Kategorie, wenn nicht alles glatt lief -->
    <PresetResultDialog v-model="resultDialog.open" :result="resultDialog.data" />

    <!-- Sicherheitsabfrage vor dem Kopieren -->
    <v-dialog v-model="confirm.open" max-width="400">
      <v-card>
        <v-card-title class="text-h6">{{ confirm.title }}</v-card-title>
        <v-card-text>{{ confirm.text }}</v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="confirm.open = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="runConfirmed">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Die gemeinsame Oberfläche der Seiten Pro Tools und Soundminer: Auswahl, Store und Recall.
 *
 * Die beiden Seiten geben nur an, was sie unterscheidet: Name, Einträge und Backend-Aufrufe.
 * Das Prüfen und Kopieren selbst passiert im Backend (src/core/presets.ts).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import PresetResultDialog from '@/components/PresetResultDialog.vue'

const props = defineProps<{
  /** So heißt das Programm in Überschrift und Statusanzeige */
  name: string
  /** Die Einträge, in Gruppen. Mit quick: false bietet ein Eintrag Quick Presets an. */
  groups: Array<Array<{ key: string; label: string; quick?: boolean }>>
  /** Fragt das Backend, ob das Programm gerade läuft */
  getStatus: () => Promise<{ online: boolean }>
  /** Führt Store oder Recall im Backend aus */
  run: (input: { action: string; categories: Record<string, unknown[]> }) => Promise<any>
}>()

const STATUS_INTERVAL_MS = 5000
const QUESTIONS = {
  store: {
    title: 'Store ausführen?',
    text: 'Die ausgewählten Presets werden vom lokalen System auf den Server übertragen. Vorhandene Dateien werden überschrieben.',
  },
  recall: {
    title: 'Recall ausführen?',
    text: 'Die ausgewählten Presets werden vom Server auf das lokale System übertragen. Vorhandene Dateien werden überschrieben.',
  },
}

// Die Auswahl gehört nur dieser Seite und beginnt immer leer
const selection = reactive(props.groups.map((group) => group.map((item) => ({ ...item, selected: false }))))
const allItems = computed(() => selection.flat())
const anySelected = computed(() => allItems.value.some((item) => item.selected))

const isOnline = ref(false)
const snack = reactive({ open: false, text: '', color: 'success' })
const resultDialog = reactive({ open: false, data: null as any })
const confirm = reactive({ open: false, title: '', text: '', action: '' })

/** Wählt alles aus oder ab. Quick Presets gehen dabei immer aus, sie wählt man einzeln. */
function selectAll(selected: boolean) {
  for (const item of allItems.value) {
    item.selected = selected
    if (item.quick !== undefined) item.quick = false
  }
}

/** Zeigt die Sicherheitsabfrage. Das Kopieren beginnt erst mit "OK". */
function askAndRun(action: 'store' | 'recall') {
  Object.assign(confirm, QUESTIONS[action], { open: true, action })
}

/** Schickt die Auswahl ans Backend. Lief nicht alles glatt, zeigt ein Dialog die Einzelheiten. */
async function runConfirmed() {
  confirm.open = false
  const categories = Object.fromEntries(selection.map((group, index) => [
    `cat${index + 1}`,
    group
      .filter((item) => item.selected)
      .map(({ key, quick }) => (quick === undefined ? { key } : { key, quick })),
  ]))

  try {
    const data = await props.run({ action: confirm.action, categories })
    if (data.details.every((detail) => detail.status === 'ok')) {
      Object.assign(snack, { open: true, color: 'success', text: data.message })
    } else {
      Object.assign(resultDialog, { open: true, data })
    }
  } catch (e) {
    Object.assign(snack, { open: true, color: 'error', text: `Fehler: ${e.message || 'Aktion fehlgeschlagen'}` })
  }
}

/** Aktualisiert den Statuspunkt. Klappt die Abfrage nicht, gilt das Programm als nicht geöffnet. */
async function updateStatus() {
  try {
    isOnline.value = (await props.getStatus()).online
  } catch {
    isOnline.value = false
  }
}

let statusTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  updateStatus()
  statusTimer = setInterval(updateStatus, STATUS_INTERVAL_MS)
})
onBeforeUnmount(() => clearInterval(statusTimer))
</script>
