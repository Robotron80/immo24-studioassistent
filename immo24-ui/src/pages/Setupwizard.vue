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
            <div class="mitarbeiter-fullwidth">
              <div class="d-flex align-center justify-end mb-2">
                <v-btn size="small" @click="openNewDialog">Neuer Mitarbeiter</v-btn>
              </div>

              <v-table class="border rounded">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kürzel</th>
                    <th style="width: 60px;"></th>
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
              <v-btn color="primary" :disabled="!stepUsersOk" @click="next">Weiter</v-btn>
            </div>

          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 4: Namensschema -->
        <v-stepper-window-item :value="4">
          <v-card class="pa-4" variant="flat">
            <div class="text-body-1 mb-6">
              Bitte festlegen, wie die Projektordner und Session-Files benannt werden sollen.
            </div>

            <v-card class="pa-4 mb-4 shadow-card" variant="text">
              <div class="schema-title mb-2">Projektordner-Schema</div>
              <div class="mb-2 param-label">Verfügbare Parameter</div>
              <div class="mb-3" style="display: flex; gap: 8px; flex-wrap: wrap;">
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

            <v-card class="pa-4 mb-4 shadow-card" variant="text">
              <div class="schema-title mb-2">Session-Schema</div>
              <div class="mb-2 param-label">Verfügbare Parameter</div>
              <div class="mb-3" style="display: flex; gap: 8px; flex-wrap: wrap;">
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
                :disabled="!step3Ok || !schema.sessionSchema.includes('{{version}}')"
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
              <v-btn color="primary" :disabled="!step4Ok" @click="next">Weiter</v-btn>
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

<script setup>
import { reactive, ref, onMounted, computed } from 'vue'

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:59593/api'

const step = ref(1)
const saving = ref(false)
const checking = ref(false)
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

const users = ref([])
const error = ref('')

// Mitarbeiter-Dialoge und Logik
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

// Kürzel bearbeiten Dialog
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
  // Prüfe auf Duplikate (außer für den aktuellen Eintrag)
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

// Schritt-Checks
const stepUsersOk = computed(() => users.value.length >= 1)
const step2Ok = computed(() =>
  !!paths.PathMitarbeiter && !!paths.PathProduktionen && !!paths.PathStammdaten && !!paths.PathPTUser
)
const step3Ok = computed(() =>
  !!schema.projektordnerSchema && !!schema.sessionSchema
)
const step4Ok = computed(() =>
  !!password.value && password.value.length >= 4 && password.value === password2.value
)

// Snackbar
function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

// Pfad-Auswahl
async function pick(title, key) {
  const dir = await window.electronAPI?.pickFolder?.(title, paths[key] || undefined)
  if (dir) paths[key] = dir
}

// Backend laden
const lastInit = ref(null)
async function loadFromInitialize() {
  checking.value = true
  try {
    const r = await fetch(`${API}/initialize`)
    const data = await r.json()
    lastInit.value = data
    if (data?.paths) Object.assign(paths, data.paths)
    if (data?.schema) Object.assign(schema, data.schema)
  } catch (e) {
    toast(`Fehler beim Laden: ${String(e)}`, 'error')
  } finally { checking.value = false }
}

// Mitarbeiter laden
const userApiReady = ref(true)
async function loadUsersSnapshot() {
  try {
    const res = await fetch(`${API}/user`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    let arr = await res.json()
    if (Array.isArray(arr) && typeof arr[0] === 'string') {
      arr = arr.map(name => ({ name, kuerzel: '' }))
    }
    arr = arr.map(m => ({
      name: m.name,
      kuerzel: m.kuerzel || ''
    }))
    users.value = arr || []
    userApiReady.value = true
  } catch (e) {
    userApiReady.value = false
    toast('Mitarbeiter konnten nicht geladen werden.', 'error')
  }
}

// Mitarbeiter speichern
async function saveUsersSnapshot() {
  let rInit = await fetch(`${API}/initialize`)
  let initData = await rInit.json()
  let version = initData?.initialize?.user_version || "0"

  const r = await fetch(`${API}/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mitarbeiter: users.value, version }),
  })
  if (r.status === 409) {
    const err = await r.json()
    version = err.currentVersion
    // Retry mit aktueller Version
    await fetch(`${API}/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mitarbeiter: users.value, version }),
    })
  }
}

// Schrittwechsel
function prev() { step.value = Math.max(1, step.value - 1) }
function next() { step.value = Math.min(6, step.value + 1) }

