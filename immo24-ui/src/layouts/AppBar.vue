<template>
  <v-app-bar app flat density="comfortable" height="64" class="border-b">
    <v-toolbar-title class="text-no-wrap">immo24 Studioassistent</v-toolbar-title>

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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const activeUser  = ref(null)
const loggingOut  = ref(false)
const isLoggedIn  = computed(() => !!activeUser.value)
const displayName = computed(() => activeUser.value || 'Nicht angemeldet')

let ws = null
let reconnectTimer = null

function resolveWsUrl() {
  const env = import.meta.env.VITE_WS_URL
  // ENV gesetzt?
  if (env) {
    // Relativer Pfad -> zu absoluter URL machen (Dev via Vite-Proxy)
    if (env.startsWith('/')) {
      const origin = (typeof window !== 'undefined' && window.location?.origin)
        ? window.location.origin
        : 'http://127.0.0.1:3000' // Fallback für Sicherheit
      return origin.replace(/^http/, 'ws') + env
    }
    // Bereits absolut (ws:// oder wss://)
    return env
  }
  // Kein ENV -> zur Laufzeit aus origin ableiten oder Electron-Fallback
  if (location.protocol.startsWith('http')) {
    return `${location.origin.replace(/^http/, 'ws')}/ws/activeUser`
  }
  return 'ws://127.0.0.1:1880/ws/activeUser'
}

function connectWS() {
  const url = resolveWsUrl()
  console.info('[WS] connecting to:', url)

  try {
    ws = new WebSocket(url)
  } catch (e) {
    console.warn('[WS] ctor error', e)
    return scheduleReconnect()
  }

  ws.onopen = () => console.info('[WS] connected')

  ws.onmessage = (ev) => {
    console.info('[WS] message', ev.data)
    try {
      const data = JSON.parse(ev.data)
      activeUser.value = data.activeUser || data.user || data.username || null
    } catch {
      activeUser.value = null
    }
  }

  ws.onerror = (e) => { console.warn('[WS] error', e); try { ws.close() } catch {} }
  ws.onclose = () => { console.warn('[WS] closed — retry in 2000ms'); scheduleReconnect() }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connectWS, 2000)
}

onMounted(connectWS)
onBeforeUnmount(() => { try { ws?.close() } catch {}; clearTimeout(reconnectTimer) })

async function onLogout() {
  loggingOut.value = true
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })
    activeUser.value = null
    scheduleReconnect()
  } finally {
    loggingOut.value = false
  }
}
</script>
<style scoped>
.border-b { border-bottom: 1px solid rgba(0,0,0,0.08); }
</style>