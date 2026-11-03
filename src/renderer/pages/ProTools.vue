<template>
  <v-container fluid class="pa-4">

    <!-- Kopf: Titel + Ampel -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-3">
        <div>
          <div class="text-subtitle-1 font-weight-medium">Pro Tools Presets</div>
          <div class="text-caption text-medium-emphasis">Auswahl unten, dann Store/Recall</div>
        </div>
      </div>
      <div class="d-flex align-center ga-2 text-body-2">
        <span class="status-dot" :class="isOnline ? 'bg-success' : 'bg-error'" />
        {{ isOnline ? 'Pro Tools läuft' : 'Pro Tools nicht geöffnet' }}
      </div>
    </div>

    <!-- Kategorie 1 -->
    <v-card class="mb-3">
      <v-list density="compact">
        <v-list-item v-for="item in cat1" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Kategorie 2 -->
    <v-card class="mb-3">
      <v-list density="compact">
        <v-list-item v-for="item in cat2" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
          <template #append>
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

    <!-- Kategorie 3 -->
    <v-card class="mb-3">
      <v-list density="compact">
        <v-list-item v-for="item in cat3" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Sticky Action-Bar -->
    <div class="sticky-bottom-bar d-flex justify-space-between align-center ga-2">
      <div class="d-flex ga-2">
        <v-btn size="small" variant="outlined" @click="selectAllPresets">Alles auswählen</v-btn>
        <v-btn size="small" variant="outlined" @click="deselectAllPresets">Alles abwählen</v-btn>
      </div>
      <div class="d-flex ga-2">
        <v-btn variant="outlined" :disabled="!anySelected" @click="onRecallAll">Recall</v-btn>
        <v-btn color="primary" :disabled="!anySelected" @click="onStoreAll">Store</v-btn>
      </div>
    </div>

    <v-snackbar v-model="snack.open" :color="snack.color" timeout="2000">{{ snack.text }}</v-snackbar>

    <!-- Ergebnis pro Kategorie, wenn nicht alles glatt lief -->
    <PresetResultDialog v-model="resultDialog.open" :result="resultDialog.data" />

    <!-- Bestätigungs-Dialog -->
    <v-dialog v-model="confirm.open" max-width="400">
      <v-card>
        <v-card-title class="text-h6">{{ confirm.title }}</v-card-title>
        <v-card-text>{{ confirm.text }}</v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="confirmResolve(false)">Abbrechen</v-btn>
          <v-btn color="primary" @click="confirmResolve(true)">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'

import PresetResultDialog from '@/components/PresetResultDialog.vue'
import { backend } from '@/lib/backend'
const POLL_MS = 5000
const isOnline = ref(false)
let pollTimer: any = null

const cat1 = reactive([
  { key: 'templates', label: 'Templates', selected: false },
  { key: 'trackPresets', label: 'Track Presets', selected: false },
  { key: 'pluginSettings', label: 'Plug-In Settings', selected: false }
])
const cat2 = reactive([
  { key: 'fadePresets', label: 'Fade Presets', selected: false, quick: false },
  { key: 'clipFxPresets', label: 'Clip Effects Presets', selected: false, quick: false },
  { key: 'memoryLocation', label: 'Memory Location Presets', selected: false, quick: false },
  { key: 'trackDataToRecall', label: 'Track Data to Recall Presets', selected: false, quick: false }
])
const cat3 = reactive([
  { key: 'keyboardShortcuts', label: 'Keyboard Shortcuts', selected: false }
//  { key: 'pluginMaps', label: 'Plug-In Maps', selected: false }
])

const anySelected = computed(() =>
  [...cat1, ...cat2, ...cat3].some(i => i.selected)
)

const snack = reactive({ open: false, text: '', color: 'success' })
const resultDialog = reactive({ open: false, data: null as any })
const confirm = reactive({
  open: false,
  title: '',
  text: '',
  cb: null as any
})

async function onRecallAll() {
  const ok = await showConfirm('Recall ausführen?', 'Die ausgewählten Presets werden vom Server auf das lokale System. Vorhandene Dateien werden überschrieben.')
  if (ok) sendAction('recall')
}
async function onStoreAll() {
  const ok = await showConfirm('Store ausführen?', 'Die ausgewählten Presets werden vom lokalen System auf den Server übertragen. Vorhandene Dateien werden überschrieben.')
  if (ok) sendAction('store')
}

async function sendAction(action) {
  const payload = {
    action,
    categories: {
      cat1: cat1.filter(i => i.selected).map(i => ({ key: i.key })),
      cat2: cat2.filter(i => i.selected).map(i => ({ key: i.key, quick: !!i.quick })),
      cat3: cat3.filter(i => i.selected).map(i => ({ key: i.key }))
    }
  }

  try {
    const data = await backend.runProToolsPresets(payload)

    // Lief nicht alles glatt, zeigen wir die Einzelheiten statt nur einer kurzen Meldung
    if (data.details.every(detail => detail.status === 'ok')) {
      snack.color = 'success'
      snack.text = data.message
      snack.open = true
    } else {
      resultDialog.data = data
      resultDialog.open = true
    }

  } catch (e) {
    snack.color = 'error'
    snack.text = 'Fehler: ' + (e.message || 'Aktion fehlgeschlagen')
    snack.open = true
  }
}

function showConfirm(title, text) {
  confirm.title = title
  confirm.text = text
  confirm.open = true
  return new Promise(resolve => confirm.cb = resolve)
}
function confirmResolve(val) {
  confirm.open = false
  confirm.cb?.(val)
}

function selectAllPresets() {
  cat1.forEach(i => i.selected = true)
  cat2.forEach(i => i.selected = true)
  cat3.forEach(i => i.selected = true)
  // Quick Presets NICHT automatisch aktivieren!
  cat2.forEach(i => i.quick = false)
}
function deselectAllPresets() {
  cat1.forEach(i => i.selected = false)
  cat2.forEach(i => { i.selected = false; i.quick = false })
  cat3.forEach(i => i.selected = false)
}

onMounted(async () => {
  // Initialer Status-Check direkt beim Laden
  try {
    isOnline.value = (await backend.proToolsStatus()).online
  } catch {
    isOnline.value = false
  }

  // Polling
  pollTimer = setInterval(async () => {
    try {
      isOnline.value = (await backend.proToolsStatus()).online
    } catch {
      isOnline.value = false
    }
  }, POLL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>
