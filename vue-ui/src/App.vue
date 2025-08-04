<template>
  <div class="topbar">
    <span class="app-title">immo24 Studioassistent</span>
    <span class="status">
      <template v-if="activeUser">
        Angemeldet als: <b>{{ activeUser }}</b>
        <button @click="logout" class="logout-btn">Abmelden</button>
      </template>
      <template v-else>
        Nicht angemeldet
      </template>
    </span>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
const activeUser = ref(null)
let ws = null

function connectWS() {
  ws = new WebSocket("ws://localhost:1880/ws/activeUser")

  ws.onopen = () => {
    console.log("WebSocket verbunden!")
  }
  ws.onmessage = event => {
    const data = JSON.parse(event.data)
    activeUser.value = data.activeUser
  }
  ws.onclose = () => {
    // Reconnect nach kurzem Timeout
    setTimeout(connectWS, 1500)
  }
}

onMounted(() => {
  connectWS()
})

async function logout() {
  await fetch('http://localhost:1880/logout', { method: 'POST' })
  activeUser.value = null
}
</script>

<style>
body {
  margin: 0;
  width: 100vw;
  height: 60px;
  background: transparent;
  overflow: hidden;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
}

/* Das hier ist die einzige "Leiste"! */
.topbar {
  width: 100vw;
  height: 60px;
  background: #23272e;
  color: #fff;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  padding: 0 30px;
  box-sizing: border-box;
  user-select: none;
  -webkit-app-region: drag; /* Fensterziehbar in Electron */
}
.app-title {
  font-size: 1.22em;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding-top: 1px;
}
.status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 18px;
}
.logout-btn {
  background: #ee4444;
  border: none;
  color: #fff;
  font-size: 1em;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  box-shadow: 0 1px 3px rgba(0,0,0,0.10);
  transition: background 0.15s;
}
.logout-btn:hover {
  background: #c52e2e;
}
</style>
