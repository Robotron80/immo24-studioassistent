/**
 * main.js
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Pinia
import { createPinia } from 'pinia'

// Stores
import { useProjektanlage } from '@/stores/Projektanlage'

// Styles
import 'unfonts.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
// nach createPinia: Store holen
const projektanlage = useProjektanlage(pinia)

// Electron-Event → Store updaten
window.electronAPI?.onActiveUser?.((user) => {
  projektanlage.activeUser = user || null
})

// Fallback beim Start: vom Backend lesen (z.B. nach Reload)
projektanlage.fetchActiveUser?.().catch(() => {})

registerPlugins(app)
app.mount('#app')
