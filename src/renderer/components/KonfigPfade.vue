<template>
  <v-card flat>
    <v-card-text>
      <div class="d-flex flex-column ga-4">
        <div v-for="field in FIELDS" :key="field.key" class="d-flex align-center ga-2 w-100">
          <v-text-field v-model="staged[field.key]" :label="field.label" class="flex-grow-1" hide-details />
          <v-btn variant="outlined" @click="browseInto(field.key, `${field.label} auswählen`)"> Durchsuchen </v-btn>
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
 * Die Ordner, mit denen das Programm arbeitet. Nur die Standardvorlagen sind optional.
 * Wird in der Konfiguration und im Einrichtungsassistenten benutzt.
 */
import { computed } from 'vue'

import { useKonfigBereich } from '@/composables/useKonfigBereich'
import { backend } from '@/lib/backend'

// optional: Das Feld darf leer bleiben
const FIELDS = [
  { key: 'PathMitarbeiter', label: 'Pfad Mitarbeiter' },
  { key: 'PathProduktionen', label: 'Pfad Produktionen' },
  { key: 'PathStammdaten', label: 'Pfad Stammdaten' },
  { key: 'PathPTUser', label: 'Pfad Pro Tools User' },
  { key: 'PathStandardvorlagen', label: 'Pfad Standardvorlagen (optional)', optional: true },
]

const emptyPaths = () => ({
  PathMitarbeiter: '',
  PathProduktionen: '',
  PathStammdaten: '',
  PathPTUser: '',
  PathStandardvorlagen: '',
})

const { original, staged, error, exposed } = useKonfigBereich({
  empty: emptyPaths,
  errorText: 'Pfade laden fehlgeschlagen',
  load: async () => {
    const snap = await backend.getPaths()
    const data = emptyPaths()
    for (const key of Object.keys(data)) data[key] = String(snap.data[key] ?? '')
    return { data, version: snap.version }
  },
})

const isPfadeValid = computed(() => FIELDS.every((field) => field.optional || staged.value[field.key].length > 0))

/** Öffnet die Ordnerauswahl des Systems und übernimmt den gewählten Ordner. */
async function browseInto(key, title) {
  const picked = await window.electronAPI.pickFolder(title, staged.value[key] || undefined)
  if (typeof picked === 'string' && picked.length > 0) {
    staged.value[key] = picked.replace(/\\/g, '/') // Windows: einheitlich mit Schrägstrich
  }
}

// Das nutzen Konfiguration und Assistent beim Speichern und Abbrechen
defineExpose({
  ...exposed,
  isPfadeValid: () => isPfadeValid.value,
  getSnapshotForSave: () => ({ data: { ...staged.value }, version: original.value.version }),
})
</script>
