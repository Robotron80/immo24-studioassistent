<template>
  <v-card class="pa-4 mb-4 shadow-card" variant="text">
    <div class="schema-title mb-2">Soundminer</div>
    <div class="d-flex align-center mb-4" style="gap: 24px;">
      <v-checkbox
        v-model="staged.soundminerEnabled"
        label="Modul aktivieren"
        density="comfortable"
        class="ma-0"
        style="min-width: 0;"
      />
      <v-spacer />
      <v-select
        v-model="staged.soundminerVersion"
        :items="soundminerVersions"
        label="Version"
        :disabled="!staged.soundminerEnabled"
        density="comfortable"
        style="max-width: 160px; min-width: 120px;"
        hide-details
        class="ma-0"
      />
    </div>
    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        v-model="staged.soundminerPath"
        label="Soundminer Support Folder"
        :disabled="!staged.soundminerEnabled"
        class="flex-grow-1"
        density="comfortable"
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
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'



const soundminer = ref({
  enabled: false,
  path: '',
  version: null,
})

const soundminerVersions = [
  'V6 Pro'
]

// Serverzustand + Arbeitskopie (UI-Felder bleiben flach: soundminerEnabled/Path/Version)
const original = ref({ data:{ soundminerEnabled:false, soundminerPath:'', soundminerVersion:'' }, version:'' })
const staged   = reactive({ soundminerEnabled:false, soundminerPath:'', soundminerVersion:'' })
const loading  = ref(false)
const error    = ref('')





// Helpers
const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.data))
const isSoundminerValid = computed(() => {
  if (!staged.soundminerEnabled) return true
  // soundminerEnabled ist true: beide Felder müssen ausgefüllt sein (nicht leer, nicht nur Whitespace)
  return !!(staged.soundminerPath && staged.soundminerPath.trim()) &&
         !!(staged.soundminerVersion && staged.soundminerVersion.trim())
})

async function loadSnapshot() {
  loading.value = true; error.value = ''
  try {
    const res = await fetch(`${API}/modules`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const snap = await res.json() // {data:{...}, version:"..."}
    // Mapping Backend -> UI
    const sm = snap?.data?.soundminer || {}


    original.value = {
      data: {
        soundminerEnabled: !!sm.enabled,
        soundminerPath:    typeof sm.supportPath === 'string' ? sm.supportPath : '',
        soundminerVersion: typeof sm.version === 'string' ? sm.version : ''
          },
      version: snap?.version || ''
    }
    Object.assign(staged, original.value.data)
  } catch (e) {
    error.value = e.message || 'Module laden fehlgeschlagen'
    console.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(loadSnapshot)

// Browsing functionality
const canBrowse = typeof window !== 'undefined' && !!window.electronAPI?.pickFolder;

async function browseInto(key, title) {
  if (!canBrowse) return;
  const defaultPath = staged[key] || undefined;
  const picked = await window.electronAPI.pickFolder(title, defaultPath);
  // DEBUG console.debug('[browseInto] picked:', picked, 'for', key, 'defaultPath:', defaultPath);
  if (typeof picked === 'string' && picked.length > 0) {
    staged[key] = picked.replace(/\\/g, '/'); // Windows: Backslashes normalisieren
  }
}



// Methoden für Elternkomponente exponieren
defineExpose({
  isDirty: () => isDirty.value,
  isSoundminerValid: () => isSoundminerValid.value,
  getSnapshotForSave: () => ({
    // Mapping UI -> Backend
    version: original.value.version,
    data: {
      soundminer: {
        enabled: !!staged.soundminerEnabled,
        supportPath: staged.soundminerPath || '',
        version: staged.soundminerVersion || ''
      }
    }
  }),
  resetToServer: async () => { await loadSnapshot() }
})

</script>

<style scoped>
.shadow-card {
  box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
  border-radius: 10px;
  border: none;
}
.schema-title {
  font-size: 1.05rem;
  font-weight: 500;
  color: #444;
}
</style>