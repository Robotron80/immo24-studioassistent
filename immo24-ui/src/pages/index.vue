<template>
<!-- <v-app><router-view /></v-app> -->  
  
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

// 👉 Hier die Route deines ersten Tabs eintragen
const DEFAULT_TAB_PATH = '/Projektanlage' // z.B. '/studio', '/dashboard', '/tabs/overview'

const router = useRouter()
const route  = useRoute()

onMounted(() => {
  // Beim Start immer auf ersten Tab
  if (route.path !== DEFAULT_TAB_PATH) {
    router.replace(DEFAULT_TAB_PATH)
  }
  // Falls Logout-Event aus AppBar kommt:
  window.addEventListener('immo24:logout', () => {
    router.replace(DEFAULT_TAB_PATH)
  })
})
</script>

<style scoped>
.v-application { height: 100vh; }
</style>
