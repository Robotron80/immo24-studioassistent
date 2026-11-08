<template>
  <div>
    <!-- Kunden-Bereich -->
    <div class="mb-6">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-1">Kunden</div>
        <v-btn size="small" @click="openNewCustomer">Neuer Kunde</v-btn>
      </div>
      <v-text-field v-model="search" label="Suchen…" density="compact" class="mb-2" />
      <v-list nav density="comfortable" class="border rounded">
        <template v-for="c in filteredCustomers" :key="c.kunde">
          <v-list-item :active="c.kunde === selectedKunde" @click="selectCustomer(c.kunde)">
            <v-list-item-title>{{ c.kunde }}</v-list-item-title>
            <v-list-item-subtitle>{{ c.ordner?.length || 0 }} Unterordner</v-list-item-subtitle>
            <template #append>
              <v-btn icon="mdi-delete" size="small" variant="text" @click.stop="confirmDeleteCustomer(c.kunde)" />
            </template>
          </v-list-item>
          <v-divider />
        </template>
      </v-list>
    </div>

    <!-- Ordner-Bereich -->
    <div>
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-1">
          Ordner
          <span v-if="selectedKunde"
            >für <strong>{{ selectedKunde }}</strong></span
          >
        </div>
        <v-btn size="small" :disabled="!selectedKunde" @click="openNewFolder">Neuer Ordner</v-btn>
      </div>
      <v-table class="border rounded">
        <thead>
          <tr>
            <th class="text-left">Name</th>
            <th class="text-left">Label</th>
            <th class="text-left">Produktionsstufe</th>
            <th class="text-left">EventPipe-Ziel</th>
            <th class="text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in folders" :key="f.name">
            <td>{{ f.name }}</td>
            <td>{{ f.label }}</td>
            <td><v-icon v-if="f.ist_Produktionsstufe">mdi-check</v-icon></td>
            <td><v-icon v-if="f.ist_EventpipeZiel">mdi-check</v-icon></td>
            <td class="text-right">
              <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEditFolder(f)" />
              <v-btn icon="mdi-delete" size="small" variant="text" @click="confirmDeleteFolder(f)" />
            </td>
          </tr>
          <tr v-if="selectedKunde && folders.length === 0">
            <td colspan="5"><em>Noch keine Ordner vorhanden.</em></td>
          </tr>
          <tr v-if="!selectedKunde">
            <td colspan="5"><em>Bitte einen Kunden auswählen.</em></td>
          </tr>
        </tbody>
      </v-table>
      <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
    </div>
  </div>

  <!-- Dialog: Neuer Kunde -->
  <v-dialog v-model="newCustomerOpen" max-width="460">
    <v-card>
      <v-card-title class="text-h6">Neuer Kunde</v-card-title>
      <v-card-text>
        <v-text-field v-model="newCustomerName" label="Kunde" autofocus />
        <v-alert v-if="dialogError" type="error" class="mt-2">{{ dialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="newCustomerOpen = false">Abbrechen</v-btn>
        <v-btn color="primary" :loading="loading" @click="createCustomer">Anlegen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Dialog: Ordner anlegen/bearbeiten -->
  <v-dialog v-model="folderDialogOpen" max-width="520">
    <v-card>
      <v-card-title class="text-h6">{{
        folderForm.mode === 'edit' ? 'Ordner bearbeiten' : 'Neuer Ordner'
      }}</v-card-title>
      <v-card-text>
        <v-text-field v-model="folderForm.name" label="Name" />
        <v-text-field v-model="folderForm.label" label="Label" />
        <v-checkbox v-model="folderForm.ist_Produktionsstufe" label="Produktionsstufe" density="compact" hide-details />
        <v-checkbox v-model="folderForm.ist_EventpipeZiel" label="EventPipe-Ziel" density="compact" hide-details />
        <v-alert v-if="dialogError" type="error" class="mt-2">{{ dialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="folderDialogOpen = false">Abbrechen</v-btn>
        <v-btn color="primary" :loading="loading" @click="saveFolder">
          {{ folderForm.mode === 'edit' ? 'Speichern' : 'Anlegen' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Bestätigungen -->
  <v-dialog v-model="confirmOpen" max-width="420">
    <v-card>
      <v-card-title class="text-h6">{{ confirmTitle }}</v-card-title>
      <v-card-text>{{ confirmText }}</v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="confirmResolve(false)">Abbrechen</v-btn>
        <v-btn color="error" @click="confirmResolve(true)">Löschen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/**
 * Konfiguration, Bereich Kunden: die Kunden und die Unterordner ihrer Projekte.
 * Für neue Kunden entsteht beim Speichern der Ordner unter Produktionen.
 */
import { ref, computed, watch } from 'vue'

import { useKonfigBereich } from '@/composables/useKonfigBereich'
import { backend, type Result } from '@/lib/backend'

// Gespeichert wird erst in der Konfiguration
const { original, staged, loading, error, exposed } = useKonfigBereich({
  empty: (): Result<'getSnapshot'>['customers'] => [],
  errorText: 'Kunden konnten nicht geladen werden.',
  load: async () => {
    const snap = await backend.getSnapshot()
    return { data: snap.customers || [], version: snap.version }
  },
})

const selectedKunde = ref('')
const search = ref('')

const dialogError = ref('')

const filteredCustomers = computed(() => {
  const q = (search.value || '').toLowerCase()
  return staged.value.filter((c) => (c.kunde || '').toLowerCase().includes(q))
})
const currentCustomer = computed(() => staged.value.find((c) => c.kunde === selectedKunde.value))
const folders = computed(() => currentCustomer.value?.ordner || [])

// Nach dem Laden: Auswahl nur behalten, wenn es den Kunden noch gibt
watch(original, () => {
  if (!staged.value.some((c) => c.kunde === selectedKunde.value)) selectedKunde.value = ''
})

// Das nutzt Konfiguration.vue beim Speichern und Abbrechen
defineExpose({
  ...exposed,
  getSnapshotForSave: () => ({ customers: staged.value, version: original.value.version }),
})

// Dialog: Neuer Kunde
const newCustomerOpen = ref(false)
const newCustomerName = ref('')

function openNewCustomer() {
  newCustomerName.value = ''
  dialogError.value = ''
  newCustomerOpen.value = true
}

function createCustomer() {
  const name = (newCustomerName.value || '').trim()
  if (!name) {
    dialogError.value = 'Bitte Kundennamen eingeben.'
    return
  }
  const exists = staged.value.some((c) => (c.kunde || '').toLowerCase() === name.toLowerCase())
  if (exists) {
    dialogError.value = 'Kunde existiert bereits'
    return
  }
  staged.value.push({ kunde: name, ordner: [] })
  newCustomerOpen.value = false
  selectCustomer(name)
}

async function confirmDeleteCustomer(kunde) {
  const ok = await confirm('Kunde löschen', `Soll der Kunde "${kunde}" wirklich gelöscht werden?`)
  if (!ok) return
  const idx = staged.value.findIndex((c) => c.kunde === kunde)
  if (idx >= 0) {
    staged.value.splice(idx, 1)
    if (selectedKunde.value === kunde) {
      selectedKunde.value = ''
    }
  }
}

function selectCustomer(k) {
  selectedKunde.value = k
}

// Dialog: Ordner anlegen oder bearbeiten
const folderDialogOpen = ref(false)
const folderForm = ref({
  mode: 'new',
  originalName: '',
  name: '',
  label: '',
  ist_Produktionsstufe: false,
  ist_EventpipeZiel: false,
})

function openNewFolder() {
  if (!selectedKunde.value) return
  folderForm.value = {
    mode: 'new',
    originalName: '',
    name: '',
    label: '',
    ist_Produktionsstufe: false,
    ist_EventpipeZiel: false,
  }
  dialogError.value = ''
  folderDialogOpen.value = true
}

function openEditFolder(f) {
  folderForm.value = {
    mode: 'edit',
    originalName: f.name,
    name: f.name,
    label: f.label,
    ist_Produktionsstufe: !!f.ist_Produktionsstufe,
    ist_EventpipeZiel: !!f.ist_EventpipeZiel,
  }
  dialogError.value = ''
  folderDialogOpen.value = true
}

function saveFolder() {
  const cust = currentCustomer.value
  if (!cust) return
  cust.ordner ??= []
  const ordner = cust.ordner
  const name = (folderForm.value.name || '').trim()
  const label = folderForm.value.label || ''
  const flag = !!folderForm.value.ist_Produktionsstufe
  const eventpipe = !!folderForm.value.ist_EventpipeZiel
  if (!name) {
    dialogError.value = 'Name darf nicht leer sein.'
    return
  }

  if (folderForm.value.mode === 'new') {
    const exists = ordner.some((o) => (o.name || '').toLowerCase() === name.toLowerCase())
    if (exists) {
      dialogError.value = 'Ordnername existiert bereits'
      return
    }
    cust.ordner = cust.ordner || []
    ordner.push({ name, label, ist_Produktionsstufe: flag, ist_EventpipeZiel: eventpipe })
  } else {
    const old = (folderForm.value.originalName || '').toLowerCase()
    const idx = ordner.findIndex((o) => (o.name || '').toLowerCase() === old)
    if (idx < 0) {
      dialogError.value = 'Ordner nicht gefunden.'
      return
    }
    const isRename = name.toLowerCase() !== old
    if (isRename) {
      const conflict = ordner.some((o, i) => i !== idx && (o.name || '').toLowerCase() === name.toLowerCase())
      if (conflict) {
        dialogError.value = 'Ordnername existiert bereits'
        return
      }
    }
    ordner[idx] = { name, label, ist_Produktionsstufe: flag, ist_EventpipeZiel: eventpipe }
  }
  // Der Export hat genau einen Ort: Ein neu markierter Ordner löst den bisherigen ab
  if (eventpipe) {
    for (const entry of ordner) {
      if ((entry.name || '').toLowerCase() !== name.toLowerCase()) entry.ist_EventpipeZiel = false
    }
  }
  folderDialogOpen.value = false
}

async function confirmDeleteFolder(f) {
  const ok = await confirm('Ordner löschen', `Soll der Ordner "${f.name}" wirklich gelöscht werden?`)
  if (!ok) return
  const cust = currentCustomer.value
  if (!cust) return
  cust.ordner = (cust.ordner || []).filter((o) => (o.name || '').toLowerCase() !== (f.name || '').toLowerCase())
}

// Sicherheitsabfrage vor dem Löschen, wartet auf die Antwort
const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmText = ref('')
let confirmCb: ((ok: boolean) => void) | null = null
function confirm(title, text) {
  confirmTitle.value = title
  confirmText.value = text
  confirmOpen.value = true
  return new Promise<boolean>((res) => (confirmCb = res))
}
function confirmResolve(val) {
  confirmOpen.value = false
  confirmCb?.(val)
}
</script>
