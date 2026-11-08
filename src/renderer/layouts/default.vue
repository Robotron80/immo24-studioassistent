<template>
  <v-app>
    <!-- Kopf- und Fußzeile nur im Hauptfenster, nicht bei Anmeldung, Konfiguration und Assistent -->
    <AppBar v-if="showChrome" />
    <v-main>
      <router-view />
    </v-main>
    <AppFooter v-if="showChrome" />
  </v-app>
</template>

<script setup lang="ts">
/**
 * Das Grundgerüst aller Seiten. Anmeldung, Konfiguration und Assistent laufen in eigenen
 * Fenstern und zeigen deshalb weder Kopf- noch Fußzeile.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppBar from './AppBar.vue'
import AppFooter from '@/components/AppFooter.vue'

const route = useRoute()

// Seiten ohne Kopf- und Fußzeile
const HIDE_CHROME = new Set(['/anmeldung', '/konfiguration', '/Setupwizard'])

const showChrome = computed(() => !HIDE_CHROME.has(route.path))
</script>
