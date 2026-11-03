/**
 * Einrichtung von Vuetify, der Baustein-Bibliothek der Oberfläche.
 *
 * Hier steht das Design der App: Standardwerte der Bausteine, Farben und Sprache.
 * Was hier eingestellt ist, gilt überall und muss nicht auf jeder Seite wiederholt werden.
 */
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import { de } from 'vuetify/locale'

const fieldDefaults = { variant: 'outlined', density: 'comfortable' }

export default createVuetify({
  theme: {
    // Nur das helle Design, einen Dunkelmodus gibt es bewusst nicht
    defaultTheme: 'light',
    // Das Dunkelblau aus dem Logo, nur für Hauptaktionen und die aktive Auswahl
    themes: {
      // Das Standardgrün von Vuetify ist auf Weiß zu blass (2,8:1), dieses hier hat 5,1:1
      light: { colors: { primary: '#14304A', success: '#2E7D32' } },
    },
  },
  // Deutsche Texte in den Bausteinen, z. B. "Einträge pro Seite"
  locale: {
    locale: 'de',
    messages: { de },
  },
  defaults: {
    VTextField: fieldDefaults,
    VSelect: fieldDefaults,
    VAutocomplete: fieldDefaults,
    VCard: { flat: true, border: true },
    VCheckbox: { density: 'comfortable', hideDetails: 'auto', color: 'primary' },
    VBtn: { variant: 'flat' },
    VDataTable: { density: 'comfortable' },
  },
})
