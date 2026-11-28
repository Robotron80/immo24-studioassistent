<template>
  <PresetSeite
    name="Soundminer"
    :groups="GROUPS"
    :get-status="backend.soundminerStatus"
    :run="backend.runSoundminerPresets"
  />
</template>

<script setup lang="ts">
/**
 * Die Seite Soundminer: Tab-Layouts zwischen diesem Rechner und dem Archiv kopieren.
 * Solange Soundminer läuft, lehnt das Backend das Kopieren ab.
 */
import PresetSeite from '@/components/PresetSeite.vue'
import { backend } from '@/lib/backend'

const GROUPS = [[{ key: 'tablayouts', label: 'Tab Layouts' }]]
</script>
