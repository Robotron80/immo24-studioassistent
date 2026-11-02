<template>
  <v-app-bar app flat density="comfortable" height="64" class="border-b">
    <v-toolbar-title class="toolbar-title">immo24 Studioassistent</v-toolbar-title>

    <v-tabs
      :model-value="$route.path"
      class="mx-auto flex-grow-1 d-none d-sm-flex"
      align-tabs="center"
      grow
      height="64"
      slider-color="primary"
    >
      <v-tab :value="'/projektanlage'" :to="{ path: '/projektanlage' }">Projektanlage</v-tab>
      <v-tab :value="'/protools'" :to="{ path: '/protools' }">Pro Tools</v-tab>
      <v-tab v-if="soundminerEnabled" :value="'/soundminer'" :to="{ path: '/soundminer' }">Soundminer</v-tab>
    </v-tabs>

    <v-spacer />

    <div class="d-flex align-center ga-2">
      <v-chip :color="isLoggedIn ? 'primary' : undefined" variant="outlined" size="small">
        {{ displayName }}
      </v-chip>
      <v-btn size="small" variant="text" :disabled="!isLoggedIn || loggingOut" @click="onLogout">
        Abmelden
      </v-btn>
    </div>
  </v-app-bar>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const activeUser  = ref(null)
const loggingOut  = ref(false)
const isLoggedIn  = computed(() => !!activeUser.value)
const displayName = computed(() => activeUser.value || 'Nicht angemeldet')
const soundminerEnabled = ref(false)

const API = import.meta.env.VITE_API_BASE || '/api'

onMounted(() => {
  fetchActiveUser()
  fetchModuleStatus()
})

async function fetchActiveUser() {
  try {
    const res = await fetch(`${API}/activeUser`)
    if (res.ok) {
      const text = await res.text()
      // Wenn der Text wie HTML aussieht, als "Nicht angemeldet" anzeigen
      if (text.trim().startsWith('<!DOCTYPE html>')) {
        activeUser.value = null
      } else {
        activeUser.value = text.trim() || null
      }
    } else {
      activeUser.value = null
    }
  } catch {
    activeUser.value = null
  }
}

async function fetchModuleStatus() {
  try {
    const res = await fetch(`${API}/modules`)
    if (res.ok) {
      const data = await res.json()
      soundminerEnabled.value = !!data?.data?.soundminer?.enabled
    }
  } catch {
    soundminerEnabled.value = false
  }
}

async function onLogout() {
  loggingOut.value = true
  try {
    // Backend-Logout ausführen
    await fetch(`${API}/logout`, { method: 'POST' })
    activeUser.value = null
    // Picker anzeigen
    if (window.electronAPI?.hideAndOpenPicker) {
      await window.electronAPI.hideAndOpenPicker({ doLogout: true })
    }
  } catch (e) {
    console.error('[Renderer] Logout failed', e)
  } finally {
    loggingOut.value = false
  }
}
</script>

<style scoped>
.border-b { border-bottom: 1px solid rgba(0,0,0,0.08); }
.toolbar-title {
  min-width: 240px;
  max-width: 100vw;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: visible;
  text-overflow: unset;
}
</style>