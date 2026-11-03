<template>
  <div class="w-100 pb-8">
    <div class="d-flex align-center justify-end mb-2">
      <v-btn size="small" @click="openNewDialog">Neuer Mitarbeiter</v-btn>
    </div>

    <v-text-field v-model="search" label="Suchen…" density="compact" class="mb-2" />

    <v-table class="border rounded">
      <thead>
        <tr>
          <th>Name</th>
          <th>Kürzel</th>
          <th class="action-col"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in filteredMitarbeiter" :key="m.kuerzel">
          <td>{{ m.name }}</td>
          <td>{{ m.kuerzel }}</td>
          <td>
            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              @click="openEditDialog(m)"
              :aria-label="`Kürzel von ${m.name} bearbeiten`"
            />
          </td>
        </tr>
        <tr v-if="filteredMitarbeiter.length === 0">
          <td colspan="3"><em>Keine Mitarbeiter gefunden.</em></td>
        </tr>
      </tbody>
    </v-table>
    <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
  </div>

  <!-- Dialog: Neuer Mitarbeiter -->
  <v-dialog v-model="newDialogOpen" max-width="420">
    <v-card>
      <v-card-title class="text-h6">Neuer Mitarbeiter</v-card-title>
      <v-card-text>
        <v-text-field v-model="newName" label="Name" autofocus />
        <v-text-field v-model="newKuerzel" label="Kürzel" maxlength="8" />
        <v-alert v-if="dialogError" type="error" class="mt-2">{{ dialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="newDialogOpen=false">Abbrechen</v-btn>
        <v-btn color="primary" @click="createMitarbeiter">Anlegen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Dialog: Kürzel bearbeiten -->
  <v-dialog v-model="editDialogOpen" max-width="420">
    <v-card>
      <v-card-title class="text-h6">Kürzel bearbeiten</v-card-title>
      <v-card-text>
        <div class="mb-2">Mitarbeiter: <strong>{{ editName }}</strong></div>
        <v-text-field v-model="editKuerzel" label="Neues Kürzel" maxlength="8" />
        <v-alert v-if="editDialogError" type="error" class="mt-2">{{ editDialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="editDialogOpen=false">Abbrechen</v-btn>
        <v-btn color="primary" @click="saveEditKuerzel">Speichern</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * Konfiguration, Bereich Mitarbeiter: Mitarbeiter anlegen und Kürzel ändern.
 * Löschen geht hier bewusst nicht, ein Mitarbeiter ist ein Ordner auf dem Speicher.
 */
import { ref, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

// Die Arbeitskopie: Gespeichert wird erst, wenn in der Konfiguration "Speichern" gedrückt wird
const staged = ref<any[]>([])
const dirty = ref(false)

const error = ref('')
const dialogError = ref('')

const search = ref('')

const filteredMitarbeiter = computed(() => {
  const q = (search.value || '').toLowerCase()
  return staged.value.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.kuerzel.toLowerCase().includes(q)
  )
})

/** Lädt die Mitarbeiter vom Speicher und verwirft die Arbeitskopie. */
async function loadSnapshot() {
  error.value = ''
  try {
    staged.value = await backend.listUsers()
    dirty.value = false
  } catch (e) {
    error.value = e.message || 'Mitarbeiter konnten nicht geladen werden.'
  }
}
onMounted(loadSnapshot)

// Das nutzt Konfiguration.vue beim Speichern und Abbrechen
defineExpose({
  isDirty: () => dirty.value,
  getSnapshotForSave: () => ({ mitarbeiter: staged.value }),
  resetToServer: async () => { await loadSnapshot() }
})

// Dialog: Neuer Mitarbeiter
const newDialogOpen = ref(false)
const newName = ref('')
const newKuerzel = ref('')

function openNewDialog() {
  newName.value = ''
  newKuerzel.value = ''
  dialogError.value = ''
  newDialogOpen.value = true
}

function createMitarbeiter() {
  const name = (newName.value || '').trim()
  const kuerzel = (newKuerzel.value || '').trim()
  if (!name) { dialogError.value = 'Bitte Namen eingeben.'; return }
  if (!kuerzel) { dialogError.value = 'Bitte Kürzel eingeben.'; return }
  const existsName = staged.value.some(m => (m.name || '').toLowerCase() === name.toLowerCase())
  if (existsName) { dialogError.value = 'Mitarbeiter existiert bereits.'; return }
  const existsKuerzel = staged.value.some(m => (m.kuerzel || '').toLowerCase() === kuerzel.toLowerCase())
  if (existsKuerzel) { dialogError.value = 'Kürzel existiert bereits.'; return }
  staged.value.push({ name, kuerzel })
  dirty.value = true
  newDialogOpen.value = false
}

// Dialog: Kürzel bearbeiten
const editDialogOpen = ref(false)
const editName = ref('')
const editKuerzel = ref('')
const editDialogError = ref('')
let editIndex = -1

function openEditDialog(m) {
  editName.value = m.name
  editKuerzel.value = m.kuerzel
  editDialogError.value = ''
  editIndex = staged.value.findIndex(x => x.name === m.name)
  editDialogOpen.value = true
}

function saveEditKuerzel() {
  const kuerzel = (editKuerzel.value || '').trim()
  if (!kuerzel) {
    editDialogError.value = 'Bitte Kürzel eingeben.'
    return
  }
  // Dasselbe Kürzel darf kein anderer Mitarbeiter haben
  const existsKuerzel = staged.value.some((m, idx) =>
    idx !== editIndex && (m.kuerzel || '').toLowerCase() === kuerzel.toLowerCase()
  )
  if (existsKuerzel) {
    editDialogError.value = 'Kürzel existiert bereits.'
    return
  }
  if (editIndex >= 0) {
    staged.value[editIndex].kuerzel = kuerzel
    dirty.value = true
    editDialogOpen.value = false
  }
}
</script>
