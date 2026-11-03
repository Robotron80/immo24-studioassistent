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
      <v-card class="pa-4 mb-4">
        <div class="text-subtitle-1 font-weight-medium mb-2">Projektordner-Schema</div>
        <div class="mb-2 text-body-2 text-medium-emphasis">Verfügbare Parameter</div>
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
      <v-card class="pa-4 mb-4">
        <div class="text-subtitle-1 font-weight-medium mb-2">Session-Schema</div>
        <div class="mb-2 text-body-2 text-medium-emphasis">Verfügbare Parameter</div>
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

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

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
const isSchemaValid = computed(() =>
  staged.projektordnerSchema.trim() !== '' &&
  staged.sessionSchema.trim() !== '' &&
  staged.sessionSchema.includes('{{version}}')
)

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
    const snap: any = await backend.getSchema()
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
  isSchemaValid: () => isSchemaValid.value,
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
