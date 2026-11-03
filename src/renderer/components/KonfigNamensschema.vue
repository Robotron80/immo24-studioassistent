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
        <div class="d-flex flex-wrap ga-2 mb-3">
          <span
            v-for="ph in projektordnerPlaceholders"
            :key="ph"
            class="chip"
          >{{ ph }}</span>
        </div>
        <v-text-field
          v-model="staged.projektordnerSchema"
          label="Projektordner‑Schema"
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
        <div class="d-flex flex-wrap ga-2 mb-3">
          <span
            v-for="ph in sessionPlaceholders"
            :key="ph"
            class="chip"
          >{{ ph }}</span>
        </div>
        <v-text-field
          v-model="staged.sessionSchema"
          label="Session‑Schema"
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
/**
 * Wie heißen Projektordner und Sessions? Für Konfiguration und Einrichtungsassistent.
 * Die Datei teilen sich alle Rechner, Änderungen wirken also überall.
 */
import { ref, reactive, computed, onMounted } from 'vue'

import { backend } from '@/lib/backend'

const loading = ref(false)
const error   = ref('')

// Stand vom Speicher und Arbeitskopie: Der Unterschied zeigt, ob etwas geändert wurde
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

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const isDirty   = computed(() => !deepEqual(staged, original.value.schema))
const isSchemaValid = computed(() =>
  staged.projektordnerSchema.trim() !== '' &&
  staged.sessionSchema.trim() !== '' &&
  staged.sessionSchema.includes('{{version}}')
)

// Beispielwerte für die Vorschau
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

async function loadSnapshot() {
  loading.value = true; error.value = ''
  try {
    const snap: any = await backend.getSchema()
    original.value = {
      schema: {
        projektordnerSchema: String(snap.data?.projektordnerSchema ?? ''),
        sessionSchema:       String(snap.data?.sessionSchema ?? ''),
      },
      version: String(snap?.version ?? '')
    }

    Object.assign(staged, original.value.schema)
  } catch (e) {
    error.value = e?.message || 'Schema laden fehlgeschlagen'
  } finally {
    loading.value = false
  }
}
onMounted(loadSnapshot)

// Das nutzen Konfiguration und Assistent beim Speichern und Abbrechen
defineExpose({
  isDirty: () => isDirty.value,
  isSchemaValid: () => isSchemaValid.value,
  getSnapshotForSave: () => ({
    schema: { ...staged },
    version: original.value.version
  }),
  resetToServer: async () => { await loadSnapshot() }
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
