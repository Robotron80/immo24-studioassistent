<template>
  <v-container fluid>
    <!-- Umschalter: neues oder vorhandenes Projekt -->
    <div class="d-flex justify-center mb-4">
      <v-btn-toggle v-model="form.vorhanden" mandatory color="primary" variant="outlined" divided density="comfortable">
        <v-btn value="neu">Neues Projekt</v-btn>
        <v-btn value="vorhanden">Vorhandenes Projekt</v-btn>
      </v-btn-toggle>
    </div>

    <!-- Formular und Projektliste nebeneinander -->
    <v-row align="stretch">
      <!-- Formular (links) -->
      <v-col cols="12" md="5">
        <v-card class="h-100">
          <v-card-text>
            <v-form ref="formRef">
              <v-row dense>
                <v-col cols="12">
                  <v-autocomplete
                    v-model="form.kunde"
                    :items="kunden"
                    item-title="label"
                    item-value="value"
                    label="Kunde"
                    :loading="loading.kunden"
                    @update:model-value="onKundeChange"
                  />
                </v-col>

                <v-col cols="12">
                  <DatumFeld v-model="form.datum" label="Datum" :disabled="isVorhanden" />
                </v-col>

                <v-col cols="12">
                  <div class="moid-row">
                    <!-- Der key baut das Feld beim Umschalten neu auf, damit keine alte Fehlermeldung stehen bleibt -->
                    <MoidFeld
                      :key="form.ohneMoid ? 'ohne' : 'mit'"
                      v-model="form.moid"
                      label="Mo-ID"
                      :disabled="isVorhanden || form.ohneMoid"
                      :rules="[(v) => form.ohneMoid || !!v || 'Pflichtfeld', store.moidRule, store.windowsRule('moid')]"
                    />
                    <v-checkbox
                      v-model="form.ohneMoid"
                      class="moid-keine"
                      label="keine Mo-ID"
                      :disabled="isVorhanden"
                      @update:model-value="store.normalizeNames()"
                    />
                  </div>
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model="form.projektname"
                    label="Projektname"
                    :disabled="isVorhanden"
                    clearable
                    :rules="[(v) => (v && String(v).trim().length) || 'Pflichtfeld', store.windowsRule('projektname')]"
                    @blur="store.normalizeNames()"
                  />
                </v-col>

                <v-col cols="12">
                  <v-autocomplete
                    v-model="form.stufe"
                    :items="stufen"
                    item-title="label"
                    item-value="value"
                    label="Produktionsstufe"
                    :disabled="!form.kunde"
                    :loading="loading.stufen"
                  />
                </v-col>

                <v-col cols="12">
                  <v-autocomplete
                    v-model="form.template"
                    :items="templates"
                    item-title="label"
                    item-value="value"
                    label="Template"
                    :disabled="!form.kunde"
                    :loading="loading.templates"
                  />
                </v-col>

                <v-col v-if="store.noteEnabled" cols="12">
                  <v-text-field
                    v-model="form.anmerkung"
                    label="Anmerkung (optional)"
                    placeholder="z. B. Kurzversion"
                    clearable
                    :rules="[store.windowsRule('anmerkung')]"
                  />
                </v-col>

                <v-col cols="12" class="d-flex ga-3 mt-2">
                  <v-btn color="primary" :loading="loading.create" @click="onCreateClick"> Projekt anlegen </v-btn>
                  <v-btn variant="text" @click="resetForm"> Zurücksetzen </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Projektliste (rechts) -->
      <v-col cols="12" md="7">
        <v-card class="h-100">
          <v-card-text>
            <div class="d-flex align-center ga-2 mb-3">
              <v-text-field
                v-model="search"
                placeholder="Suchen"
                prepend-inner-icon="mdi-magnify"
                density="compact"
                hide-details
                class="flex-grow-1"
              />
              <v-btn
                icon="mdi-refresh"
                :loading="loading.rows"
                variant="text"
                aria-label="Tabelle aktualisieren"
                @click="refreshRows"
              />
            </div>
            <v-data-table
              :items="filteredRows"
              :headers="headers"
              :loading="loading.rows"
              :items-per-page="10"
              show-current-page
              :hide-default-footer="filteredRows.length <= 10"
            >
              <template #item="{ item }">
                <tr
                  class="project-row cursor-pointer"
                  :class="{ 'project-row--selected': selectedRow === item.ordner }"
                  @click="onRowClick(item)"
                >
                  <td class="text-no-wrap">{{ item.date }}</td>
                  <td>{{ item.projektname }}</td>
                  <td>
                    <template v-if="item.ohneMoid">–</template>
                    <div v-else class="d-flex flex-wrap ga-1 py-1">
                      <v-chip v-for="moid in moidList(item.moid)" :key="moid" size="small">{{ moid }}</v-chip>
                    </div>
                  </td>
                  <td>{{ item.user }}</td>
                  <td v-if="store.renameEnabled" class="text-right px-1">
                    <v-btn
                      icon="mdi-pencil"
                      size="x-small"
                      variant="text"
                      aria-label="Projekt umbenennen"
                      @click.stop="startRename(item)"
                    />
                  </td>
                </tr>
              </template>
              <template #no-data>
                <div class="text-body-2 text-medium-emphasis py-8">
                  {{ form.kunde ? 'Keine Projekte' : 'Bitte einen Kunden wählen' }}
                </div>
              </template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">
      {{ snack.text }}
    </v-snackbar>

    <!-- Mo-ID ist schon vergeben: anbieten, zum vorhandenen Projekt zu springen -->
    <v-dialog v-model="conflict.open" max-width="480">
      <v-card>
        <v-card-title class="text-h6">Mo-ID schon vergeben</v-card-title>
        <v-card-text>
          Die Mo-ID <strong>{{ conflict.project?.moid }}</strong> gehört schon zum Projekt
          <strong>{{ conflict.project?.projektname }}</strong> vom {{ conflict.project?.date }} bei
          {{ conflict.project?.kunde }}.
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="conflict.open = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="jumpToConflict">Zum Projekt</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <RenameProjectDialog v-model="rename.open" :kunde="form.kunde" :project="rename.project" @renamed="onRenamed" />

    <v-dialog v-model="openDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Projekt öffnen?</v-card-title>
        <v-card-text>
          <div v-if="lastCreatedProject?.fullPath">{{ lastCreatedProject.fullPath.split('/').pop() }}</div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="openDialog = false">Schließen</v-btn>
          <v-btn color="primary" @click="launchProject">Öffnen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Die Seite Produktionsbuch: ein neues Projekt anlegen oder eine weitere Session in einem
 * vorhandenen. Die Regeln dafür stehen im Backend (src/core/projects.ts), hier nur die Bedienung.
 */
