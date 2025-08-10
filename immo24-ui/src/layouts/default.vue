<template>
  <v-app>
    <AppBar />
    <v-main>
      <router-view v-slot="{ Component }">
        <component :is="Component" class="page-root"/>
      </router-view>
    </v-main>
    <AppFooter />
  </v-app>
</template>

<script setup>
import AppBar from './AppBar.vue'
console.info('[default.vue] layout mounted')  // <-- sichtbares Log
import AppFooter from '@/components/AppFooter.vue'
</script>

<style scoped>
/* Optional: ensure main fills viewport under the app bar */
:deep(.v-main) { min-height: calc(100vh - 64px); }
:deep(.page-root) { height: 100%; }
</style>