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

const app = createApp(App)
app.use(pinia)
const projektanlage = useProjektanlage(pinia)

// Nach der Konfiguration: Kunden und Vorlagen neu laden, ohne neue Anmeldung
window.electronAPI?.onConfigChanged?.(() => {
  projektanlage.refreshAfterConfig()
})

// Der angemeldete Nutzer steht danach für alle Seiten im Store
projektanlage.fetchActiveUser()

registerPlugins(app)
app.mount('#app')