import { computed, nextTick, ref, onMounted, reactive, watch } from 'vue'
import { moidList } from '../../core/names'
import DatumFeld from '@/components/DatumFeld.vue'
import MoidFeld from '@/components/MoidFeld.vue'
import RenameProjectDialog from '@/components/RenameProjectDialog.vue'
import { useProjektanlage } from '@/stores/Projektanlage'

const store = useProjektanlage()

// Kurzformen für die Daten aus dem Speicher
const form = computed(() => store.form)
const kunden = computed(() => store.kunden)
const templates = computed(() => store.templates)
const stufen = computed(() => store.stufen)
const rows = computed(() => store.rows)
const loading = computed(() => store.loading)
const isVorhanden = computed(() => form.value.vorhanden === 'vorhanden')
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const openDialog = ref(false)
const lastCreatedProject = ref<{ fullPath: string } | null>(null)

// Spalten der Projektliste
const headers = computed(() => [
  { title: 'Datum', key: 'date', nowrap: true },
  { title: 'Projektname', key: 'projektname' },
  { title: 'Mo-ID', key: 'moid' },
  { title: 'Mitarbeiter*in', key: 'user' },
  ...(store.renameEnabled ? [{ title: '', key: 'aktionen', sortable: false }] : []),
])

// Mo-ID vergeben: zum vorhandenen Projekt wechseln und es in der Liste auswählen
// Das vorhandene Projekt mit derselben Mo-ID, so wie das Backend es meldet
const conflict = reactive({
  open: false,
  project: null as { kunde: string; ordner: string; projektname: string; moid: string; date: string } | null,
})
async function jumpToConflict() {
  const target = conflict.project
  conflict.open = false
  if (!target) return
  // Die Eingaben gehörten zum neuen Projekt und passen nicht mehr
  store.resetForm()
  form.value.vorhanden = 'vorhanden'
  await store.selectKunde(target.kunde)
  await nextTick()
  search.value = target.moid
  const row = rows.value.find((r) => r.ordner === target.ordner)
  if (row) onRowClick(row)
}