async function nextFromPaths() {
  if (!step2Ok.value) {
    toast('Bitte alle vier Pfade setzen.', 'warning')
    return
  }
  // 1. Version aus /initialize holen
  let rInit = await fetch(`${API}/initialize`)
  let initData = await rInit.json()
  let version = initData?.initialize?.paths_version || "0"

  // 2. Pfade speichern mit Version
  let r = await fetch(`${API}/paths`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...paths }, version }),
  })
  if (r.status === 409) {
    const err = await r.json()
    version = err.currentVersion
    // Retry mit aktueller Version
    r = await fetch(`${API}/paths`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...paths }, version }),
    })
  }
  if (!r.ok) {
    toast(`Pfade speichern fehlgeschlagen: ${r.status} ${r.statusText}`, 'error')
    return
  }
  // 3. Werte laden
  await loadFromInitialize()
  await loadUsersSnapshot()
  next()
}

async function finish() {
  if (!step2Ok.value) { toast('Bitte alle vier Pfade setzen.', 'warning'); step.value = 2; return }
  if (!step3Ok.value) { toast('Namensschema unvollständig.', 'warning'); step.value = 4; return }
  if (!step4Ok.value) { toast('Passwort unvollständig/ungleich.', 'warning'); step.value = 5; return }

  saving.value = true
  try {
    // Version aus /initialize holen
    let rInit = await fetch(`${API}/initialize`)
    let initData = await rInit.json()
    let version = initData?.initialize?.paths_version || "0"

    // 1) Pfade speichern
    let r = await fetch(`${API}/paths`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...paths }, version }),
    })
    if (r.status === 409) {
      const err = await r.json()
      version = err.currentVersion
      // Retry mit aktueller Version
      r = await fetch(`${API}/paths`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { ...paths }, version }),
      })
    }
    if (!r.ok) throw new Error(`Pfade speichern fehlgeschlagen: ${r.status} ${r.statusText}`)

    // 2) Schemas speichern (nutze dieselbe Version)
    r = await fetch(`${API}/schema`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: { ...schema },
        version,
      }),
    })
    if (!r.ok) throw new Error(`Schemas speichern fehlgeschlagen: ${r.status} ${r.statusText}`)

    // 3) Passwort speichern
    r = await fetch(`${API}/adminpw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newPassword: password.value,
        repeatPassword: password2.value
      }),
    })
    if (!r.ok) throw new Error(`Passwort speichern fehlgeschlagen: ${r.status} ${r.statusText}`)

    // 4) Benutzer speichern (mindestens einer)
    if (!users.value.length) throw new Error('Es muss mindestens ein Benutzer angelegt sein.')
    await saveUsersSnapshot()

    // Backend erneut prüfen
    const r2 = await fetch(`${API}/initialize`)
    lastInit.value = await r2.json()
    if (!(lastInit.value?.ready && lastInit.value?.initialize?.paths_json_present && lastInit.value?.initialize?.required_keys_ok && lastInit.value?.initialize?.schema_ok) || users.value.length < 1) {
      toast('Konfiguration unvollständig. Bitte Eingaben prüfen.', 'warning')
      return
    }

    toast('Konfiguration gespeichert.')

    // InitWindow schließen
    await window.electronAPI?.closeInitWindow?.()

    // Picker öffnen
    await window.electronAPI?.hideAndOpenPicker?.({ doLogout: true })
  } catch (e) {
    toast(String(e), 'error')
  } finally {
    saving.value = false
  }
}

// Vorschau für Schemas
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

<style>
.table th { font-weight: 600; }
code {
  background: #f4f6f8;
  padding: 2px 6px;
  border-radius: 4px;
}

.chip {
  display: inline-block;
  padding: 2px 8px;
  margin: 2px 0;
  background: #f5f5f5;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 16px;
  font-size: 0.95em;
  font-weight: 500;
  user-select: none;
}

.preview-box {
  background: #f4f6f8;
  border-radius: 6px;
  padding: 6px 10px;
  margin-top: 4px;
  display: inline-block;
}

.setup-title {
  font-size: 1.35rem;
  font-weight: 600;
  color: #222;
  margin-bottom: 2rem;
}

.schema-title {
  font-size: 1.05rem;
  font-weight: 500;
  color: #444;
}

.param-label {
  font-size: 0.95rem;
  font-weight: 400;
  color: #666;
}

.shadow-card {
  box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
  border-radius: 10px;
  border: none;
}

.text-body-1 {
  font-size: 1.08rem;
  font-weight: 300;
  color: #222;
  margin-bottom: 1.5rem;
}
</style>