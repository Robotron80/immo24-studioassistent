<template>
  <v-card flat>
    <v-card-text>
      <div class="d-flex flex-column ga-4">
        <div v-for="field in FIELDS" :key="field.key" class="d-flex align-center ga-2 w-100">
          <v-text-field v-model="staged[field.key]" :label="field.label" class="flex-grow-1" hide-details />
          <v-btn variant="outlined" @click="browseInto(field.key, `${field.label} auswählen`)">
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

<script setup lang="ts">
/**
 * Die vier Ordner, mit denen das Programm arbeitet.
 * Wird in der Konfiguration und im Einrichtungsassistenten benutzt.
 */
import { ref, reactive, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

const FIELDS = [
  { key: 'PathMitarbeiter', label: 'Pfad Mitarbeiter' },
  { key: 'PathProduktionen', label: 'Pfad Produktionen' },
  { key: 'PathStammdaten', label: 'Pfad Stammdaten' },
  { key: 'PathPTUser', label: 'Pfad Pro Tools User' },
]

// Stand vom Speicher und Arbeitskopie: Der Unterschied zeigt, ob etwas geändert wurde
const original = ref({ data:{ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'', PathPTUser:'' }, version:'' })
const staged   = reactive({ PathMitarbeiter:'', PathProduktionen:'', PathStammdaten:'', PathPTUser:'' })
const error    = ref('')

const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.data))
const isPfadeValid = computed(() => {
  return staged.PathMitarbeiter.length > 0 &&
         staged.PathProduktionen.length > 0 &&
         staged.PathStammdaten.length > 0 &&
         staged.PathPTUser.length > 0;
});

async function loadSnapshot() {
  error.value = ''
  try {
    const snap: any = await backend.getPaths()
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

// Das nutzen Konfiguration und Assistent beim Speichern und Abbrechen
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
