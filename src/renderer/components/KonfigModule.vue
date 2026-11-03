<template>
  <v-card class="pa-4 mb-4">
    <div class="text-subtitle-1 font-weight-medium mb-2">Soundminer</div>
    <div class="d-flex align-center ga-6 mb-4">
      <v-checkbox
        v-model="staged.soundminerEnabled"
        label="Modul aktivieren"
        class="ma-0"
      />
      <v-spacer />
      <v-select
        v-model="staged.soundminerVersion"
        :items="soundminerVersions"
        label="Version"
        :disabled="!staged.soundminerEnabled"
        hide-details
        class="module-version ma-0"
      />
    </div>
    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        v-model="staged.soundminerPath"
        hide-details
        label="Soundminer Support Folder"
        :disabled="!staged.soundminerEnabled"
        class="flex-grow-1"
      />
      <v-btn
        :disabled="!staged.soundminerEnabled"
        @click="browseInto('soundminerPath', 'Soundminer Support Folder auswählen')"
        variant="outlined"
      >
        Durchsuchen
      </v-btn>
    </div>
  </v-card>

  <v-card class="pa-4 mb-4">
    <div class="text-subtitle-1 font-weight-medium mb-2">Projekte umbenennen</div>
    <v-checkbox
      v-model="staged.renameEnabled"
      label="Umbenennen vorhandener Projekte erlauben"
      hide-details
      class="ma-0"
    />
    <div class="text-caption text-medium-emphasis mt-1">
      Erst einschalten, wenn das Umbenennen auf dem gemeinsamen Speicher getestet wurde.
    </div>
  </v-card>

  <v-alert v-if="error" type="error">{{ error }}</v-alert>
</template>

<script setup lang="ts">
/**
 * Konfiguration, Bereich Module: Soundminer und das Umbenennen von Projekten einschalten.
 */
import { ref, reactive, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

const soundminerVersions = [
  'V6 Pro'
]

// Serverzustand + Arbeitskopie (UI-Felder bleiben flach: soundminerEnabled/Path/Version)
const original = ref({ data:{ soundminerEnabled:false, soundminerPath:'', soundminerVersion:'', renameEnabled:false }, version:'' })
const staged   = reactive({ soundminerEnabled:false, soundminerPath:'', soundminerVersion:'', renameEnabled:false })
const error    = ref('')

const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.data))
const isSoundminerValid = computed(() => {
  if (!staged.soundminerEnabled) return true
  // soundminerEnabled ist true: beide Felder müssen ausgefüllt sein (nicht leer, nicht nur Whitespace)
  return !!(staged.soundminerPath && staged.soundminerPath.trim()) &&
         !!(staged.soundminerVersion && staged.soundminerVersion.trim())
})

async function loadSnapshot() {
  error.value = ''
  try {
    const snap: any = await backend.getModules()
    // Die Oberfläche arbeitet mit flachen Feldern, das Backend mit verschachtelten
    const sm = snap?.data?.soundminer || {}
    original.value = {
      data: {
        soundminerEnabled: !!sm.enabled,
        soundminerPath:    typeof sm.supportPath === 'string' ? sm.supportPath : '',
        soundminerVersion: typeof sm.version === 'string' ? sm.version : '',
        renameEnabled: !!snap?.data?.umbenennen?.enabled
      },
      version: snap?.version || ''
    }
    Object.assign(staged, original.value.data)
  } catch (e) {
    error.value = e.message || 'Module laden fehlgeschlagen'
  }
}
onMounted(loadSnapshot)

/** Öffnet die Ordnerauswahl des Systems und übernimmt den gewählten Ordner. */
async function browseInto(key, title) {
  const picked = await window.electronAPI.pickFolder(title, staged[key] || undefined)
  if (typeof picked === 'string' && picked.length > 0) {
    staged[key] = picked.replace(/\\/g, '/') // Windows: einheitlich mit Schrägstrich
  }
}

// Das nutzt Konfiguration.vue beim Speichern und Abbrechen
defineExpose({
  isDirty: () => isDirty.value,
  isSoundminerValid: () => isSoundminerValid.value,
  getSnapshotForSave: () => ({
    // Zurück ins Format des Backends
    version: original.value.version,
    data: {
      soundminer: {
        enabled: !!staged.soundminerEnabled,
        supportPath: staged.soundminerPath || '',
        version: staged.soundminerVersion || ''
      },
      umbenennen: { enabled: !!staged.renameEnabled }
    }
  }),
  resetToServer: async () => { await loadSnapshot() }
})
</script>
