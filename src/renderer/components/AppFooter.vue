<template>
  <v-footer app elevation="0">
    <v-container class="py-1 text-caption opacity-70">
      <span>immo24 Studioassistent v{{ appVersion }}</span>
    </v-container>
  </v-footer>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const appVersion = ref('')
onMounted(async () => {
  appVersion.value = await window.electronAPI.getAppVersion()
})

</script>

<style scoped>
.opacity-70 { opacity: .7 }
</style>
