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
              <v-btn icon="mdi-delete" size="small" variant="text"
                     @click.stop="confirmDeleteCustomer(c.kunde)" />
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
    </v-col>
  </v-row>

  <!-- Dialog: Neuer Kunde -->
  <v-dialog v-model="newCustomerOpen" max-width="460">
    <v-card>
      <v-card-title class="text-h6">Neuer Kunde</v-card-title>
      <v-card-text>
        <v-text-field v-model="newCustomerName" label="Kunde" autofocus />
        <v-alert v-if="error" type="error" class="mt-2">{{ error }}</v-alert>
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
        <v-alert v-if="error" type="error" class="mt-2">{{ error }}</v-alert>
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

const customers = ref([])           // [{ kunde, ordner:[...] }]
const selectedKunde = ref('')
const folders = ref([])
const search = ref('')
const loading = ref(false)
const error = ref('')

// Dialoge
const newCustomerOpen = ref(false)
const newCustomerName = ref('')
const folderDialogOpen = ref(false)
const folderForm = ref({ mode:'new', originalName:'', name:'', label:'', ist_Produktionsstufe:false })

// Confirm helper
const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmText = ref('')
let confirmCb = null
function confirm(title, text){ confirmTitle.value=title; confirmText.value=text; confirmOpen.value=true; return new Promise(res=> confirmCb=res) }
function confirmResolve(val){ confirmOpen.value=false; confirmCb?.(val) }

// Filter
const filteredCustomers = computed(() => {
  const q = (search.value||'').toLowerCase()
  return customers.value.filter(c => c.kunde.toLowerCase().includes(q))
})

// Loader
async function loadCustomers() {
  loading.value = true; error.value=''
  try {
    const res = await fetch(`${API}/pb/customers`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    customers.value = await res.json()
    if (!customers.value.some(c => c.kunde === selectedKunde.value)) {
      selectedKunde.value = ''; folders.value = []
    }
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function loadFolders(kunde) {
  loading.value = true; error.value=''
  try {
    const res = await fetch(`${API}/pb/customers/${encodeURIComponent(kunde)}/folders`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    folders.value = await res.json()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

// UI
function openNewCustomer(){ newCustomerName.value=''; error.value=''; newCustomerOpen.value=true }
async function createCustomer() {
  if (!newCustomerName.value.trim()) { error.value='Bitte Kundennamen eingeben.'; return }
  loading.value = true; error.value=''
  try {
    const res = await fetch(`${API}/pb/customers`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ kunde: newCustomerName.value.trim() })
    })
    if (res.status === 409) throw new Error('Kunde existiert bereits')
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    newCustomerOpen.value = false
    await loadCustomers()
    selectCustomer(newCustomerName.value.trim())
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function confirmDeleteCustomer(kunde) {
  const ok = await confirm('Kunde löschen', `Soll der Kunde "${kunde}" wirklich gelöscht werden?`)
  if (!ok) return
  loading.value = true; error.value=''
  try {
    const res = await fetch(`${API}/pb/customers/${encodeURIComponent(kunde)}`, { method:'DELETE' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    if (kunde === selectedKunde.value) { selectedKunde.value=''; folders.value=[] }
    await loadCustomers()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function selectCustomer(kunde) {
  selectedKunde.value = kunde
  await loadFolders(kunde)
}

function openNewFolder(){
  folderForm.value = { mode:'new', originalName:'', name:'', label:'', ist_Produktionsstufe:false }
  error.value=''; folderDialogOpen.value = true
}
function openEditFolder(f){
  folderForm.value = { mode:'edit', originalName:f.name, name:f.name, label:f.label, ist_Produktionsstufe: !!f.ist_Produktionsstufe }
  error.value=''; folderDialogOpen.value = true
}

async function saveFolder(){
  if (!selectedKunde.value) return
  const body = { name: folderForm.value.name.trim(), label: folderForm.value.label || '', ist_Produktionsstufe: !!folderForm.value.ist_Produktionsstufe }
  if (!body.name) { error.value='Name darf nicht leer sein.'; return }
  loading.value = true; error.value=''
  try {
    let res
    if (folderForm.value.mode === 'new') {
      res = await fetch(`${API}/pb/customers/${encodeURIComponent(selectedKunde.value)}/folders`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      })
      if (res.status === 409) throw new Error('Ordnername existiert bereits')
    } else {
      const old = encodeURIComponent(folderForm.value.originalName)
      res = await fetch(`${API}/pb/customers/${encodeURIComponent(selectedKunde.value)}/folders/${old}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      })
      if (res.status === 409) throw new Error('Ordnername existiert bereits')
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    folderDialogOpen.value = false
    await loadFolders(selectedKunde.value)
    await loadCustomers()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function confirmDeleteFolder(f){
  const ok = await confirm('Ordner löschen', `Soll der Ordner "${f.name}" wirklich gelöscht werden?`)
  if (!ok) return
  loading.value = true; error.value=''
  try {
    const url = `${API}/pb/customers/${encodeURIComponent(selectedKunde.value)}/folders/${encodeURIComponent(f.name)}`
    const res = await fetch(url, { method:'DELETE' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    await loadFolders(selectedKunde.value)
    await loadCustomers()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

onMounted(loadCustomers)
</script>