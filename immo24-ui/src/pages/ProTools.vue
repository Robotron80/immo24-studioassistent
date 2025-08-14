<template>
  <v-container fluid class="pa-4">

    <!-- Kopf: Titel + Ampel -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-3">
        <v-icon size="24">mdi-dots-grid</v-icon>
        <div>
          <div class="text-subtitle-1 font-weight-medium">Pro Tools Presets</div>
          <div class="text-caption text-medium-emphasis">Auswahl unten, dann Store/Recall</div>
        </div>
      </div>
      <div class="d-flex align-center ga-2">
        <span :class="['status-dot', isOnline ? 'online' : 'offline']"></span>
        <span class="text-body-2">{{ isOnline ? 'Pro Tools läuft' : 'Pro Tools nicht geöffnet' }}</span>
      </div>
    </div>

    <!-- Kategorie 1 -->
    <v-card class="mb-3" outlined>
      <v-card-title class="py-2 text-subtitle-2 font-weight-medium">Kategorie 1</v-card-title>
      <v-divider />
      <v-list density="compact">
        <v-list-item v-for="item in cat1" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Kategorie 2 -->
    <v-card class="mb-3" outlined>
      <v-card-title class="py-2 text-subtitle-2 font-weight-medium">Kategorie 2</v-card-title>
      <v-divider />
      <v-list density="compact">
        <v-list-item v-for="item in cat2" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
          <template #append>
            <v-checkbox
              v-model="item.quick"
              label="Quick Presets"
              hide-details
              density="compact"
              :disabled="!item.selected"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Kategorie 3 -->
    <v-card class="mb-3" outlined>
      <v-card-title class="py-2 text-subtitle-2 font-weight-medium">Kategorie 3</v-card-title>
      <v-divider />
      <v-list density="compact">
        <v-list-item v-for="item in cat3" :key="item.key">
          <template #prepend>
            <v-checkbox v-model="item.selected" hide-details :label="item.label" density="compact" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Sticky Action-Bar -->
    <div class="actions-sticky d-flex justify-end ga-2">
      <v-btn variant="outlined" :disabled="!anySelected" @click="onRecallAll">Recall</v-btn>
      <v-btn color="primary" :disabled="!anySelected" @click="onStoreAll">Store</v-btn>
    </div>

    <v-snackbar v-model="snack.open" timeout="2000">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'
const POLL_MS = 3000
const isOnline = ref(false)
let pollTimer = null

// Daten
const cat1 = reactive([
  { key: 'templates', label: 'Templates', selected: false },
  { key: 'trackPresets', label: 'Track Presets', selected: false },
  { key: 'pluginSettings', label: 'Plug-In Settings', selected: false }
])
const cat2 = reactive([
  { key: 'fadePresets', label: 'Fade Presets', selected: false, quick: false },
  { key: 'clipFxPresets', label: 'Clip Effects Presets', selected: false, quick: false },
  { key: 'memoryLocation', label: 'Memory Location Presets', selected: false, quick: false },
  { key: 'trackDataToRecall', label: 'Track Data to Recall Presets', selected: false, quick: false }
])
const cat3 = reactive([
  { key: 'keyboardShortcuts', label: 'Keyboard Shortcuts', selected: false },
  { key: 'pluginMaps', label: 'Plug-In Maps', selected: false }
])

const anySelected = computed(() =>
  [...cat1, ...cat2, ...cat3].some(i => i.selected)
)

const snack = reactive({ open: false, text: '' })

function onRecallAll() { sendAction('recall') }
function onStoreAll() { sendAction('store') }

async function sendAction(action) {
  const payload = {
    action,
    categories: {
      cat1: cat1.filter(i => i.selected).map(i => ({ key: i.key })),
      cat2: cat2.filter(i => i.selected).map(i => ({ key: i.key, quick: !!i.quick })),
      cat3: cat3.filter(i => i.selected).map(i => ({ key: i.key }))
    }
  }
  try {
    const res = await fetch(`${API}/protools/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error(await res.text())
    snack.text = `Aktion "${action}" ausgeführt`
    snack.open = true
  } catch (e) {
    snack.text = 'Fehler: ' + (e.message || 'Aktion fehlgeschlagen')
    snack.open = true
  }
}

// Status-Poll
async function pollStatus() {
  try {
    const res = await fetch(`${API}/protools/status`)
    const data = await res.json()
    isOnline.value = !!data?.online
  } catch {
    isOnline.value = false
  }
}
onMounted(() => {
  pollStatus()
  pollTimer = setInterval(pollStatus, POLL_MS)
})
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<style scoped>
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.online { background-color: #4caf50; }
.status-dot.offline { background-color: #f44336; }
.actions-sticky {
  position: sticky;
  bottom: 0;
  padding: 12px 16px;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(0,0,0,.08);
}
</style>