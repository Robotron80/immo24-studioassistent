<template>
  <v-app-bar app flat height="64" class="border-b">
    <div class="text-h6 text-no-wrap flex-shrink-0 px-4">immo24 Studioassistent</div>

    <v-tabs
      :model-value="$route.path"
      class="mx-auto flex-grow-1 d-none d-sm-flex"
      align-tabs="center"
      grow
      height="64"
      slider-color="primary"
    >
      <v-tab :value="'/projektanlage'" :to="{ path: '/projektanlage' }">Produktionsbuch</v-tab>
      <v-tab :value="'/protools'" :to="{ path: '/protools' }">Pro Tools</v-tab>
      <v-tab v-if="soundminerEnabled" :value="'/soundminer'" :to="{ path: '/soundminer' }">Soundminer</v-tab>
    </v-tabs>

    <v-spacer />

    <!-- Name und Abmelden bilden einen Block: der Name ist nur Anzeige, Abmelden der Knopf -->
    <v-btn-group border divided density="compact" class="me-4 flex-shrink-0">
      <v-btn tag="div" readonly variant="text">{{ displayName }}</v-btn>
      <v-btn color="primary" variant="tonal" :disabled="!isLoggedIn || loggingOut" @click="onLogout">
        Abmelden
      </v-btn>
    </v-btn-group>
  </v-app-bar>
</template>

<script setup lang="ts">
import { backend } from '@/lib/backend'
import { useProjektanlage } from '@/stores/Projektanlage'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const store = useProjektanlage()
const activeUser = computed(() => store.activeUser)
const loggingOut  = ref(false)
let stopListening: any = null
const isLoggedIn  = computed(() => !!activeUser.value)
const displayName = computed(() => activeUser.value || 'Nicht angemeldet')
const soundminerEnabled = ref(false)


onMounted(() => {
  fetchModuleStatus()
  // Ein in der Konfiguration eingeschaltetes Modul soll sofort als Tab erscheinen
  stopListening = window.electronAPI?.onConfigChanged?.(fetchModuleStatus)
})
onBeforeUnmount(() => stopListening?.())

async function fetchModuleStatus() {
  try {
    const modules: any = await backend.getModules()
    soundminerEnabled.value = !!modules?.data?.soundminer?.enabled
  } catch {
    soundminerEnabled.value = false
  }
}

async function onLogout() {
  loggingOut.value = true
  try {
    // Abmelden und zurück zur Anmeldung
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
