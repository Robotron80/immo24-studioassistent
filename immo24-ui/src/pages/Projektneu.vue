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
                  label="Mo-ID" :disabled="isVorhanden"
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
      <v-col cols="12" md="6">
        <v-card class="card h-100" elevation="2">
          <v-card-text>
            <v-text-field
              v-model="search"
              placeholder="Search"
              prepend-inner-icon="mdi-magnify"
              variant="outlined" density="comfortable" class="mb-3"
            />
            <v-data-table
              :items="filteredRows"
              :headers="headers"
              :loading="loading.rows"
              density="comfortable"
              hide-default-footer
              class="rounded-lg"
            >
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
    await store.createOrResolve()
    toast('Fertig.', 'success')
  } catch(e) {
    toast(e.message || String(e), 'error')
  }
}
function resetForm(){ store.resetForm() }

// Init
onMounted(() => store.init())
</script>