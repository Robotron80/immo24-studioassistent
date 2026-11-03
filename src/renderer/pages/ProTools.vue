<template>
  <PresetSeite
    name="Pro Tools"
    :groups="GROUPS"
    :get-status="backend.proToolsStatus"
    :run="backend.runProToolsPresets"
  />
</template>

<script setup lang="ts">
/**
 * Die Seite Pro Tools: Presets zwischen diesem Rechner und dem Archiv kopieren.
 * Der Status ist nur eine Anzeige, gesperrt wird bei laufendem Pro Tools nichts.
 */
import PresetSeite from '@/components/PresetSeite.vue'
import { backend } from '@/lib/backend'

const GROUPS = [
  [
    { key: 'templates', label: 'Templates' },
    { key: 'trackPresets', label: 'Track Presets' },
    { key: 'pluginSettings', label: 'Plug-In Settings' },
  ],
  [
    { key: 'fadePresets', label: 'Fade Presets', quick: false },
    { key: 'clipFxPresets', label: 'Clip Effects Presets', quick: false },
    { key: 'memoryLocation', label: 'Memory Location Presets', quick: false },
    { key: 'trackDataToRecall', label: 'Track Data to Recall Presets', quick: false },
  ],
  [
    { key: 'keyboardShortcuts', label: 'Keyboard Shortcuts' },
  ],
]
</script>