// Umbenennen
const rename = reactive({ open: false, project: null })
function startRename(row) {
  rename.project = row
  rename.open = true
}
async function onRenamed({ nach }) {
  toast(`Umbenannt in: ${nach}`, 'success')
  await store.resetAfterRename()
}
const search = ref('')
// Ein neuer Modus oder Kunde beginnt ohne Suchfilter, sonst wirken Projekte wie verschwunden
watch(
  () => [form.value.vorhanden, form.value.kunde],
  () => {
    search.value = ''
    selectedRow.value = null
  },
)
const filteredRows = computed(() => {
  const q = search.value?.toLowerCase() || ''
  if (!q) return rows.value
  return rows.value.filter(
    (r) =>
      String(r.date).toLowerCase().includes(q) ||
      String(r.projektname).toLowerCase().includes(q) ||
      String(r.moid).toLowerCase().includes(q) ||
      String(r.user).toLowerCase().includes(q),
  )
})

// Kurze Meldung am unteren Rand
const snack = reactive({ show: false, text: '', color: 'primary' })
function toast(msg, color = 'primary') {
  Object.assign(snack, { show: true, text: msg, color })
}

function onKundeChange(k) {
  store.selectKunde(k)
  form.value.stufe = '' // Feld immer leeren!
}
async function onCreateClick() {
  const validation = await formRef.value?.validate()
  const fehlende = store.validateRequired()
  const winDetails = store.validateWindows()
  if ((validation && validation.valid === false) || fehlende.length || winDetails.length) {
    const lines: string[] = []
    if (fehlende.length) lines.push(`• Fehlend: ${fehlende.join(', ')}`)
    lines.push(...store.formatValidationDetails(winDetails))
    toast(`Bitte Eingaben korrigieren:\n${lines.join('\n')}`, 'error')
    return
  }
  try {
    const res = await store.createOrResolve()
    toast(`Fertig.`, 'success')
    if (res?.templateDest && res?.filename) {
      lastCreatedProject.value = { fullPath: `${res.templateDest}/${res.filename}` }
      openDialog.value = true
    }
  } catch (e) {
    // Mo-ID vergeben: Dialog mit Sprung zum vorhandenen Projekt
    if (e?.code === 'moid_vergeben') {
      conflict.project = e.details.projekt
      conflict.open = true
      return
    }
    // Ungültige Namen und fehlende Felder verständlich auflisten
    if (e?.code === 'validation_failed' && Array.isArray(e.details?.details)) {
      const lines = store.formatValidationDetails(e.details.details)
      toast(`Bitte Eingaben korrigieren:\n${lines.join('\n')}`, 'error')
      return
    }
    if (e?.code === 'project_fields_missing' && Array.isArray(e.details?.fields)) {
      toast(`Bitte ausfüllen: ${e.details.fields.join(', ')}`, 'error')
      return
    }
    // Halb angelegtes Projekt: den Ordner nennen, damit man ihn findet
    if (e?.code === 'projekt_unvollstaendig') {
      toast(`${e.message}\n${e.details.zielPfad}\n(${e.details.ursache})`, 'error')
      return
    }
    toast(e.message || String(e) || 'Unbekannter Fehler', 'error')
  }
}
async function launchProject() {
  openDialog.value = false
  try {
    const file = lastCreatedProject.value?.fullPath
    if (!file) return
    const error = await window.electronAPI.openSession(file)
    if (error) toast('Projekt konnte nicht geöffnet werden: ' + error, 'error')
  } catch (e) {
    toast('Projekt konnte nicht geöffnet werden: ' + (e.message || String(e)), 'error')
  }
}

function resetForm() {
  store.resetForm()
}
const selectedRow = ref<string | null>(null)

// Klick auf ein Projekt: Auch bei "Neues Projekt" geht es damit zum vorhandenen Projekt.
// Erst den Modus wechseln, denn der Wechsel leert die Auswahl.
async function onRowClick(row) {
  if (!isVorhanden.value) {
    form.value.vorhanden = 'vorhanden'
    await nextTick()
  }
  selectedRow.value = row.ordner
  form.value.datum = row.date
  form.value.projektname = row.projektname
  form.value.moid = row.moid
  form.value.ordner = row.ordner
  form.value.ohneMoid = !!row.ohneMoid
  form.value.stufe = typeof row.stufe === 'string' && row.stufe ? row.stufe : ''
}
function refreshRows() {
  store.selectKunde(form.value.kunde)
}

onMounted(() => {
  store.init()
})
</script>
