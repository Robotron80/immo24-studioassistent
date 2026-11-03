<template>
  <v-card flat>
    <v-card-text>
      <div class="d-flex flex-column ga-4">
        <div class="d-flex align-center ga-2 w-100">
          <v-text-field
            v-model="staged.PathMitarbeiter"
            label="Pfad Mitarbeiter"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathMitarbeiter', 'Pfad Mitarbeiter auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="d-flex align-center ga-2 w-100">
          <v-text-field
            v-model="staged.PathProduktionen"
            label="Pfad Produktionen"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathProduktionen', 'Pfad Produktionen auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="d-flex align-center ga-2 w-100">
          <v-text-field
            v-model="staged.PathStammdaten"
            label="Pfad Stammdaten"
            class="flex-grow-1"
          />
          <v-btn
            @click="browseInto('PathStammdaten', 'Pfad Stammdaten auswählen')"
            variant="outlined"
          >
            Durchsuchen
          </v-btn>
        </div>
        <div class="d-flex align-center ga-2 w-100">
          <v-text-field
            v-model="staged.PathPTUser"
            label="Pfad Pro Tools User"
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

<script setup lang="ts">
/**
 * Konfiguration, Bereich Pfade: die vier Ordner, mit denen das Programm arbeitet.
 */
import { ref, reactive, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

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

// Das nutzt Konfiguration.vue beim Speichern und Abbrechen
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
