<template>
  <v-card flat>
    <v-card-text>
      <v-text-field
        v-model="form.newPassword"
        :type="show1 ? 'text' : 'password'"
        label="Neues Passwort"
        :append-inner-icon="show1 ? 'mdi-eye-off' : 'mdi-eye'"
        class="mb-3"
        @click:append-inner="show1 = !show1"
      />
      <v-text-field
        v-model="form.repeatPassword"
        :type="show2 ? 'text' : 'password'"
        label="Neues Passwort wiederholen"
        :error-messages="mismatch ? ['Passwörter stimmen nicht überein.'] : []"
        :append-inner-icon="show2 ? 'mdi-eye-off' : 'mdi-eye'"
        class="mb-3"
        @click:append-inner="show2 = !show2"
      />

      <v-alert v-if="error" type="error" class="mt-3">{{ error }}</v-alert>
      <v-alert v-if="okMsg" type="success" class="mt-3">{{ okMsg }}</v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
/**
 * Legt das Passwort für die Konfiguration fest, dort und im Einrichtungsassistenten.
 * Das alte Passwort wird nie angezeigt, das Formular beginnt deshalb immer leer.
 */
import { computed, reactive, ref } from 'vue'

import { backend } from '@/lib/backend'

const original = { newPassword: '', repeatPassword: '' }
const form = reactive({ newPassword: '', repeatPassword: '' })
const error = ref('')
const okMsg = ref('')
const show1 = ref(false)
const show2 = ref(false)

const MIN_LENGTH = 4
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const mismatch = computed(() => !!form.repeatPassword && form.repeatPassword !== form.newPassword)

/** Darf dieses Passwort gespeichert werden? */
function isValid() {
  return form.newPassword.trim().length >= MIN_LENGTH && form.newPassword === form.repeatPassword
}

function isDirty() {
  return !deepEqual(form, original)
}

async function saveToServer() {
  error.value = ''
  okMsg.value = ''
  const newPassword = (form.newPassword || '').trim()
  const repeatPassword = (form.repeatPassword || '').trim()

  if (!newPassword || !repeatPassword) {
    error.value = 'Bitte beide Felder ausfüllen.'
    throw new Error('validation')
  }
  if (newPassword !== repeatPassword) {
    error.value = 'Passwörter stimmen nicht überein.'
    throw new Error('validation')
  }
  if (newPassword.length < MIN_LENGTH) {
    error.value = `Das Passwort braucht mindestens ${MIN_LENGTH} Zeichen.`
    throw new Error('validation')
  }

  try {
    await backend.setPassword({ newPassword, repeatPassword })
  } catch (e) {
    error.value = e.message
    throw e
  }

  okMsg.value = 'Passwort wurde gespeichert.'
  form.newPassword = ''
  form.repeatPassword = ''
}

async function resetToServer() {
  form.newPassword = ''
  form.repeatPassword = ''
  error.value = ''
  okMsg.value = ''
}

defineExpose({ isDirty, isValid, saveToServer, resetToServer })
</script>
