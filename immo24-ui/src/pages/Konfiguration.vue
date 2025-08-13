<template>
  <v-container fluid class="pa-0 ma-0 settings-root">
    <div class="d-flex flex-column h-100 w-100">

      <!-- scrollbarer inhalt -->
      <div class="content-scroll flex-grow-1 overflow-auto pa-4">
        <v-tabs v-model="tab" class="mb-4">
          <v-tab value="prod">Produktionsbuch</v-tab>
          <v-tab value="schema">Namensschema</v-tab>
          <v-tab value="paths">Pfade</v-tab>
          <v-tab value="pwd">Passwort</v-tab>
        </v-tabs>

        <v-window v-model="tab">
          <v-window-item value="prod">
            <KonfigProduktionsbuch ref="pbRef" />
          </v-window-item>
          <v-window-item value="schema">
            <KonfigNamensschema ref="schemaRef" />
          </v-window-item>
          <v-window-item value="paths">
            <KonfigPfade ref="pfadeRef" />
          </v-window-item>
          <v-window-item value="pwd">
            <KonfigPasswort ref="pwRef" />
          </v-window-item>
        </v-window>
      </div>

      <!-- sticky actions unten -->
      <div class="actions-sticky d-flex justify-end ga-2">
        <v-btn variant="outlined" @click="onCancel">Abbrechen</v-btn>
        <v-btn color="primary" :loading="saving" :disabled="authOpen" @click="onSave">Speichern</v-btn>
      </div>
    </div>

    <!-- Passwort-Dialog -->
    <v-dialog v-model="authOpen" persistent max-width="420">
      <v-card>
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
          <v-btn color="primary" :loading="authLoading" :disabled="!canSubmit" @click="authenticate">
            Entsperren
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import KonfigProduktionsbuch from '@/components/KonfigProduktionsbuch.vue'
import KonfigPfade from '@/components/KonfigPfade.vue'
import KonfigPasswort from '@/components/KonfigPasswort.vue'
import KonfigNamensschema from '@/components/KonfigNamensschema.vue'

const API = import.meta.env.VITE_API_BASE || '/api'
const pbRef = ref(null)
const pfadeRef = ref(null)
const pwRef = ref(null)
const schemaRef = ref(null)
const tab = ref('prod')
const saving = ref(false)

/* Speichern */
async function onSave() {
  let dirtySomething = false

  // Prüfen, ob Produktionsbuch Änderungen hat
  if (pbRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Pfade Änderungen haben
  if (pfadeRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Passwort Änderungen hat
  if (pwRef.value?.isDirty()) dirtySomething = true

  // Prüfen, ob Schema Änderungen hat
  if (schemaRef.value?.isDirty()) dirtySomething = true

  // Falls nichts geändert: Fenster schließen
  if (!dirtySomething) {
    window.close?.()
    return
  }

  saving.value = true
  try {
    // Produktionsbuch speichern
    if (pbRef.value?.isDirty()) {
      const snap = pbRef.value.getSnapshotForSave()
      const res = await fetch(`${API}/pb/snapshot`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap)
      })
      if (res.status === 409) {
        await pbRef.value.resetToServer()
        alert('Produktionsbuch wurde zwischenzeitlich geändert. Ansicht aktualisiert.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      await pbRef.value.resetToServer()
    }

    // Pfade speichern
    if (pfadeRef.value?.isDirty()) {
      const snap = pfadeRef.value.getSnapshotForSave()
      const res = await fetch(`${API}/paths`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap)
      })
      if (res.status === 409) {
        await pfadeRef.value.resetToServer()
        alert('Pfade wurden zwischenzeitlich geändert. Ansicht aktualisiert.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      await pfadeRef.value.resetToServer()
    }

    // Passwort
    if (pwRef.value?.isDirty()) {
      await pwRef.value.saveToServer()
    }

    // Schema
    if (schemaRef.value?.isDirty()) {
      const snap = schemaRef.value.getSnapshotForSave()
      const res = await fetch(`${API}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap)
      })
      if (!res.ok) throw new Error(await res.text())
      await schemaRef.value.resetToServer()
    }

    // Wenn alles erfolgreich war → Fenster schließen
    window.close?.()

  } catch (e) {
    console.error(e)
    alert('Speichern fehlgeschlagen.')
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
  window.close?.()
}

/* Passwort-Dialog (gegen /api/check-password) */
const authOpen = ref(true)
const authPassword = ref('')
const authError = ref('')
const authLoading = ref(false)
const showPw = ref(false)
const capsOn = ref(false)
const pwField = ref(null)

const canSubmit = computed(() => !!authPassword.value && !authLoading.value)
function focusPw(){ nextTick(() => pwField.value?.focus()) }
onMounted(() => { document.title = 'Konfiguration'; if (authOpen.value) focusPw() })

function onPwKey(ev){ try { capsOn.value = !!ev.getModifierState?.('CapsLock') } catch {} }

async function authenticate() {
  authError.value = ''; authLoading.value = true
  try {
    const res = await fetch(`${API}/check-password`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ password: authPassword.value })
    })
    const data = await res.json().catch(()=> ({}))
    if (!res.ok || !data.ok) throw new Error('Passwort falsch')
    authOpen.value = false
  } catch (e) {
    authError.value = e.message || 'Passwort falsch'
    authPassword.value = ''; focusPw()
  } finally {
    authLoading.value = false
  }
}
</script>

<style scoped>
.settings-root { height: 100vh; width: 100vw; }
.actions-sticky {
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(0,0,0,.08);
}
:deep(.v-container) { max-width: none; }
</style>

<route lang="json">
{ "meta": { "hideChrome": true } }
</route>