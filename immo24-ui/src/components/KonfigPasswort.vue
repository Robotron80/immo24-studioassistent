<template>
  <v-card flat>
    <v-card-text>
      <v-row class="gap-4" no-gutters>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="form.newPassword"
            :type="show1 ? 'text' : 'password'"
            label="Neues Passwort"
            density="comfortable"
            :append-inner-icon="show1 ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="show1 = !show1"
          />
        </v-col>

        <v-col cols="12" md="6">
          <v-text-field
            v-model="form.repeatPassword"
            :type="show2 ? 'text' : 'password'"
            label="Neues Passwort wiederholen"
            density="comfortable"
            :append-inner-icon="show2 ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="show2 = !show2"
          />
        </v-col>
      </v-row>

      <v-alert v-if="error" type="error" class="mt-3">{{ error }}</v-alert>
      <v-alert v-if="okMsg" type="success" class="mt-3">{{ okMsg }}</v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { reactive, ref } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'

const original = { newPassword: '', repeatPassword: '' }
const form = reactive({ newPassword: '', repeatPassword: '' })
const error = ref('')
const okMsg = ref('')
const show1 = ref(false)
const show2 = ref(false)

const deepEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b)

function isDirty() {
  return !deepEqual(form, original)
}

async function saveToServer() {
  error.value = ''; okMsg.value = ''
  const newPassword = (form.newPassword || '').trim()
  const repeatPassword = (form.repeatPassword || '').trim()

  // einfache Client-Validierung
  if (!newPassword || !repeatPassword) {
    error.value = 'Bitte beide Felder ausfüllen.'
    throw new Error('validation')
  }
  if (newPassword !== repeatPassword) {
    error.value = 'Passwörter stimmen nicht überein.'
    throw new Error('validation')
  }

  const res = await fetch(`${API}/adminpw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, repeatPassword })
  })

  let data = {}
  try { data = await res.json() } catch {}

  if (!res.ok || !data.ok) {
    error.value = data?.error || `HTTP ${res.status}`
    throw new Error(error.value)
  }

  okMsg.value = 'Passwort wurde gespeichert.'
  form.newPassword = ''
  form.repeatPassword = ''
}

async function resetToServer() {
  // Für Passwort gibt es keinen „load“ – wir leeren einfach das Formular.
  form.newPassword = ''
  form.repeatPassword = ''
  error.value = ''; okMsg.value = ''
}

defineExpose({ isDirty, saveToServer, resetToServer })
</script>