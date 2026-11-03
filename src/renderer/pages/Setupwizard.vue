<template>
  <v-container class="pa-6" fluid>
    <h2 class="mb-4">Ersteinrichtung</h2>

    <v-stepper v-model="step">
      <v-stepper-header>
        <v-stepper-item :value="1" title="Willkommen" />
        <v-divider />
        <v-stepper-item :value="2" title="Pfade" />
        <v-divider />
        <v-stepper-item :value="3" title="Benutzer" />
        <v-divider />
        <v-stepper-item :value="4" title="Namensschema" />
        <v-divider />
        <v-stepper-item :value="5" title="Passwort" />
        <v-divider />
        <v-stepper-item :value="6" title="Fertigstellen" />
      </v-stepper-header>

      <v-stepper-window>
        <!-- Schritt 1: Willkommen -->
        <v-stepper-window-item :value="1">
          <v-card class="pa-6" variant="flat">
            <p class="text-body-1 mb-4">
              Willkommen beim immo24 Studioassistent. Das Programm wird das erste Mal gestartet und benötigt einige grundlegende Einstellungen.
            </p>
            <p class="text-body-1">
              Diese können später in der Konfiguration angepasst werden.
            </p>
            <div class="d-flex ga-2 mt-4">
              <v-spacer />
              <v-btn color="primary" @click="next">Einrichtung starten</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 2: Pfade -->
        <v-stepper-window-item :value="2">
          <v-card class="pa-4" variant="flat">
            <div class="text-body-1">
              Bitte die Pfade für Mitarbeiter-, Produktionen- und Stammdatenverzeichnis festlegen.
            </div>
            <div class="text-body-1 mb-4">
              Anschließend den Pfad des Pro Tools User-Verzeichnis angeben.
            </div>
            <div>
              <v-text-field
                v-model="paths.PathMitarbeiter"
                label="Pfad: Mitarbeiter"
                clearable
                class="mb-3"
              >
                <template #append>
                  <v-btn color="primary" variant="outlined" @click="pick('Pfad: Mitarbeiter','PathMitarbeiter')">
                    Durchsuchen
                  </v-btn>
                </template>
              </v-text-field>
              <v-text-field
                v-model="paths.PathProduktionen"
                label="Pfad: Produktionen"
                clearable
                class="mb-3"
              >
                <template #append>
                  <v-btn color="primary" variant="outlined" @click="pick('Pfad: Produktionen','PathProduktionen')">
                    Durchsuchen
                  </v-btn>
                </template>
              </v-text-field>
              <v-text-field
                v-model="paths.PathStammdaten"
                label="Pfad: Stammdaten"
                clearable
                class="mb-3"
              >
                <template #append>
                  <v-btn color="primary" variant="outlined" @click="pick('Pfad: Stammdaten','PathStammdaten')">
                    Durchsuchen
                  </v-btn>
                </template>
              </v-text-field>
              <v-text-field
                v-model="paths.PathPTUser"
                label="Pfad: Pro Tools User"
                clearable
                class="mb-3"
              >
                <template #append>
                  <v-btn color="primary" variant="outlined" @click="pick('Pfad: Pro Tools User','PathPTUser')">
                    Durchsuchen
                  </v-btn>
                </template>
              </v-text-field>
            </div>
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" @click="nextFromPaths">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 3: Benutzer -->
        <v-stepper-window-item :value="3">
          <v-card class="pa-4" variant="flat">
            <div class="w-100 pb-8">
              <div class="d-flex align-center justify-end mb-2">
                <v-btn size="small" @click="openNewDialog">Neuer Mitarbeiter</v-btn>
              </div>

              <v-table class="border rounded">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kürzel</th>
                    <th class="action-col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in users" :key="m.kuerzel + m.name">
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
                  <tr v-if="users.length === 0">
                    <td colspan="3"><em>Keine Mitarbeiter hinzugefügt.</em></td>
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
            <div class="d-flex ga-2 mt-2">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!usersOk" @click="next">Weiter</v-btn>
            </div>

          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 4: Namensschema -->
        <v-stepper-window-item :value="4">
          <v-card class="pa-4" variant="flat">
            <div class="text-body-1 mb-6">
              Bitte festlegen, wie die Projektordner und Session-Files benannt werden sollen.
            </div>

            <v-card class="pa-4 mb-4">
              <div class="text-subtitle-1 font-weight-medium mb-2">Projektordner-Schema</div>
              <div class="mb-2 text-body-2 text-medium-emphasis">Verfügbare Parameter</div>
              <div class="d-flex flex-wrap ga-2 mb-3">
                <span
                  v-for="ph in projektordnerPlaceholders"
                  :key="ph"
                  class="chip"
                >{{ ph }}</span>
              </div>
              <v-text-field
                v-model="schema.projektordnerSchema"
                label="Projektordner-Schema"
                hint="z.B. {{datum}} {{projektname}} {{moid}} {{benutzer}}"
                persistent-hint
                class="mb-2"
              />
              <div class="preview-box mt-2">
                <span class="text-caption text-medium-emphasis">Vorschau:</span>
                <code>{{ previewProjektordner }}</code>
              </div>
            </v-card>

            <v-card class="pa-4 mb-4">
              <div class="text-subtitle-1 font-weight-medium mb-2">Session-Schema</div>
              <div class="mb-2 text-body-2 text-medium-emphasis">Verfügbare Parameter</div>
              <div class="d-flex flex-wrap ga-2 mb-3">
                <span
                  v-for="ph in sessionPlaceholders"
                  :key="ph"
                  class="chip"
                >{{ ph }}</span>
              </div>
              <v-text-field
                v-model="schema.sessionSchema"
                label="Session-Schema"
                hint="z.B. {{projektname}} {{produktionsstufe}} {{benutzer}} {{version}}"
                persistent-hint
                class="mb-2"
              />
              <!-- Fehlermeldung direkt unter dem Textfeld -->
              <v-alert
                v-if="schema.sessionSchema && !schema.sessionSchema.includes('{{version}}')"
                type="error"
                class="mt-2"
              >
                Das Session-Schema muss
                <span class="chip">&#123;&#123;version&#125;&#125;</span> enthalten!
              </v-alert>
              <div class="preview-box mt-2">
                <span class="text-caption text-medium-emphasis">Vorschau:</span>
                <code>{{ previewSession }}</code>
              </div>
            </v-card>

            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn
                color="primary"
                :disabled="!schemaOk || !schema.sessionSchema.includes('{{version}}')"
                @click="next"
              >Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 5: Passwort -->
        <v-stepper-window-item :value="5">
          <v-card class="pa-4" variant="flat">
            <div class="text-body-1 mb-6">
              Bitte ein Passwort für das Konfigurations-Menü vergeben.
            </div>
            <div>
              <v-text-field
                v-model="password"
                :type="showPw ? 'text' : 'password'"
                label="Passwort"
                :append-inner-icon="showPw ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPw = !showPw"
                class="mb-3"
              />
              <v-text-field
                v-model="password2"
                :type="showPw2 ? 'text' : 'password'"
                label="Passwort wiederholen"
                :append-inner-icon="showPw2 ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPw2 = !showPw2"
                :error="!!password2 && password2 !== password"
                :error-messages="password2 && password2 !== password ? ['Passwörter stimmen nicht überein.'] : []"
                class="mb-3"
              />
            </div>
            <div class="d-flex ga-2 mt-2">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!passwordOk" @click="next">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 6: Fertigstellen -->
        <v-stepper-window-item :value="6">
          <v-card class="pa-4" variant="flat">
            <p class="text-body-1 mb-4">
              Alles bereit. Mit „Fertig“ werden die Einstellungen gespeichert. Danach prüft immo24 die
              Konfiguration und startet mit der Benutzerwahl.
            </p>
            <ul class="text-body-2 mb-4">
              <li>Die Pfade werden gesichert.</li>
              <li>Neue Mitarbeiter werden angelegt.</li>
              <li>Die Schemas werden übernommen.</li>
              <li>Das Passwort wird gesetzt.</li>
            </ul>
            <div class="d-flex ga-2">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :loading="saving" @click="finish">Fertig</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>
      </v-stepper-window>
    </v-stepper>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">
      {{ snack.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Der Einrichtungsassistent beim allerersten Start: Pfade, Mitarbeiter, Namensschema und Passwort.
 * Gespeichert wird am Ende auf einmal, nur die Pfade schon vorher, weil der Rest davon abhängt.
 */
import { reactive, ref, onMounted, computed } from 'vue'

import { backend } from '@/lib/backend'

const step = ref(1)
const saving = ref(false)
const snack = reactive({ show: false, text: '', color: 'success' })

const paths = reactive({
  PathMitarbeiter: '',
  PathProduktionen: '',
  PathStammdaten: '',
  PathPTUser: '',
})

const schema = reactive({
  projektordnerSchema: '',
  sessionSchema: '',
})
const password = ref('')
const password2 = ref('')
const showPw = ref(false)
const showPw2 = ref(false)

const users = ref<any[]>([])
const error = ref('')

// Dialog: Neuer Mitarbeiter
const newDialogOpen = ref(false)
const newName = ref('')
const newKuerzel = ref('')
const dialogError = ref('')

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
  const existsName = users.value.some(m => (m.name || '').toLowerCase() === name.toLowerCase())
  if (existsName) { dialogError.value = 'Mitarbeiter existiert bereits.'; return }
  const existsKuerzel = users.value.some(m => (m.kuerzel || '').toLowerCase() === kuerzel.toLowerCase())
  if (existsKuerzel) { dialogError.value = 'Kürzel existiert bereits.'; return }
  users.value.push({ name, kuerzel })
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
  editIndex = users.value.findIndex(x => x.name === m.name)
  editDialogOpen.value = true
}

function saveEditKuerzel() {
  const kuerzel = (editKuerzel.value || '').trim()
  if (!kuerzel) {
    editDialogError.value = 'Bitte Kürzel eingeben.'
    return
  }
  // Dasselbe Kürzel darf kein anderer Mitarbeiter haben
  const existsKuerzel = users.value.some((m, idx) =>
    idx !== editIndex && (m.kuerzel || '').toLowerCase() === kuerzel.toLowerCase()
  )
  if (existsKuerzel) {
    editDialogError.value = 'Kürzel existiert bereits.'
    return
  }
  if (editIndex >= 0) {
    users.value[editIndex].kuerzel = kuerzel
    editDialogOpen.value = false
  }
}

// Sind die Schritte vollständig ausgefüllt?
const usersOk = computed(() => users.value.length >= 1)
const pathsOk = computed(() =>
  !!paths.PathMitarbeiter && !!paths.PathProduktionen && !!paths.PathStammdaten && !!paths.PathPTUser
)
const schemaOk = computed(() =>
  !!schema.projektordnerSchema && !!schema.sessionSchema
)
const passwordOk = computed(() =>
  !!password.value && password.value.length >= 4 && password.value === password2.value
)

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

/** Öffnet die Ordnerauswahl des Systems. */
async function pick(title, key) {
  const dir = await window.electronAPI.pickFolder(title, paths[key] || undefined)
  if (dir) paths[key] = dir
}

/** Übernimmt Pfade und Schema, falls schon etwas eingerichtet ist, etwa auf einem weiteren Rechner. */
async function loadFromInitialize() {
  try {
    const data = await backend.getInitializeStatus()
    if (data?.paths) Object.assign(paths, data.paths)
    if (data?.schema) Object.assign(schema, data.schema)
  } catch (e) {
    toast(`Fehler beim Laden: ${String(e)}`, 'error')
  }
}

/** Liest vorhandene Mitarbeiter, damit sie in der Liste stehen. */
async function loadUsersSnapshot() {
  try {
    users.value = await backend.listUsers()
  } catch {
    toast('Mitarbeiter konnten nicht geladen werden.', 'error')
  }
}

/** Speichert die Pfade. Die aktuelle Version kommt direkt aus dem Backend. */
async function savePaths() {
  const { version } = await backend.getPaths()
  await backend.savePaths({ data: { ...paths }, version })
}

function prev() { step.value = Math.max(1, step.value - 1) }
function next() { step.value = Math.min(6, step.value + 1) }

async function nextFromPaths() {
  if (!pathsOk.value) {
    toast('Bitte alle vier Pfade setzen.', 'warning')
    return
  }
  try {
    await savePaths()
  } catch (e) {
    toast(`Pfade speichern fehlgeschlagen: ${e.message}`, 'error')
    return
  }
  // Erst jetzt sind die Ordner bekannt, in denen Schema und Mitarbeiter liegen
  await loadFromInitialize()
  await loadUsersSnapshot()
  next()
}

async function finish() {
  if (!pathsOk.value) { toast('Bitte alle vier Pfade setzen.', 'warning'); step.value = 2; return }
  if (!schemaOk.value) { toast('Namensschema unvollständig.', 'warning'); step.value = 4; return }
  if (!passwordOk.value) { toast('Passwort unvollständig/ungleich.', 'warning'); step.value = 5; return }

  saving.value = true
  try {
    // 1) Pfade speichern
    await savePaths()

    // 2) Schemas speichern. Auf einem weiteren Rechner gibt es die Datei schon.
    const { version: schemaVersion } = await backend.getSchema()
    await backend.saveSchema({ schema: { ...schema }, version: schemaVersion ?? '' })

    // 3) Passwort speichern
    await backend.setPassword({ newPassword: password.value, repeatPassword: password2.value })

    // 4) Benutzer speichern (mindestens einer)
    if (!users.value.length) throw new Error('Es muss mindestens ein Benutzer angelegt sein.')
    await backend.saveUsers({ mitarbeiter: users.value })

    // Das Backend prüft selbst noch einmal, ob alles vollständig ist
    const { initialize } = await backend.getInitializeStatus()
    if (!initialize.paths_json_present || !initialize.required_keys_ok || !initialize.schema_ok) {
      toast('Konfiguration unvollständig. Bitte Eingaben prüfen.', 'warning')
      return
    }

    toast('Konfiguration gespeichert.')

    // Assistent schließen, danach erscheint die Anmeldung
    await window.electronAPI.closeInitWindow()
  } catch (e) {
    toast(e.message || String(e), 'error')
  } finally {
    saving.value = false
  }
}

// Beispielwerte für die Vorschau der Namen
const demoValues = {
  datum: '1997-01-23',
  projektname: 'Faszination Falten',
  moid: 'O4BZ',
  benutzer: 'PL',
  kunde: 'SuperVision',
  produktionsstufe: 'Foleys',
  version: 'v3'
}

function renderPreview(schemaStr = '') {
  return schemaStr.replace(/\{\{(\w+)\}\}/g, (_m, key) => demoValues[key] ?? '')
}

const previewProjektordner = computed(() => renderPreview(schema.projektordnerSchema))
const previewSession       = computed(() => renderPreview(schema.sessionSchema))

onMounted(async () => {
  await loadFromInitialize()
  if (paths.PathMitarbeiter) {
    await loadUsersSnapshot()
  }
})

const projektordnerPlaceholders = [
  '{{benutzer}}', '{{datum}}', '{{projektname}}', '{{moid}}',
  '{{kunde}}'
]
const sessionPlaceholders = [
  '{{benutzer}}', '{{datum}}', '{{projektname}}', '{{moid}}',
  '{{kunde}}', '{{produktionsstufe}}', '{{version}}'
]
</script>
