/**
 * Startpunkt der Oberfläche: baut die Vue-App zusammen und zeigt sie im Fenster an.
 */
import { createApp } from 'vue'

import App from './App.vue'
import { registerPlugins } from '@/plugins'
import pinia from '@/stores'
import { useProjektanlage } from '@/stores/Projektanlage'
import './styles/app.css'

const app = createApp(App)
app.use(pinia)
const projektanlage = useProjektanlage(pinia)

// Nach der Konfiguration: Kunden und Vorlagen neu laden, ohne neue Anmeldung
window.electronAPI.onConfigChanged(() => {
  projektanlage.refreshAfterConfig()
})

// Der angemeldete Nutzer steht danach für alle Seiten im Store
projektanlage.fetchActiveUser()

registerPlugins(app)
app.mount('#app')
