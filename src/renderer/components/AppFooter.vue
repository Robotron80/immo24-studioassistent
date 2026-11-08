<template>
  <v-footer app class="text-caption text-medium-emphasis py-1"> immo24 Studioassistent v{{ appVersion }} </v-footer>
</template>

<script setup lang="ts">
/**
 * Die Fußzeile mit Programmname und Version.
 */
import { onMounted, ref } from 'vue'

const appVersion = ref('')
onMounted(async () => {
  appVersion.value = await window.electronAPI.getAppVersion()
})
</script>
