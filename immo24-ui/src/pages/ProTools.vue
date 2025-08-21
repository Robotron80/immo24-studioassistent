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

    <!-- Bestätigungs-Dialog -->
    <v-dialog v-model="confirm.open" max-width="400">
      <v-card>
        <v-card-title class="text-h6">{{ confirm.title }}</v-card-title>
        <v-card-text>{{ confirm.text }}</v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="confirmResolve(false)">Abbrechen</v-btn>
          <v-btn color="primary" @click="confirmResolve(true)">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'
const POLL_MS = 3000
const isOnline = ref(false)
let pollTimer = null

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

const snack = reactive({ open: false, text: '', color: 'success' })
const confirm = reactive({
  open: false,
  title: '',
  text: '',
  cb: null
})

async function onRecallAll() {
  const ok = await showConfirm('Recall ausführen?', 'Die ausgewählten Presets werden vom Server auf das lokale System. Vorhandene Dateien werden überschrieben.')
  if (ok) sendAction('recall')
}
async function onStoreAll() {
  const ok = await showConfirm('Store ausführen?', 'Die ausgewählten Presets werden vom lokalen System auf den Server übertragen. Vorhandene Dateien werden überschrieben.')
  if (ok) sendAction('store')
}

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

    const data = await res.json()

    // Backend-Message bevorzugt nutzen
    const text = data.message
      || (data.overall === 'ok'
          ? (data.action === 'store' ? 'Store erfolgreich' : 'Recall erfolgreich')
          : 'Vorgang abgeschlossen – mit Hinweisen')

    // Statusfarbe bestimmen
    if (res.status === 200) {
      snack.color = 'success'
    } else if (res.status === 207) {
      snack.color = 'warning'
    } else {
      snack.color = 'error'
    }

    snack.text = text
    snack.open = true

  } catch (e) {
    snack.color = 'error'
    snack.text = 'Fehler: ' + (e.message || 'Aktion fehlgeschlagen')
    snack.open = true
  }
}

function showConfirm(title, text) {
  confirm.title = title
  confirm.text = text
  confirm.open = true
  return new Promise(resolve => confirm.cb = resolve)
}
function confirmResolve(val) {
  confirm.open = false
  confirm.cb?.(val)
}

onMounted(() => {
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/protools/status`)
      isOnline.value = res.ok && (await res.json()).online
    } catch {
      isOnline.value = false
    }
  }, POLL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.status-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 6px;
  background: #bbb;
  border: 1px solid #888;
  vertical-align: middle;
}
.status-dot.online {
  background: #43a047; /* grün */
  border-color: #388e3c;
}
.status-dot.offline {
  background: #e53935; /* rot */
  border-color: #b71c1c;
}
</style>