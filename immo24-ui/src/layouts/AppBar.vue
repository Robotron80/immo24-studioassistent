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
      <v-tab :value="'/projektneu'" :to="{ path: '/projektneu' }">Projektanlage Neu</v-tab>
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
const reloginInProgress = ref(false)   // verhindert WS-Reconnect während Re-Login
const isLoggedIn  = computed(() => !!activeUser.value)
const displayName = computed(() => activeUser.value || 'Nicht angemeldet')

let ws = null
let reconnectTimer = null

function getApiBase () {
  const env = import.meta.env?.VITE_API_BASE
  if (env) return env.replace(/\/$/, '')
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) return location.origin
  return 'http://127.0.0.1:1880'
}
const API_BASE = getApiBase()

function resolveWsUrl() {
  const env = import.meta.env?.VITE_WS_URL
  if (env) {
    if (/^wss?:\/\//i.test(env)) return env
    const base = (typeof location !== 'undefined' && location.protocol.startsWith('http'))
      ? location.origin
      : API_BASE
    return base.replace(/^http/, 'ws') + (env.startsWith('/') ? env : `/${env}`)
  }
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
    return `${location.origin.replace(/^http/, 'ws')}/ws/activeUser`
  }
  return API_BASE.replace(/^http/, 'ws') + '/ws/activeUser'
}

function connectWS() {
  if (reloginInProgress.value) return
  const url = resolveWsUrl()
  try { ws = new WebSocket(url) } catch (e) {
    console.warn('[WS] ctor error', e)
    return scheduleReconnect()
  }
  ws.onopen = () => console.info('[WS] connected')
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data)
      activeUser.value = data.activeUser || data.user || data.username || null
    } catch { activeUser.value = null }
  }
  ws.onerror = (e) => { console.warn('[WS] error', e); try { ws.close() } catch {} }
  ws.onclose = () => {
    console.warn('[WS] closed')
    if (!reloginInProgress.value) scheduleReconnect()
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connectWS, 2000)
}

onMounted(() => {
  connectWS()

  // Picker-Ende: Main sendet 'active-user', wenn im Picker bestätigt
  const offActive = window.electronAPI?.onActiveUser?.((user) => {
    console.log('[Renderer] active-user event', user)
    activeUser.value = user || null
    reloginInProgress.value = false
    connectWS() // neuen WS starten, weil alter bei Logout beendet wurde
  })

  // Falls du das Unsubscribe nutzen willst:
  onBeforeUnmount(() => {
    if (typeof offActive === 'function') offActive()
  })
})

async function onLogout() {
  loggingOut.value = true
  try {
    // WS aus, keine Reconnects während Re-Login
    clearTimeout(reconnectTimer)
    try { ws?.close() } catch {}
    activeUser.value = null

    console.log('[Renderer] invoking hideAndOpenPicker…')
    const res = await window.electronAPI?.hideAndOpenPicker?.({ doLogout: true })
    console.log('[Renderer] hideAndOpenPicker result:', res)
  } catch (e) {
    console.error('[Renderer] hideAndOpenPicker failed', e)
  } finally {
    loggingOut.value = false
  }
}</script>

<style scoped>
.border-b { border-bottom: 1px solid rgba(0,0,0,0.08); }
</style>