<template>
  <v-container fluid class="pa-4">
    <!-- Kopf: Titel + Ampel -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-3">
        <v-icon size="26">mdi-dots-grid</v-icon>
        <div>
          <div class="text-subtitle-1 font-weight-medium">Pro Tools Presets</div>
          <div class="text-caption text-medium-emphasis">
            Store & Recall gängiger Voreinstellungen
          </div>
        </div>
      </div>
      <div class="d-flex align-center ga-2">
        <span :class="['status-dot', isOnline ? 'online' : 'offline']"></span>
        <span class="text-body-2">{{ isOnline ? 'Pro Tools läuft' : 'Pro Tools nicht erreichbar' }}</span>
      </div>
    </div>

    <v-row class="ga-4">
      <!-- Kategorie 1 -->
      <v-col cols="12" md="4">
        <v-card class="preset-card">
          <v-card-item>
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center ga-2">
                <v-icon>mdi-folder-cog</v-icon>
                <span class="text-subtitle-1">Kategorie 1</span>
              </div>
              <div class="d-flex ga-2">
                <v-btn size="small" variant="text" @click="selectAll('cat1')">Alles</v-btn>
                <v-btn size="small" variant="text" @click="clearAll('cat1')">Reset</v-btn>
              </div>
            </div>
          </v-card-item>
          <v-divider />
          <v-card-text class="py-2">
            <v-list density="comfortable" class="no-border">
              <v-list-item v-for="item in cat1.items" :key="item.key">
                <template #prepend>
                  <v-checkbox v-model="item.selected" hide-details :label="item.label" />
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
          <v-divider />
          <v-card-actions class="justify-end">
            <v-btn variant="outlined" :disabled="!hasSelection('cat1')" @click="onRecall('cat1')">Recall</v-btn>
            <v-btn color="primary" :disabled="!hasSelection('cat1')" @click="onStore('cat1')">Store</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Kategorie 2 -->
      <v-col cols="12" md="4">
        <v-card class="preset-card">
          <v-card-item>
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center ga-2">
                <v-icon>mdi-tune-variant</v-icon>
                <span class="text-subtitle-1">Kategorie 2</span>
              </div>
              <div class="d-flex ga-2">
                <v-btn size="small" variant="text" @click="selectAll('cat2')">Alles</v-btn>
                <v-btn size="small" variant="text" @click="clearAll('cat2')">Reset</v-btn>
              </div>
            </div>
          </v-card-item>
          <v-divider />
          <v-card-text class="py-2">
            <v-list density="comfortable" class="no-border">
              <v-list-item v-for="item in cat2.items" :key="item.key">
                <template #prepend>
                  <v-checkbox v-model="item.selected" hide-details :label="item.label" />
                </template>
                <template #append>
                  <v-checkbox
                    v-model="item.quick"
                    :disabled="!item.selected"
                    hide-details
                    label="Quick"
                    class="quick-box"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
          <v-divider />
          <v-card-actions class="justify-end">
            <v-btn variant="outlined" :disabled="!hasSelection('cat2')" @click="onRecall('cat2')">Recall</v-btn>
            <v-btn color="primary" :disabled="!hasSelection('cat2')" @click="onStore('cat2')">Store</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Kategorie 3 -->
      <v-col cols="12" md="4">
        <v-card class="preset-card">
          <v-card-item>
            <div class="d-flex align-center justify-space-between">
              <div class="d-flex align-center ga-2">
                <v-icon>mdi-keyboard-settings-outline</v-icon>
                <span class="text-subtitle-1">Kategorie 3</span>
              </div>
              <div class="d-flex ga-2">
                <v-btn size="small" variant="text" @click="selectAll('cat3')">Alles</v-btn>
                <v-btn size="small" variant="text" @click="clearAll('cat3')">Reset</v-btn>
              </div>
            </div>
          </v-card-item>
          <v-divider />
          <v-card-text class="py-2">
            <v-list density="comfortable" class="no-border">
              <v-list-item v-for="item in cat3.items" :key="item.key">
                <template #prepend>
                  <v-checkbox v-model="item.selected" hide-details :label="item.label" />
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
          <v-divider />
          <v-card-actions class="justify-end">
            <v-btn variant="outlined" :disabled="!hasSelection('cat3')" @click="onRecall('cat3')">Recall</v-btn>
            <v-btn color="primary" :disabled="!hasSelection('cat3')" @click="onStore('cat3')">Store</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="snack.open" timeout="2500">
      {{ snack.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'
const POLL_MS = 3000

// --- Kategorien ---
const cat1 = reactive({
  items: [
    { key: 'templates',      label: 'Templates',        selected: false },
    { key: 'trackPresets',   label: 'Track Presets',    selected: false },
    { key: 'pluginSettings', label: 'Plug‑In Settings', selected: false },
  ],
})
const cat2 = reactive({
  items: [
    { key: 'fadePresets',       label: 'Fade Presets',                 selected: false, quick: false },
    { key: 'clipFxPresets',     label: 'Clip Effects Presets',         selected: false, quick: false },
    { key: 'memoryLocation',    label: 'Memory Location Presets',      selected: false, quick: false },
    { key: 'trackDataToRecall', label: 'Track Data to Recall Presets', selected: false, quick: false },
  ],
})
const cat3 = reactive({
  items: [
    { key: 'keyboardShortcuts', label: 'Keyboard Shortcuts', selected: false },
    { key: 'pluginMaps',        label: 'Plug‑In Maps',       selected: false },
  ],
})

// --- Ampel ---
const isOnline = ref(false)
let timer = null
async function checkStatus() {
  try {
    const res = await fetch(`${API}/protools/status`, { method: 'GET' })
    isOnline.value = res.ok
  } catch { isOnline.value = false }
}
onMounted(() => {
  checkStatus()
  timer = setInterval(checkStatus, POLL_MS)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// --- UI helpers ---
function getList(catKey) {
  return catKey === 'cat1' ? cat1.items : catKey === 'cat2' ? cat2.items : cat3.items
}
function hasSelection(catKey) { return getList(catKey).some(i => i.selected) }
function selectAll(catKey)    { getList(catKey).forEach(i => (i.selected = true)) }
function clearAll(catKey)     { getList(catKey).forEach(i => { i.selected = false; if ('quick' in i) i.quick = false }) }

function buildPayload(catKey, action) {
  const items = getList(catKey)
    .filter(i => i.selected)
    .map(i => ({ key: i.key, ...(catKey === 'cat2' ? { quick: !!i.quick } : {}) }))
  return { category: catKey, action, items }
}

const snack = reactive({ open: false, text: '' })
function toast(t){ snack.text = t; snack.open = true }

async function onStore(catKey) {
  const payload = buildPayload(catKey, 'store')
  // Hier später echten Call hinterlegen:
  // await fetch(`${API}/protools/store`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
  console.log('[STORE]', payload)
  toast(`Store: ${payload.items.map(i => i.key).join(', ') || '–'}`)
}
async function onRecall(catKey) {
  const payload = buildPayload(catKey, 'recall')
  // await fetch(`${API}/protools/recall`, {...})
  console.log('[RECALL]', payload)
  toast(`Recall: ${payload.items.map(i => i.key).join(', ') || '–'}`)
}
</script>

<style scoped>
.preset-card {
  border-radius: 14px;
  overflow: hidden;
}
.no-border {
  --v-theme-overlay-multiplier: 0;
}
.status-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0,0,0,.12);
}
.status-dot.online { background: #2e7d32; }  /* grün */
.status-dot.offline { background: #c62828; } /* rot */
.quick-box :deep(.v-selection-control__wrapper) {
  margin-inline-start: 8px;
}
</style>