<template>
  <v-container fluid class="page-bg py-6">
    <!-- Card 1: Auswahl neu / vorhanden (volle Breite) -->
    <v-card class="mb-6 card" elevation="2">
      <v-card-text class="py-4">
        <div class="text-subtitle-1 font-weight-medium mb-2">Produktionsbuch</div>
        <v-radio-group v-model="form.vorhanden" inline>
          <v-radio label="neues Projekt" value="neu" />
          <v-radio label="vorhandenes Projekt" value="vorhanden" />
        </v-radio-group>
      </v-card-text>
    </v-card>

    <!-- Card 2 + Card 3 in einer Zeile, mit Abstand dazwischen -->
    <v-row class="g-6" align="stretch">
      <!-- Card 2: Formular (links) -->
      <v-col cols="12" md="6">
        <v-card class="card h-100" elevation="2">
          <v-card-text>
            <!-- ==== Dein Formular-Inhalt ==== -->
            <v-row dense>
              <v-col cols="12">
                <v-autocomplete
                  v-model="form.kunde"
                  :items="kunden"
                  item-title="label" item-value="value"
                  label="Kunde"
                  prepend-inner-icon="mdi-office-building-outline"
                  variant="outlined" density="comfortable"
                  :loading="loading.kunden"
                  @update:modelValue="onKundeChange"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="form.datum"
                  label="Datum" type="date"
                  :disabled="isVorhanden"
                  prepend-inner-icon="mdi-calendar"
                  variant="outlined" density="comfortable"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="form.moid"
                  label="Mo-ID" 
                  :disabled ="isVorhanden"
                  maxlength="4"
                  prepend-inner-icon="mdi-identifier"
                  variant="outlined" density="comfortable"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="form.projektname"
                  label="Projektname" :disabled="isVorhanden"
                  prepend-inner-icon="mdi-file-document-edit-outline"
                  variant="outlined" density="comfortable"
                  clearable
                />
              </v-col>

              <v-col cols="12">
                <v-autocomplete
                  v-model="form.stufe"
                  :items="stufen"
                  item-title="label" item-value="value"
                  label="Produktionsstufe"
                  prepend-inner-icon="mdi-map-marker-outline"
                  variant="outlined" density="comfortable"
                  :disabled="!form.kunde"
                  :loading="loading.stufen"
                />
              </v-col>

              <v-col cols="12">
                <v-autocomplete
                  v-model="form.template"
                  :items="templates"
                  item-title="label" item-value="value"
                  label="Template"
                  prepend-inner-icon="mdi-file-outline"
                  variant="outlined" density="comfortable"
                  :disabled="!form.kunde"
                  :loading="loading.templates"

                
                />
              </v-col>

              <v-col cols="12" class="d-flex ga-3 mt-2">
                <v-btn color="primary" :loading="loading.create" @click="onCreateClick">
                  Projekt anlegen
                </v-btn>
                <v-btn color="error" variant="elevated" @click="resetForm">
                  Zurücksetzen
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Card 3: Tabelle (rechts) -->
      <v-col cols="12" md="6" v-if="isVorhanden">
        <v-card class="card h-100" elevation="2">
          <v-card-text>
            <div class="d-flex align-center justify-space-between mb-3">
              <v-text-field
                v-model="search"
                placeholder="Search"
                prepend-inner-icon="mdi-magnify"
                variant="outlined" density="comfortable" style="max-width: 320px;"
              />
              <v-btn icon="mdi-refresh" @click="refreshRows" :loading="loading.rows" variant="text" aria-label="Tabelle aktualisieren" />
            </div>
            <v-data-table
              :items="filteredRows"
              :headers="headers"
              :loading="loading.rows"
              density="comfortable"
              hide-default-footer
              class="rounded-lg"
              item-key="moid"
            >
              <template #item="{ item }">
                <tr
                  class="v-data-table__tr v-data-table__tr--hover"
                  :class="{ 'selected-row': selectedRow === item.moid }"
                  @click="onRowClick(item)"
                  style="cursor:pointer"
                >
                  <td>{{ item.date }}</td>
                  <td>{{ item.projektname }}</td>
                  <td>{{ item.moid }}</td>
                  <td>{{ item.user }}</td>
                </tr>
              </template>
              <template #no-data>
                <div class="text-body-2 text-medium-emphasis py-8">No data available</div>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">
      {{ snack.text }}
    </v-snackbar>

    <v-dialog v-model="openDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Projekt öffnen?</v-card-title>
        <v-card-text>
          <div>Möchtest du das neue Projekt jetzt öffnen?</div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="openDialog = false">Schließen</v-btn>
          <v-btn color="primary" @click="launchProject">Öffnen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>


<script setup>
import { computed, ref, onMounted, reactive } from 'vue'
import { useProjektanlage } from '@/stores/Projektanlage'

const store = useProjektanlage()

// Bindings
const form = computed(() => store.form)
const kunden = computed(() => store.kunden)
const templates = computed(() => store.templates)
const stufen = computed(() => store.stufen)
const rows = computed(() => store.rows)
const loading = computed(() => store.loading)
const isVorhanden = computed(() => form.value.vorhanden === 'vorhanden')

// Tabelle / Suche
const headers = [
  { title: 'Datum', key: 'date' },
  { title: 'Projektname', key: 'projektname' },
  { title: 'Mo-ID', key: 'moid' },
  { title: 'Mitarbeiter*in', key: 'user' },
]
const search = ref('')
const filteredRows = computed(() => {
  const q = search.value?.toLowerCase() || ''
  if (!q) return rows.value
  return rows.value.filter(r =>
    String(r.date).toLowerCase().includes(q) ||
    String(r.projektname).toLowerCase().includes(q) ||
    String(r.moid).toLowerCase().includes(q) ||
    String(r.user).toLowerCase().includes(q)
  )
})

// Snackbar (lokal, simpel)
const snack = reactive({ show:false, text:'', color:'primary' })
function toast(msg, color='primary'){ Object.assign(snack, {show:true, text:msg, color}) }

// Events
function onKundeChange(k){ store.selectKunde(k) }
async function onCreateClick(){
    try {
      const res = await store.createOrResolve()
      toast('Fertig.', 'success')
      // Prüfe, ob ein neues Projekt angelegt wurde und Daten zum Öffnen vorhanden sind
      if (res?.templateDest && res?.filename) {
        lastCreatedProject.value = { fullPath: `${res.templateDest}/${res.filename}` }
        openDialog.value = true
      }
    } catch(e) {
      toast(e.message || String(e), 'error')
    }
}
async function launchProject() {
    openDialog.value = false
    try {
      await fetch(`${API}/projektanlage/launchpt`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fullPath: lastCreatedProject.value.fullPath })
      })
    } catch(e) {
      toast('Projekt konnte nicht geöffnet werden.', 'error')
    }
  }



function resetForm(){ store.resetForm() }
const selectedRow = ref(null)

function onRowClick(row) {
  selectedRow.value = row.moid // oder ein anderes eindeutiges Feld
  form.value.datum = row.date
  form.value.projektname = row.projektname
  form.value.moid = row.moid
  // ggf. weitere Felder ergänzen
}
function refreshRows() {
  store.selectKunde(form.value.kunde)
}

// Init
onMounted(() => store.init())

const openDialog = ref(false)
const lastCreatedProject = ref(null)
</script>

<style scoped>
.v-data-table__tr--hover:hover {
  background: #e3f2fd !important;
  transition: background 0.15s;
}

.selected-row {
  background: #bbdefb !important;
}
</style>