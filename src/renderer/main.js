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

// Pinia: derselbe Speicher wie in plugins/index.js, sonst gäbe es den Store zweimal
import pinia from '@/stores'

// Stores
import { useProjektanlage } from '@/stores/Projektanlage'

// Styles
import 'unfonts.css'

const app = createApp(App)
app.use(pinia)
const projektanlage = useProjektanlage(pinia)

// Electron-Event → Store updaten
window.electronAPI?.onActiveUser?.((user) => {
  projektanlage.activeUser = user || null
})

// Nach der Konfiguration: Kunden und Vorlagen neu laden, ohne neue Anmeldung
window.electronAPI?.onConfigChanged?.(() => {
  projektanlage.refreshAfterConfig()
})

// Fallback beim Start: vom Backend lesen (z.B. nach Reload)
projektanlage.fetchActiveUser?.().catch(() => {})

registerPlugins(app)
app.mount('#app')
