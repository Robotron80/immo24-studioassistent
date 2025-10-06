<template>
  <v-card flat>
    <v-card-text>
      <div class="pfade-fields">
        <div class="pfade-row">
          <v-text-field
            v-model="staged.PathMitarbeiter"
            label="Pfad Mitarbeiter"
            density="comfortable"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathMitarbeiter', 'Pfad Mitarbeiter auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="pfade-row">
          <v-text-field
            v-model="staged.PathProduktionen"
            label="Pfad Produktionen"
            density="comfortable"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathProduktionen', 'Pfad Produktionen auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="pfade-row">
          <v-text-field
            v-model="staged.PathStammdaten"
            label="Pfad Stammdaten"
            density="comfortable"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathStammdaten', 'Pfad Stammdaten auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="pfade-row">
          <v-text-field
            v-model="staged.PathPTUser"
            label="Pfad Pro Tools User"
            density="comfortable"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathPTUser', 'Pfad Pro Tools User auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
      </div>
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
const original = ref({ data:{ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'', PathPTUser:'' }, version:'' })
const staged   = reactive({ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'', PathPTUser:'' })
const loading  = ref(false)
const error    = ref('')

// Helpers
const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.data))
const isPfadeValid = computed(() => {
  return staged.PathMitarbeiter.length > 0 &&
         staged.PathProduktionen.length > 0 &&
         staged.PathStammdaten.length > 0 &&
         staged.PathPTUser.length > 0;
});

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
        PathPTUser:       snap?.data?.PathPTUser       || '',
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
  isPfadeValid: () => isPfadeValid.value,
  getSnapshotForSave: () => ({
    data: { ...staged },
    version: original.value.version
  }),
  resetToServer: async () => { await loadSnapshot() }
})
</script>

<style scoped>
.pfade-fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.pfade-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.flex-grow-1 {
  flex-grow: 1;
}
</style>