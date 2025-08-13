<template>
  <v-card flat>
    <v-card-text>
      <v-row class="gap-4" no-gutters>
        <!-- Projektordner -->
        <v-col cols="12" md="6">
          <v-text-field
            v-model="staged.projektordnerSchema"
            label="Projektordner‑Schema"
            density="comfortable"
            clearable
            :disabled="loading"
            hint="Verfügbare Variablen: {{datum}} {{projektname}} {{moid}} {{benutzer}} {{kunde}}"
            persistent-hint
          />
          <div class="text-caption text-medium-emphasis mt-1">
            Vorschau:&nbsp;<code>{{ previewProjektordner }}</code>
          </div>
        </v-col>

        <!-- Session -->
        <v-col cols="12" md="6">
          <v-text-field
            v-model="staged.sessionSchema"
            label="Session‑Schema"
            density="comfortable"
            clearable
            :disabled="loading"
            hint="Verfügbare Variablen: {{datum}} {{projektname}} {{moid}} {{benutzer}} {{kunde}} {{produktionsstufe}} {{version}}"
            persistent-hint
          />
          <div class="text-caption text-medium-emphasis mt-1">
            Vorschau:&nbsp;<code>{{ previewSession }}</code>
          </div>
        </v-col>
      </v-row>

      <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

const API = import.meta.env.VITE_API_BASE || '/api'

// -------- State --------
const loading = ref(false)
const error   = ref('')

// Serverzustand + Arbeitskopie
const original = ref({
  schema: {
    projektordnerSchema: '',
    sessionSchema: ''
  },
  version: ''
})

const staged = reactive({
  projektordnerSchema: '',
  sessionSchema: ''
})

// -------- Utils --------
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.schema))

// Demo-Werte (wie im alten Flow)
const demoValues = {
  datum: '1997-01-23',
  projektname: 'Faszination Falten',
  moid: 'O4BZ',
  benutzer: 'PL',
  kunde: 'SuperVision',
  produktionsstufe: 'Foleys',
  version: 'v3'
}

function renderPreview(schemaStr = '') {
  return schemaStr.replace(/\{\{(\w+)\}\}/g, (_m, key) => demoValues[key] ?? '')
}

const previewProjektordner = computed(() => renderPreview(staged.projektordnerSchema))
const previewSession       = computed(() => renderPreview(staged.sessionSchema))

// -------- API --------
async function loadSnapshot() {
  loading.value = true; error.value = ''
  try {
    const res = await fetch(`${API}/schema`)
    if (!res.ok) {
      const txt = await res.text().catch(()=> '')
      let errObj = {}
      try { errObj = JSON.parse(txt) } catch {}
      const msg = errObj?.error === 'no_stammdaten_path'
        ? 'Kein Stammdaten-Pfad gesetzt. Bitte zuerst unter „Pfade“ speichern.'
        : `${res.status} ${res.statusText}`
      throw new Error(msg)
    }

    const snap = await res.json().catch(()=> ({}))
    // unterstützt: {schema:{…}}, {data:{…}} oder flach
    const src =
      (snap && typeof snap === 'object' && typeof snap.schema === 'object' && snap.schema) ||
      (snap && typeof snap === 'object' && typeof snap.data   === 'object' && snap.data)   ||
      snap

    original.value = {
      schema: {
        projektordnerSchema: String(src?.projektordnerSchema ?? ''),
        sessionSchema:       String(src?.sessionSchema ?? ''),
      },
      version: String(snap?.version ?? '')
    }

    // wichtig: reactive Objekt befüllen, nicht ersetzen
    Object.assign(staged, original.value.schema)
  } catch (e) {
    error.value = e?.message || 'Schema laden fehlgeschlagen'
  } finally {
    loading.value = false
  }
}onMounted(loadSnapshot)

// Für Elternkomponente (Konfiguration.vue) exposen
defineExpose({
  isDirty: () => isDirty.value,
  getSnapshotForSave: () => ({
    schema: { ...staged },
    version: original.value.version
  }),
  resetToServer: async () => { await loadSnapshot() }
})
</script>

<style scoped>
code {
  background: #f4f6f8;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>