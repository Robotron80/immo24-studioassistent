<template>
  <v-container class="pa-6" fluid>
    <h2 class="mb-4">Ersteinrichtung</h2>

    <v-stepper v-model="step">
      <v-stepper-header>
        <template v-for="(title, index) in STEPS" :key="title">
          <v-divider v-if="index > 0" />
          <v-stepper-item :value="index + 1" :title="title" />
        </template>
      </v-stepper-header>

      <v-stepper-window>
        <v-stepper-window-item :value="1">
          <v-card class="pa-6" variant="flat" :border="false">
            <p class="text-body-1 mb-4">
              Willkommen beim immo24 Studioassistent. Das Programm wird das erste Mal gestartet und benötigt einige grundlegende Einstellungen.
            </p>
            <p class="text-body-1">
              Diese können später in der Konfiguration angepasst werden.
            </p>
            <div class="d-flex ga-2 mt-4">
              <v-spacer />
              <v-btn color="primary" @click="step++">Einrichtung starten</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <v-stepper-window-item :value="2">
          <v-card class="pa-4" variant="flat" :border="false">
            <div class="text-body-1">
              Bitte die Pfade für Mitarbeiter-, Produktionen- und Stammdatenverzeichnis festlegen.
            </div>
            <div class="text-body-1 mb-4">
              Anschließend den Pfad des Pro Tools User-Verzeichnis angeben.
            </div>
            <KonfigPfade ref="pathsRef" />
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="step--">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :loading="saving" @click="savePathsAndContinue">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <v-stepper-window-item :value="3">
          <v-card class="pa-4" variant="flat" :border="false">
            <KonfigMitarbeiter ref="usersRef" />
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="step--">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!usersRef?.hasUsers()" @click="step++">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <v-stepper-window-item :value="4">
          <v-card class="pa-4" variant="flat" :border="false">
            <div class="text-body-1 mb-6">
              Bitte festlegen, wie die Projektordner und Session-Files benannt werden sollen.
            </div>
            <KonfigNamensschema ref="schemaRef" />
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="step--">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!schemaRef?.isSchemaValid()" @click="step++">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <v-stepper-window-item :value="5">
          <v-card class="pa-4" variant="flat" :border="false">
            <div class="text-body-1 mb-6">
              Bitte ein Passwort für das Konfigurations-Menü vergeben.
            </div>
            <KonfigPasswort ref="passwordRef" />
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="step--">Zurück</v-btn>
              <v-spacer />
              <v-btn color="primary" :disabled="!passwordRef?.isValid()" @click="step++">Weiter</v-btn>
            </div>
          </v-card>
        </v-stepper-window-item>

        <v-stepper-window-item :value="6">
          <v-card class="pa-4" variant="flat" :border="false">
            <p class="text-body-1 mb-4">
              Alles bereit. Mit „Fertig“ werden die Einstellungen gespeichert. Danach prüft immo24 die
              Konfiguration und startet mit der Benutzerwahl.
            </p>
            <ul class="text-body-2 mb-4">
              <li>Neue Mitarbeiter werden angelegt.</li>
              <li>Die Schemas werden übernommen.</li>
              <li>Das Passwort wird gesetzt.</li>
            </ul>
            <div class="d-flex ga-2 mt-4">
              <v-btn variant="text" @click="step--">Zurück</v-btn>
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
 * Der Einrichtungsassistent beim allerersten Start.
 *
 * Die Formulare sind dieselben wie in der Konfiguration (components/Konfig*.vue), hier kommt
 * nur die Führung durch die Schritte dazu. Ein Formular lädt seine Daten, sobald sein Schritt
 * zum ersten Mal erscheint. Die Pfade werden deshalb schon vor dem nächsten Schritt gespeichert:
 * Mitarbeiter und Namensschema liegen in diesen Ordnern. Der Rest folgt am Ende auf einmal.
 */
import { reactive, ref } from 'vue'

import KonfigMitarbeiter from '@/components/KonfigMitarbeiter.vue'
import KonfigNamensschema from '@/components/KonfigNamensschema.vue'
import KonfigPasswort from '@/components/KonfigPasswort.vue'
import KonfigPfade from '@/components/KonfigPfade.vue'
import { backend } from '@/lib/backend'

const STEPS = ['Willkommen', 'Pfade', 'Benutzer', 'Namensschema', 'Passwort', 'Fertigstellen']

const step = ref(1)
const saving = ref(false)
const snack = reactive({ show: false, text: '', color: 'success' })

const pathsRef = ref<any>(null)
const usersRef = ref<any>(null)
const schemaRef = ref<any>(null)
const passwordRef = ref<any>(null)

function toast(text, color = 'success') {
  Object.assign(snack, { show: true, text, color })
}

/**
 * Speichert die Pfade und geht weiter. War man schon weiter und kommt zurück, könnten
 * Mitarbeiter und Schema aus den alten Ordnern stammen, deshalb lesen sie dann neu.
 */
async function savePathsAndContinue() {
  if (!pathsRef.value.isPfadeValid()) {
    toast('Bitte alle vier Pfade setzen.', 'warning')
    return
  }
  saving.value = true
  try {
    await backend.savePaths(pathsRef.value.getSnapshotForSave())
    await Promise.all([
      pathsRef.value.resetToServer(),
      usersRef.value?.resetToServer(),
      schemaRef.value?.resetToServer(),
    ])
    step.value++
  } catch (e) {
    toast(`Pfade speichern fehlgeschlagen: ${e.message}`, 'error')
  } finally {
    saving.value = false
  }
}

/** Speichert alles Übrige und prüft im Backend, ob die Einrichtung vollständig ist. */
async function finish() {
  saving.value = true
  try {
    await backend.saveSchema(schemaRef.value.getSnapshotForSave())
    await passwordRef.value.saveToServer()
    await backend.saveUsers(usersRef.value.getSnapshotForSave())

    const { needsSetup } = await backend.getSetupStatus()
    if (needsSetup) {
      toast('Konfiguration unvollständig. Bitte Eingaben prüfen.', 'warning')
      return
    }

    // Assistent schließen, danach erscheint die Anmeldung
    await window.electronAPI.closeInitWindow()
  } catch (e) {
    toast(e.message || String(e), 'error')
  } finally {
    saving.value = false
  }
}
</script>
