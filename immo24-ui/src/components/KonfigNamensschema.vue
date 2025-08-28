<template>
  <v-card flat>
    <v-card-text>
      <!-- Fehlermeldung ganz oben -->
      <v-alert
        v-if="!sessionSchemaValid && staged.sessionSchema"
        type="error"
        class="mb-4"
      >
        Das Session-Schema muss
        <span class="chip">&#123;&#123;version&#125;&#125;</span> enthalten!
      </v-alert>
      <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

      <!-- Projektordner-Schema Card -->
      <v-card class="pa-4 mb-4 shadow-card" variant="text">
        <div class="schema-title mb-2">Projektordner-Schema</div>
        <div class="mb-2 param-label">Verfügbare Parameter</div>
        <div class="mb-3" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span
            v-for="ph in projektordnerPlaceholders"
            :key="ph"
            class="chip"
          >{{ ph }}</span>
        </div>
        <v-text-field
          v-model="staged.projektordnerSchema"
          label="Projektordner‑Schema"
          density="comfortable"
          clearable
          :disabled="loading"
          hint="z.B. {{datum}} {{projektname}} {{moid}} {{benutzer}}"
          persistent-hint
          class="mb-2"
        />
        <div class="preview-box mt-2">
          <span class="text-caption text-medium-emphasis">Vorschau:</span>
          <code>{{ previewProjektordner }}</code>
        </div>
      </v-card>

      <!-- Session-Schema Card -->
      <v-card class="pa-4 mb-4 shadow-card" variant="text">
        <div class="schema-title mb-2">Session-Schema</div>
        <div class="mb-2 param-label">Verfügbare Parameter</div>
        <div class="mb-3" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span
            v-for="ph in sessionPlaceholders"
            :key="ph"
            class="chip"
          >{{ ph }}</span>
        </div>
        <v-text-field
          v-model="staged.sessionSchema"
          label="Session‑Schema"
          density="comfortable"
          clearable
          :disabled="loading"
          hint="z.B. {{projektname}} {{moid}} {{benutzer}} {{kunde}} {{produktionsstufe}} {{version}}"
          persistent-hint
          class="mb-2"
        />
        <div class="preview-box mt-2">
          <span class="text-caption text-medium-emphasis">Vorschau:</span>
          <code>{{ previewSession }}</code>
        </div>
      </v-card>
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
  resetToServer: async () => { await loadSnapshot() },
  isSessionSchemaValid: () => sessionSchemaValid.value
})

const projektordnerPlaceholders = [
  '{{benutzer}}', '{{datum}}', '{{projektname}}', '{{moid}}', '{{kunde}}'
]
const sessionPlaceholders = [
  '{{benutzer}}', '{{datum}}', '{{projektname}}', '{{moid}}',
  '{{kunde}}', '{{produktionsstufe}}', '{{version}}'
]

const sessionSchemaValid = computed(() =>
  staged.sessionSchema.includes('{{version}}')
)
</script>

<style scoped>
.shadow-card {
  box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
  border-radius: 10px;
  border: none;
}
.schema-title {
  font-size: 1.05rem;
  font-weight: 500;
  color: #444;
}
.param-label {
  font-size: 0.95rem;
  font-weight: 400;
  color: #666;
}
.chip {
  display: inline-block;
  padding: 2px 8px;
  margin: 2px 0;
  background: #f5f5f5;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 16px;
  font-size: 0.95em;
  font-weight: 500;
  user-select: none;
}
.preview-box {
  background: #f4f6f8;
  border-radius: 6px;
  padding: 6px 10px;
  margin-top: 4px;
  display: inline-block;
}
.text-body-1 {
  font-size: 1.08rem;
  font-weight: 300;
  color: #222;
  margin-bottom: 1.5rem;
}
code {
  background: #f4f6f8;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>