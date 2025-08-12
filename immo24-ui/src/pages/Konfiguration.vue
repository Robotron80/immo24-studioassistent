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
            <KonfigProduktionsbuch />
          </v-window-item>

          <v-window-item value="schema">
            <div class="py-6">[Namensschema – später]</div>
          </v-window-item>

          <v-window-item value="paths">
            <div class="py-6">[Pfade – später]</div>
          </v-window-item>

          <v-window-item value="pwd">
            <div class="py-6">[Passwort ändern – später]</div>
          </v-window-item>
        </v-window>
      </div>

      <!-- sticky actions unten -->
      <div class="actions-sticky d-flex justify-end ga-2">
        <v-btn variant="outlined" @click="onCancel">Abbrechen</v-btn>
        <v-btn color="primary" :loading="saving" @click="onSave">Speichern</v-btn>
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

const tab = ref('prod')
const saving = ref(false)

function onSave(){ /* optional: später */ }
function onCancel(){ window.close?.() }

/* Passwort-Dialog (simple Check gegen /api/check-password) */
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
    const res = await fetch('/api/check-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: authPassword.value })
    })
    const data = await res.json().catch(()=> ({}))
    if (!res.ok || !data.ok) throw new Error('Passwort falsch')
    authOpen.value = false
  } catch (e) {
    authError.value = e.message || 'Passwort falsch'
    authPassword.value = ''; focusPw()
  } finally { authLoading.value = false }
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