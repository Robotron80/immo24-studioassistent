/**
 * Der gemeinsame Speicher (Pinia). Es darf ihn nur einmal geben, sonst sehen die Seiten
 * unterschiedliche Daten. Alle Stellen importieren ihn deshalb von hier.
 */
import { createPinia } from 'pinia'

export default createPinia()
