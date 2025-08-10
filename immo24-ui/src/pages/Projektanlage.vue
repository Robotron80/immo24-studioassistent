<template>
  <v-container fluid class="pa-0">

    <WebViewPane :src="projektanlageUrl" />
  </v-container>
</template>

<script setup>
import WebViewPane from '@/components/WebViewPane.vue'
const projektanlageUrl = import.meta.env.VITE_PROJEKTANLAGE_URL || '/dashboard/login'
</script>