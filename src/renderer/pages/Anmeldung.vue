<template>
  <v-container class="drag-region fill-height pa-6">
    <div class="w-100">
      <div class="d-flex align-center ga-3 mb-4">
        <img :src="logo" alt="" width="48" height="48" />
        <div class="text-h6">immo24 Studioassistent</div>
      </div>
      <v-select v-model="selected" :items="users" label="Mitarbeiter*in" autofocus @keyup.enter="login" />
      <v-btn block color="primary" :disabled="!selected" class="mb-2" @click="login">Anmelden</v-btn>
      <v-btn block variant="text" @click="quit">Beenden</v-btn>
    </div>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Das Anmeldefenster: Mitarbeiter wählen, danach öffnet der Hauptprozess das Hauptfenster.
 * Die Liste liest die Seite selbst, also immer aktuell, auch nach der Konfiguration.
 */
import { onMounted, ref } from 'vue'

import logo from '../../../assets/icon.png'
import { backend } from '@/lib/backend'

const users = ref<string[]>([])
const selected = ref<string | null>(null)

onMounted(async () => {
  users.value = (await backend.listUsers()).map((user) => user.name)
  selected.value = users.value[0] ?? null
})

function login() {
  if (selected.value) window.picker.choose(selected.value)
}

function quit() {
  window.picker.quit()
}
</script>
