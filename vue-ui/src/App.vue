<template>
  <v-app>
    <v-app-bar
      app
      color="#f7f8fa"
      flat
      elevation="3"
      style="padding-left:30px; padding-right:30px;"
    >
      <span class="app-title" style="color: #23272e;">immo24 Studioassistent</span>
      <v-spacer />
      <template v-if="activeUser">
        <v-tabs 
          v-model="tab" 
          class="pill-tabs" 
          style="margin-bottom: 8px;"
        >
          <v-tab value="projektanlage">Projektanlage</v-tab>
          <v-tab value="protools">Pro Tools</v-tab>
        </v-tabs>
        <v-spacer />

        <span style="color:#23272e;">Angemeldet als: <b>{{ activeUser }}</b></span>
        <v-btn color="#eaeaea" class="ml-4" style="color:#23272e;" @click="logout">Abmelden</v-btn>
      </template>
      <template v-else>
        <span style="color:#23272e;">Nicht angemeldet</span>

        

      </template>
    </v-app-bar>

  </v-app>
</template>


<script setup>
import { ref, watch, onMounted } from 'vue'

const activeUser = ref(null)
const tab = ref('projektanlage')

let ws = null

function connectWS() {
  ws = new WebSocket("ws://localhost:1880/ws/activeUser")
  ws.onopen = () => { }
  ws.onmessage = event => {
    const data = JSON.parse(event.data)
    activeUser.value = data.activeUser
  }
  ws.onclose = () => {
    setTimeout(connectWS, 1500)
  }
}

onMounted(connectWS)

watch(tab, (newTab, oldTab) => {
  window.parent.postMessage({ type: 'switch-tab', tab: newTab }, '*')
})

async function logout() {
  await fetch('http://localhost:1880/logout', { method: 'POST' })
  activeUser.value = null
  // Dashboard-iframe leeren
  window.parent.postMessage({ type: 'logout' }, '*')
}
</script>