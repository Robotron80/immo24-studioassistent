<template>
  <v-container fluid class="pa-0">

    <WebViewPane :src="loginUrl" />
  </v-container>
</template>

<script setup>
import WebViewPane from '@/components/WebViewPane.vue'
const loginUrl = import.meta.env.VITE_LOGIN_URL || '/dashboard/login'
</script>