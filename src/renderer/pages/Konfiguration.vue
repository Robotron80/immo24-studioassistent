<template>
  <v-container fluid class="pa-0 ma-0 konfig-root">
    <div class="d-flex flex-column h-100 w-100">

      <!-- Tab-Leiste ganz oben, außerhalb des scrollbaren Inhalts -->
      <div class="sticky-top-bar">
        <v-tabs v-model="tab" class="mb-4">
          <v-tab value="prod">Produktionsbuch</v-tab>
          <v-tab value="mitarbeiter">Mitarbeiter</v-tab>
          <v-tab value="schema">Namensschema</v-tab>
          <v-tab value="paths">Pfade</v-tab>
          <v-tab value="module">Module</v-tab>
          <v-tab value="pwd">Passwort</v-tab>
        </v-tabs>
      </div>

      <!-- scrollbarer Inhalt -->
      <div class="content-scroll flex-grow-1 overflow-auto pa-4">
        <v-window v-model="tab">
          <v-window-item value="prod">
            <KonfigProduktionsbuch ref="pbRef" />
          </v-window-item>
          <v-window-item value="mitarbeiter">
            <KonfigMitarbeiter ref="mitarbeiterRef" />
          </v-window-item>
          <v-window-item value="schema">
            <KonfigNamensschema ref="schemaRef" />
          </v-window-item>
          <v-window-item value="paths">
            <KonfigPfade ref="pfadeRef" />
          </v-window-item>
          <v-window-item value="module">
            <KonfigModule ref="moduleRef" />
          </v-window-item>
          <v-window-item value="pwd">
            <KonfigPasswort ref="pwRef" />
          </v-window-item>
        </v-window>
      </div>

      <!-- sticky actions unten -->
      <div class="sticky-bottom-bar d-flex justify-end ga-2">
        <v-btn variant="outlined" @click="onCancel">Abbrechen</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="authOpen" @click="onSave">Speichern</v-btn>
      </div>
    </div>

    <!-- Passwort-Dialog -->
    <v-dialog v-model="authOpen" persistent max-width="420">
      <v-card @keydown.esc="cancelAuth">
        <v-card-title class="text-h6">Konfiguration entsperren</v-card-title>
        <v-card-text>
          <v-alert v-if="authError" type="error" class="mb-3">{{ authError }}</v-alert>
          <v-text-field
            ref="pwField"
            v-model="authPassword"
            :type="showPw ? 'text' : 'password'"
            label="Passwort"
            autofocus
            @keyup.enter="authenticate"
            @keydown="onPwKey"
            @keyup="onPwKey"
            :append-inner-icon="showPw ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPw = !showPw"
          />
          <div v-if="capsOn" class="text-warning text-caption mt-1">
            Achtung: Feststelltaste (Caps Lock) ist aktiv
          </div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="cancelAuth">Abbrechen</v-btn>
          <v-btn color="primary" :loading="authLoading" :disabled="!canSubmit" @click="authenticate">
            Entsperren
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import KonfigProduktionsbuch from '@/components/KonfigProduktionsbuch.vue'
import KonfigMitarbeiter from '@/components/KonfigMitarbeiter.vue'
import KonfigPfade from '@/components/KonfigPfade.vue'
import KonfigPasswort from '@/components/KonfigPasswort.vue'
import KonfigNamensschema from '@/components/KonfigNamensschema.vue'
import KonfigModule from '@/components/KonfigModule.vue'

import { backend } from '@/lib/backend'

/** Speichert einen Bereich. Hat jemand die Daten zwischenzeitlich geändert, wird neu geladen. */
async function saveVersioned (save, reload, conflictText) {
  try {
    await save()
  } catch (e) {
    if (e.code !== 'version_conflict' && e.code !== 'version_required') throw e
    await reload()
    alert(conflictText)
    return false
  }
  await reload()
  return true
}

const pbRef = ref<any>(null)
const mitarbeiterRef = ref<any>(null)
const pfadeRef = ref<any>(null)
const pwRef = ref<any>(null)
const schemaRef = ref<any>(null)
const moduleRef = ref<any>(null)
const tab = ref('prod')
const saving = ref(false)

