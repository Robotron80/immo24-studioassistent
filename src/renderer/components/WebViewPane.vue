<template>
  <div class="pane">
    <component
      :is="isElectron ? 'webview' : 'iframe'"
      class="view"
      :src="src"
      allow="clipboard-read; clipboard-write; fullscreen"
      allowfullscreen
    />
  </div>
</template>

<script setup>
const props = defineProps({ src: { type: String, required: true } })
const isElectron = Boolean(globalThis?.process?.versions?.electron)
</script>

<style scoped>
.pane { width: 100%; height: 100%; }
.view { width: 100%; height: 100%; border: 0; display: block; }
</style>
