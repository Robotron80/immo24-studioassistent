<template>
  <v-card class="pa-4 mb-4">
    <div class="text-subtitle-1 font-weight-medium mb-2">Soundminer</div>
    <div class="d-flex align-center ga-6 mb-4">
      <v-checkbox v-model="staged.soundminerEnabled" label="Modul aktivieren" class="ma-0" />
      <v-spacer />
      <v-select
        v-model="staged.soundminerVersion"
        :items="soundminerVersions"
        label="Version"
        :disabled="!staged.soundminerEnabled"
        hide-details
        class="module-version ma-0"
      />
    </div>
    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        v-model="staged.soundminerPath"
        hide-details
        label="Soundminer Support Folder"
        :disabled="!staged.soundminerEnabled"
        class="flex-grow-1"
      />
      <v-btn
        :disabled="!staged.soundminerEnabled"
        variant="outlined"
        @click="browseInto('soundminerPath', 'Soundminer Support Folder auswählen')"
      >
        Durchsuchen
      </v-btn>
    </div>
  </v-card>

  <v-card class="pa-4 mb-4">
    <div class="text-subtitle-1 font-weight-medium mb-2">Projekte umbenennen</div>
    <v-checkbox
      v-model="staged.renameEnabled"
      label="Umbenennen vorhandener Projekte erlauben"
      hide-details
      class="ma-0"
    />
  </v-card>

  <v-alert v-if="error" type="error">{{ error }}</v-alert>
</template>

<script setup lang="ts">
/**
 * Konfiguration, Bereich Module: Soundminer und das Umbenennen von Projekten einschalten.
 */
import { computed } from 'vue'

import { useKonfigBereich } from '@/composables/useKonfigBereich'
import { backend } from '@/lib/backend'

const soundminerVersions = ['V6 Pro']

// Die Oberfläche arbeitet mit flachen Feldern, das Backend mit verschachtelten
const { original, staged, error, exposed } = useKonfigBereich({
  empty: () => ({ soundminerEnabled: false, soundminerPath: '', soundminerVersion: '', renameEnabled: false }),
  errorText: 'Module laden fehlgeschlagen',
  load: async () => {
    const snap: any = await backend.getModules()
    const sm = snap?.data?.soundminer || {}
    return {
      data: {
        soundminerEnabled: !!sm.enabled,
        soundminerPath: typeof sm.supportPath === 'string' ? sm.supportPath : '',
        soundminerVersion: typeof sm.version === 'string' ? sm.version : '',
        renameEnabled: !!snap?.data?.umbenennen?.enabled,
      },
      version: snap?.version,
    }
  },
})

/** Mit eingeschaltetem Soundminer müssen Pfad und Version ausgefüllt sein. */
const isSoundminerValid = computed(() => {
  const { soundminerEnabled, soundminerPath, soundminerVersion } = staged.value
  return !soundminerEnabled || (!!soundminerPath.trim() && !!soundminerVersion.trim())
})

/** Öffnet die Ordnerauswahl des Systems und übernimmt den gewählten Ordner. */
async function browseInto(key, title) {
  const picked = await window.electronAPI.pickFolder(title, staged.value[key] || undefined)
  if (typeof picked === 'string' && picked.length > 0) {
    staged.value[key] = picked.replace(/\\/g, '/') // Windows: einheitlich mit Schrägstrich
  }
}

// Das nutzt Konfiguration.vue beim Speichern und Abbrechen
defineExpose({
  ...exposed,
  isSoundminerValid: () => isSoundminerValid.value,
  getSnapshotForSave: () => ({
    // Zurück ins Format des Backends
    version: original.value.version,
    data: {
      soundminer: {
        enabled: staged.value.soundminerEnabled,
        supportPath: staged.value.soundminerPath,
        version: staged.value.soundminerVersion,
      },
      umbenennen: { enabled: staged.value.renameEnabled },
    },
  }),
})
</script>
