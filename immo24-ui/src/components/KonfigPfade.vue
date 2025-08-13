<template>
  <v-card flat>
    <v-card-text>
      <v-row class="gap-4">
        <v-col cols="12" md="6">
          <v-text-field
            v-model="staged.PathMitarbeiter"
            label="Pfad Mitarbeiter"
            density="comfortable"
            append-inner-icon="mdi-folder"
            @click:append-inner="browseInto('PathMitarbeiter', 'Pfad Mitarbeiter auswählen')"
          />
        </v-col>

        <v-col cols="12" md="6">
          <v-text-field
            v-model="staged.PathProduktionen"
            label="Pfad Produktionen"
            density="comfortable"
            append-inner-icon="mdi-folder"
            @click:append-inner="browseInto('PathProduktionen', 'Pfad Produktionen auswählen')"
          />
        </v-col>

        <v-col cols="12" md="6">
          <v-text-field
            v-model="staged.PathStammdaten"
            label="Pfad Stammdaten"
            density="comfortable"
            append-inner-icon="mdi-folder"
            @click:append-inner="browseInto('PathStammdaten', 'Pfad Stammdaten auswählen')"
          />
        </v-col>
      </v-row>

      <v-alert v-if="error" type="error" class="mt-4">
        {{ error }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>


<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'

// Serverzustand + Arbeitskopie
const original = ref({ data:{ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'' }, version:'' })
const staged   = reactive({ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'' })
const loading  = ref(false)
const error    = ref('')

// Helpers
const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.data))

async function loadSnapshot() {
  loading.value = true; error.value = ''
  try {
    const res = await fetch(`${API}/paths`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const snap = await res.json() // {data:{...}, version:"..."}
    original.value = {
      data: {
        PathMitarbeiter: snap?.data?.PathMitarbeiter || '',
        PathProduktionen: snap?.data?.PathProduktionen || '',
        PathStammdaten:   snap?.data?.PathStammdaten   || '',
      },
      version: snap?.version || ''
    }
    Object.assign(staged, original.value.data)
  } catch (e) {
    error.value = e.message || 'Pfade laden fehlgeschlagen'
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
  getSnapshotForSave: () => ({
    data: { ...staged },
    version: original.value.version
  }),
  resetToServer: async () => { await loadSnapshot() }
})
</script>