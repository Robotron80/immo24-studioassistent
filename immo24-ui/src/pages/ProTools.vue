<template>
  <v-container fluid class="pa-0">

    <WebViewPane :src="protoolsUrl" />
  </v-container>
</template>

<script setup>
import WebViewPane from '@/components/WebViewPane.vue'
const protoolsUrl = import.meta.env.VITE_PROTOOLS_URL || '/dashboard/protools'
</script>