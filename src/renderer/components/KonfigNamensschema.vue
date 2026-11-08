<template>
  <v-card flat>
    <v-card-text>
      <!-- Fehlermeldung ganz oben -->
      <v-alert v-if="!sessionSchemaValid && staged.sessionSchema" type="error" class="mb-4">
        Das Session-Schema muss
        <span class="chip">&#123;&#123;version&#125;&#125;</span> enthalten!
      </v-alert>
      <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

      <!-- Projektordner-Schema Card -->
      <v-card class="pa-4 mb-4">
        <div class="text-subtitle-1 font-weight-medium mb-2">Projektordner-Schema</div>
        <div class="mb-2 text-body-2 text-medium-emphasis">Verfügbare Parameter</div>
        <div class="d-flex flex-wrap ga-2 mb-3">
          <span v-for="ph in projektordnerPlaceholders" :key="ph" class="chip">{{ ph }}</span>
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
          <span v-for="ph in sessionPlaceholders" :key="ph" class="chip">{{ ph }}</span>
        </div>
        <v-text-field
          v-model="staged.sessionSchema"
          label="Session‑Schema"
          clearable
          :disabled="loading"
          hint="z.B. {{projektname}} {{moid}} {{benutzer}} {{kunde}} {{produktionsstufe}} {{version}}{{anmerkung}}"
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
import { computed } from 'vue'

import { useKonfigBereich } from '@/composables/useKonfigBereich'
import { backend } from '@/lib/backend'
import { fillSessionName, fillTemplate } from '../../core/names'

const { original, staged, loading, error, exposed } = useKonfigBereich({
  empty: () => ({ projektordnerSchema: '', sessionSchema: '' }),
  errorText: 'Schema laden fehlgeschlagen',
  load: async () => {
    const snap: any = await backend.getSchema()
    return {
      data: {
        projektordnerSchema: String(snap.data?.projektordnerSchema ?? ''),
        sessionSchema: String(snap.data?.sessionSchema ?? ''),
      },
      version: snap?.version,
    }
  },
})

const isSchemaValid = computed(
  () =>
    staged.value.projektordnerSchema.trim() !== '' &&
    staged.value.sessionSchema.trim() !== '' &&
    staged.value.sessionSchema.includes('{{version}}'),
)

// Beispielwerte für die Vorschau
const demoValues = {
  datum: '1997-01-23',
  projektname: 'Faszination Falten',
  moid: 'O4BZ',
  benutzer: 'PL',
  kunde: 'SuperVision',
  produktionsstufe: 'Foleys',
  version: 'v3',
  anmerkung: 'Kurzversion',
}

// Die Vorschau nutzt dieselben Regeln wie das echte Anlegen (src/core/names.ts)
const previewProjektordner = computed(() => fillTemplate(staged.value.projektordnerSchema, demoValues))
const previewSession = computed(() => fillSessionName(staged.value.sessionSchema, demoValues))

// Das nutzen Konfiguration und Assistent beim Speichern und Abbrechen
defineExpose({
  ...exposed,
  isSchemaValid: () => isSchemaValid.value,
  getSnapshotForSave: () => ({ schema: { ...staged.value }, version: original.value.version }),
})

const projektordnerPlaceholders = ['{{benutzer}}', '{{datum}}', '{{projektname}}', '{{moid}}', '{{kunde}}']
const sessionPlaceholders = [
  '{{benutzer}}',
  '{{datum}}',
  '{{projektname}}',
  '{{moid}}',
  '{{kunde}}',
  '{{produktionsstufe}}',
  '{{version}}',
  '{{anmerkung}}',
]

const sessionSchemaValid = computed(() => staged.value.sessionSchema.includes('{{version}}'))
</script>
