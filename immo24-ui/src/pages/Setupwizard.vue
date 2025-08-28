<template>
  <v-container class="pa-6" fluid>
    <h2 class="mb-4">Ersteinrichtung</h2>

    <v-stepper v-model="step">
      <v-stepper-header>
        <v-stepper-item :value="1" title="Willkommen" />
        <v-divider />
        <v-stepper-item :value="2" title="Pfade" />
        <v-divider />
        <v-stepper-item :value="3" title="Namensschema" />
        <v-divider />
        <v-stepper-item :value="4" title="Passwort" />
        <v-divider />
        <v-stepper-item :value="5" title="Fertigstellen" />
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

        <!-- Schritt 3: Namensschema -->
        <v-stepper-window-item :value="3">
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

        <!-- Schritt 4: Passwort -->
        <v-stepper-window-item :value="4">
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

        <!-- Schritt 5: Fertigstellen -->
        <v-stepper-window-item :value="5">
          <v-card class="pa-4" variant="flat">
            <p class="text-body-1 mb-4">
              Alles bereit. Mit „Fertig“ werden die Einstellungen gespeichert. Danach prüft immo24 die
              Konfiguration und startet mit der Benutzerwahl.
            </p>
            <ul class="text-body-2 mb-4">
              <li>Die Pfade werden gesichert.</li>
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

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:1880/api'

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

const lastInit = ref(null)
const initOk = computed(() =>
  !!(lastInit.value?.ready &&
     lastInit.value?.initialize?.paths_json_present &&
     lastInit.value?.initialize?.required_keys_ok &&
     lastInit.value?.initialize?.schema_ok)
)

const step2Ok = computed(() =>
  !!paths.PathMitarbeiter && !!paths.PathProduktionen && !!paths.PathStammdaten && !!paths.PathPTUser
)
const step3Ok = computed(() =>
  !!schema.projektordnerSchema && !!schema.sessionSchema
)
const step4Ok = computed(() =>
  !!password.value && password.value.length >= 4 && password.value === password2.value
)

function toast(text, color = 'success') {
  snack.text = text; snack.color = color; snack.show = true
}

async function pick(title, key) {
  const dir = await window.electronAPI?.pickFolder?.(title, paths[key] || undefined)
  if (dir) paths[key] = dir
}

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

function prev() { step.value = Math.max(1, step.value - 1) }
function next() { step.value = Math.min(5, step.value + 1) }

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
  next()
}
async function finish() {
  if (!step2Ok.value) { toast('Bitte alle vier Pfade setzen.', 'warning'); step.value = 2; return }
  if (!step3Ok.value) { toast('Namensschema unvollständig.', 'warning'); step.value = 3; return }
  if (!step4Ok.value) { toast('Passwort unvollständig/ungleich.', 'warning'); step.value = 4; return }

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

    // Backend erneut prüfen
    const r2 = await fetch(`${API}/initialize`)
    lastInit.value = await r2.json()
    if (!initOk.value) {
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

onMounted(loadFromInitialize)

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