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
            <p class="text-body-1">
              Willkommen beim immo24 Studioassistent. Das Programm wird das erste Mal gestartet und benötigt einige grundlegende Einstellungen.
            </p>
            <p class="text-body-2">
              Diese können später in der Konfiguration angepasst werden. Gespeichert wird erst am Ende mit „Fertig“.
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
            <p>
              Bitte die Pfade für Mitarbeiter-, Produktionen- und Stammdatenverzeichnis festlegen.
              Anschließend den Pfad für das Pro Tools User-Verzeichnis.
            </p>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field v-model="paths.PathMitarbeiter" label="Pfad: Mitarbeiter" clearable>
                  <template #append>
                    <v-btn color="primary" variant="outlined" @click="pick('Pfad: Mitarbeiter','PathMitarbeiter')">
                      Durchsuchen
                    </v-btn>
                  </template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="paths.PathProduktionen" label="Pfad: Produktionen" clearable>
                  <template #append>
                    <v-btn color="primary" variant="outlined" @click="pick('Pfad: Produktionen','PathProduktionen')">
                      Durchsuchen
                    </v-btn>
                  </template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="paths.PathStammdaten" label="Pfad: Stammdaten" clearable>
                  <template #append>
                    <v-btn color="primary" variant="outlined" @click="pick('Pfad: Stammdaten','PathStammdaten')">
                      Durchsuchen
                    </v-btn>
                  </template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="paths.PathPTUser" label="Pfad: Pro Tools User" clearable>
                  <template #append>
                    <v-btn color="primary" variant="outlined" @click="pick('Pfad: Pro Tools User','PathPTUser')">
                      Durchsuchen
                    </v-btn>
                  </template>
                </v-text-field>
              </v-col>
            </v-row>
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
            <p class="text-body-2 mb-4">
              Bitte festlegen, wie die Projektordner und Session-Files benannt werden sollen. Folgende Parameter stehen zur Verfügung:
              <span v-pre>{{benutzer}}, {{datum}}, {{projektname}}, {{moid}}, {{kunde}}, {{produktionsstufe}}, {{version}}</span>
            </p>
            <v-text-field
              v-model="schema.projektordnerSchema"
              label="Projektordner-Schema"
              hint="z.B. {{benutzer}} {{datum}} {{projektname}} {{moid}}"
              persistent-hint
            />
            <v-text-field
              v-model="schema.sessionSchema"
              label="Session-Schema"
              hint="z.B. {{projektname}} {{moid}} {{benutzer}} {{kunde}} {{produktionsstufe}} {{version}}"
              persistent-hint
            />
            <div class="d-flex ga-2 mt-2">
              <v-btn variant="text" @click="prev">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!step3Ok" @click="next">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <!-- Schritt 4: Passwort -->
        <v-stepper-window-item :value="4">
          <v-card class="pa-4" variant="flat">
            <p class="text-body-2 mb-4">
              Bitte ein Passwort für das Konfigurations-Menü vergeben.
            </p>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="password"
                  :type="showPw ? 'text' : 'password'"
                  label="Passwort"
                  :append-inner-icon="showPw ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showPw = !showPw"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="password2"
                  :type="showPw2 ? 'text' : 'password'"
                  label="Passwort wiederholen"
                  :append-inner-icon="showPw2 ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showPw2 = !showPw2"
                  :error="!!password2 && password2 !== password"
                  :error-messages="password2 && password2 !== password ? ['Passwörter stimmen nicht überein.'] : []"
                />
              </v-col>
            </v-row>
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
            <p class="text-body-2">
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
    await window.electronAPI?.hideAndOpenPicker?.({ doLogout: true })
  } catch (e) {
    toast(String(e), 'error')
  } finally {
    saving.value = false
  }
}

onMounted(loadFromInitialize)
</script>