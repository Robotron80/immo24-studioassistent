<template>
  <v-row class="gap-4" no-gutters>
    <!-- LINKS: Kunden -->
    <v-col cols="12" md="4">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-1">Kunden</div>
        <v-btn size="small" @click="openNewCustomer">Neuer Kunde</v-btn>
      </div>

      <v-text-field v-model="search" label="Suchen…" density="compact" class="mb-2" />

      <v-list nav density="comfortable" class="border rounded">
        <template v-for="c in filteredCustomers" :key="c.kunde">
          <v-list-item
            :active="c.kunde === selectedKunde"
            @click="selectCustomer(c.kunde)"
          >
            <v-list-item-title>{{ c.kunde }}</v-list-item-title>
            <v-list-item-subtitle>{{ c.ordner?.length || 0 }} Unterordner</v-list-item-subtitle>
            <template #append>
              <v-btn
                icon="mdi-delete"
                size="small"
                variant="text"
                @click.stop="confirmDeleteCustomer(c.kunde)"
              />
            </template>
          </v-list-item>
          <v-divider />
        </template>
      </v-list>
    </v-col>

    <!-- RECHTS: Ordner -->
    <v-col cols="12" md="7" class="flex-grow-1">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-1">
          Ordner <span v-if="selectedKunde">für <strong>{{ selectedKunde }}</strong></span>
        </div>
        <v-btn size="small" :disabled="!selectedKunde" @click="openNewFolder">Neuer Ordner</v-btn>
      </div>

      <v-table class="border rounded">
        <thead>
          <tr>
            <th class="text-left">Name</th>
            <th class="text-left">Label</th>
            <th class="text-left">Produktionsstufe</th>
            <th class="text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in folders" :key="f.name">
            <td>{{ f.name }}</td>
            <td>{{ f.label }}</td>
            <td><v-icon v-if="f.ist_Produktionsstufe">mdi-check</v-icon></td>
            <td class="text-right">
              <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEditFolder(f)" />
              <v-btn icon="mdi-delete" size="small" variant="text" @click="confirmDeleteFolder(f)" />
            </td>
          </tr>
          <tr v-if="selectedKunde && folders.length === 0">
            <td colspan="4"><em>Noch keine Ordner vorhanden.</em></td>
          </tr>
          <tr v-if="!selectedKunde">
            <td colspan="4"><em>Bitte einen Kunden auswählen.</em></td>
          </tr>
        </tbody>
      </v-table>

      <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
    </v-col>
  </v-row>

  <!-- Dialog: Neuer Kunde -->
  <v-dialog v-model="newCustomerOpen" max-width="460">
    <v-card>
      <v-card-title class="text-h6">Neuer Kunde</v-card-title>
      <v-card-text>
        <v-text-field v-model="newCustomerName" label="Kunde" autofocus />
        <v-alert v-if="dialogError" type="error" class="mt-2">{{ dialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="newCustomerOpen=false">Abbrechen</v-btn>
        <v-btn color="primary" :loading="loading" @click="createCustomer">Anlegen</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Dialog: Ordner anlegen/bearbeiten -->
  <v-dialog v-model="folderDialogOpen" max-width="520">
    <v-card>
      <v-card-title class="text-h6">{{ folderForm.mode === 'edit' ? 'Ordner bearbeiten' : 'Neuer Ordner' }}</v-card-title>
      <v-card-text>
        <v-text-field v-model="folderForm.name"  label="Name" />
        <v-text-field v-model="folderForm.label" label="Label" />
        <v-switch v-model="folderForm.ist_Produktionsstufe" label="Produktionsstufe" />
        <v-alert v-if="dialogError" type="error" class="mt-2">{{ dialogError }}</v-alert>
      </v-card-text>
      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="folderDialogOpen=false">Abbrechen</v-btn>
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

<script setup>
import { ref, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'

// Server-Snapshot (Original) + lokale Arbeitskopie (staged)
const original = ref({ customers: [], version: '' })
const staged   = ref([])           // = customers array (deep copy)
const dirty    = ref(false)

const selectedKunde = ref('')
const search = ref('')

const loading = ref(false)
const error = ref('')
const dialogError = ref('')

// ---- Helpers ----
const deepClone = (x) => JSON.parse(JSON.stringify(x ?? null))

const customers = computed(() => staged.value)
const filteredCustomers = computed(() => {
  const q = (search.value || '').toLowerCase()
  return customers.value.filter(c => (c.kunde || '').toLowerCase().includes(q))
})
const currentCustomer = computed(() =>
  customers.value.find(c => c.kunde === selectedKunde.value)
)
const folders = computed(() => currentCustomer.value?.ordner || [])

// ---- API: Snapshot laden ----
async function loadSnapshot() {
  loading.value = true; error.value = ''
  try {
    const res = await fetch(`${API}/pb/snapshot`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const snap = await res.json()
    original.value = { customers: snap.customers || [], version: snap.version || '' }
    staged.value   = deepClone(original.value.customers)
    // Auswahl behalten, wenn Kunde noch existiert
    if (!staged.value.some(c => c.kunde === selectedKunde.value)) {
      selectedKunde.value = ''
    }
    dirty.value = false
  } catch (e) {
    error.value = e.message || 'Snapshot laden fehlgeschlagen'
  } finally {
    loading.value = false
  }
}
onMounted(loadSnapshot)

// ---- expose für Eltern (Konfiguration.vue) ----
defineExpose({
  isDirty: () => dirty.value,
  getSnapshotForSave: () => ({ customers: staged.value, version: original.value.version }),
  resetToServer: async () => { await loadSnapshot() }
})

// ---- UI: Kunden ----
const newCustomerOpen = ref(false)
const newCustomerName = ref('')

function openNewCustomer(){ newCustomerName.value=''; dialogError.value=''; newCustomerOpen.value = true }

function createCustomer() {
  const name = (newCustomerName.value || '').trim()
  if (!name) { dialogError.value = 'Bitte Kundennamen eingeben.'; return }
  const exists = staged.value.some(c => (c.kunde || '').toLowerCase() === name.toLowerCase())
  if (exists) { dialogError.value = 'Kunde existiert bereits'; return }
  staged.value.push({ kunde: name, ordner: [] })
  dirty.value = true
  newCustomerOpen.value = false
  selectCustomer(name)
}

async function confirmDeleteCustomer(kunde) {
  const ok = await confirm('Kunde löschen', `Soll der Kunde "${kunde}" wirklich gelöscht werden?`)
  if (!ok) return
  const idx = staged.value.findIndex(c => c.kunde === kunde)
  if (idx >= 0) {
    staged.value.splice(idx, 1)
    if (selectedKunde.value === kunde) { selectedKunde.value = '' }
    dirty.value = true
  }
}

function selectCustomer(k) { selectedKunde.value = k }

// ---- UI: Ordner ----
const folderDialogOpen = ref(false)
const folderForm = ref({ mode:'new', originalName:'', name:'', label:'', ist_Produktionsstufe:false })

function openNewFolder(){
  if (!selectedKunde.value) return
  folderForm.value = { mode:'new', originalName:'', name:'', label:'', ist_Produktionsstufe:false }
  dialogError.value=''; folderDialogOpen.value = true
}

function openEditFolder(f){
  folderForm.value = { mode:'edit', originalName:f.name, name:f.name, label:f.label, ist_Produktionsstufe: !!f.ist_Produktionsstufe }
  dialogError.value=''; folderDialogOpen.value = true
}

function saveFolder(){
  const cust = currentCustomer.value
  if (!cust) return
  const name = (folderForm.value.name || '').trim()
  const label = folderForm.value.label || ''
  const flag = !!folderForm.value.ist_Produktionsstufe
  if (!name) { dialogError.value = 'Name darf nicht leer sein.'; return }

  if (folderForm.value.mode === 'new') {
    const exists = (cust.ordner || []).some(o => (o.name || '').toLowerCase() === name.toLowerCase())
    if (exists) { dialogError.value = 'Ordnername existiert bereits'; return }
    cust.ordner = cust.ordner || []
    cust.ordner.push({ name, label, ist_Produktionsstufe: flag })
  } else {
    const old = (folderForm.value.originalName || '').toLowerCase()
    const idx = (cust.ordner || []).findIndex(o => (o.name || '').toLowerCase() === old)
    if (idx < 0) { dialogError.value='Ordner nicht gefunden.'; return }
    const isRename = name.toLowerCase() !== old
    if (isRename) {
      const conflict = cust.ordner.some((o,i) =>
        i !== idx && (o.name || '').toLowerCase() === name.toLowerCase()
      )
      if (conflict) { dialogError.value = 'Ordnername existiert bereits'; return }
    }
    cust.ordner[idx] = { name, label, ist_Produktionsstufe: flag }
  }
  dirty.value = true
  folderDialogOpen.value = false
}

async function confirmDeleteFolder(f){
  const ok = await confirm('Ordner löschen', `Soll der Ordner "${f.name}" wirklich gelöscht werden?`)
  if (!ok) return
  const cust = currentCustomer.value
  if (!cust) return
  const before = cust.ordner?.length || 0
  cust.ordner = (cust.ordner || []).filter(o => (o.name || '').toLowerCase() !== (f.name || '').toLowerCase())
  if (cust.ordner.length !== before) { dirty.value = true }
}

// ---- Confirm helper ----
const confirmOpen = ref(false)
const confirmTitle = ref(''); const confirmText = ref('')
let confirmCb = null
function confirm(title, text){ confirmTitle.value=title; confirmText.value=text; confirmOpen.value=true; return new Promise(res => confirmCb = res) }
function confirmResolve(val){ confirmOpen.value=false; confirmCb?.(val) }
</script>