/* Speichern */
async function onSave() {
  let dirtySomething = false

  // Prüfen, ob Produktionsbuch Änderungen hat
  if (pbRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Mitarbeiter Änderungen hat
  if (mitarbeiterRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Pfade Änderungen hat und gültig ist
  if (pfadeRef.value?.isDirty()) {
    if (!pfadeRef.value.isPfadeValid()) {
      alert('Bitte alle Pfade ausfüllen.')
      saving.value = false
      return
    }
    dirtySomething = true
  }
  // Prüfen, ob Passwort Änderungen hat
  if (pwRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Schema Änderungen hat und gültig ist
  if (schemaRef.value?.isDirty()) {
    if (!schemaRef.value.isSchemaValid()) {
      alert('Bitte alle Felder im Schema ausfüllen.')
      saving.value = false
      return
    }
    dirtySomething = true
  }

  // Prüfen, ob Module Änderungen hat und gültig ist
  if (moduleRef.value?.isDirty()) {
    if (!moduleRef.value.isSoundminerValid()) {
      alert('Bitte Pfad und Version für Soundminer angeben.')
      saving.value = false
      return
    }
    dirtySomething = true
  }

  // Falls nichts geändert: Fenster schließen
  if (!dirtySomething) {
    window.close?.()
    return
  }

  saving.value = true
  // Für die Fehlermeldung: Welcher Bereich wird gerade gespeichert?
  let section = ''
  try {
    // Produktionsbuch speichern
    if (pbRef.value?.isDirty()) {
      section = 'Produktionsbuch'
      const saved = await saveVersioned(
        () => backend.saveSnapshot(pbRef.value.getSnapshotForSave()),
        () => pbRef.value.resetToServer(),
        'Das Produktionsbuch wurde zwischenzeitlich geändert, auch ein anderer Rechner kann das sein. Ansicht aktualisiert.',
      )
      if (!saved) return
    }

    // Pfade speichern
    if (pfadeRef.value?.isDirty()) {
      section = 'Pfade'
      const saved = await saveVersioned(
        () => backend.savePaths(pfadeRef.value.getSnapshotForSave()),
        () => pfadeRef.value.resetToServer(),
        'Pfade wurden zwischenzeitlich geändert. Ansicht aktualisiert.',
      )
      if (!saved) return
    }

    // Mitarbeiter speichern
    if (mitarbeiterRef.value?.isDirty()) {
      section = 'Mitarbeiter'
      await backend.saveUsers(mitarbeiterRef.value.getSnapshotForSave())
      await mitarbeiterRef.value.resetToServer()
    }
    // Passwort
    if (pwRef.value?.isDirty()) {
      section = 'Passwort'
      await pwRef.value.saveToServer()
    }

    // Schema
    if (schemaRef.value?.isDirty()) {
      section = 'Namensschema'
      const saved = await saveVersioned(
        () => backend.saveSchema(schemaRef.value.getSnapshotForSave()),
        () => schemaRef.value.resetToServer(),
        'Das Namensschema wurde zwischenzeitlich geändert, auch ein anderer Rechner kann das sein. Ansicht aktualisiert.',
      )
      if (!saved) return
    }

    // Module
    if (moduleRef.value?.isDirty()) {
      section = 'Module'
      const saved = await saveVersioned(
        () => backend.saveModules(moduleRef.value.getSnapshotForSave()),
        () => moduleRef.value.resetToServer(),
        'Module wurden zwischenzeitlich geändert. Ansicht aktualisiert.',
      )
      if (!saved) return
    }

    // Wenn alles erfolgreich war → Fenster schließen
    window.close?.()

  } catch (e) {
    console.error(e)
    alert(`Speichern fehlgeschlagen (${section}): ${e.message}`)
  } finally {
    saving.value = false
  }
}

/* Abbrechen = lokale Änderungen verwerfen */
async function onCancel() {
  await pbRef.value?.resetToServer()
  await pfadeRef.value?.resetToServer()
  await pwRef.value?.resetToServer()
  await schemaRef.value?.resetToServer()
  await mitarbeiterRef.value?.resetToServer()
  await moduleRef.value?.resetToServer()
  window.close?.()
}

/* Passwort-Dialog (gegen /api/check-password) */
const authOpen = ref(true)
const authPassword = ref('')
const authError = ref('')
const authLoading = ref(false)
const showPw = ref(false)
const capsOn = ref(false)
const pwField = ref<any>(null)

const canSubmit = computed(() => !!authPassword.value && !authLoading.value)
function focusPw(){ nextTick(() => pwField.value?.focus()) }
onMounted(async () => {
  document.title = 'Konfiguration'
  // Ohne gesetztes Passwort ist die Konfiguration offen
  if (!(await backend.isPasswordSet())) authOpen.value = false
  if (authOpen.value) focusPw()
})

function onPwKey(ev){ try { capsOn.value = !!ev.getModifierState?.('CapsLock') } catch {} }

/** Abbrechen oder Esc im Passwort-Dialog: Ohne Passwort gibt es hier nichts zu tun, das Fenster schließt. */
function cancelAuth() {
  window.close?.()
}

async function authenticate() {
  authError.value = ''; authLoading.value = true
  try {
    if (!(await backend.checkPassword(authPassword.value))) throw new Error('Passwort falsch')
    authOpen.value = false
  } catch (e) {
    authError.value = e.message || 'Passwort falsch'
    authPassword.value = ''; focusPw()
  } finally {
    authLoading.value = false
  }
}
</script>
<route lang="json">
{ "meta": { "hideChrome": true } }
</route>