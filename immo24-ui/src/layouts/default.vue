<template>
  <v-app>
    <template v-if="showChrome">
      <AppBar />
      <v-main>
        <router-view v-slot="{ Component }">
          <component :is="Component" class="page-root" />
        </router-view>
      </v-main>
      <AppFooter />
    </template>

    <!-- Chrome ausblenden (Login/Konfiguration) -->
    <template v-else>
      <v-main>
        <router-view v-slot="{ Component }">
          <component :is="Component" class="page-root" />
        </router-view>
      </v-main>
    </template>
  </v-app>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppBar from './AppBar.vue'
import AppFooter from '@/components/AppFooter.vue'

const route = useRoute()

// Routen ohne AppBar/Footer
const HIDE_CHROME = new Set(['/konfiguration', '/Setupwizard'])

const showChrome = computed(() => !HIDE_CHROME.has(route.path))
</script>

<style scoped>
:deep(.v-main) { min-height: calc(100vh - 64px); }
:deep(.page-root) { height: 100%; }
</style>