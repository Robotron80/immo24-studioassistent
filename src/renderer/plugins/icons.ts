/**
 * Die Icons der Oberfläche.
 *
 * Statt der kompletten Icon-Schrift (mehrere Tausend Zeichen, rund 4 MB) kommen nur die Icons
 * ins Programm, die wir wirklich benutzen, als kleine Vektorgrafiken (SVG). Die Seiten schreiben
 * weiter Namen wie "mdi-pencil", die Liste unten übersetzt sie in die Grafik.
 *
 * Neues Icon gebraucht? Auf https://pictogrammers.com/library/mdi/ suchen, hier importieren
 * und in die Liste eintragen. Ohne Eintrag bleibt die Stelle leer.
 */
import {
  mdiAlert,
  mdiCheck,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiDelete,
  mdiEye,
  mdiEyeOff,
  mdiMagnify,
  mdiMenuDown,
  mdiPencil,
  mdiRefresh,
} from '@mdi/js'
import { h } from 'vue'
import type { IconOptions, IconProps } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

const PATHS: Record<string, string> = {
  'mdi-alert': mdiAlert,
  'mdi-check': mdiCheck,
  'mdi-check-circle': mdiCheckCircle,
  'mdi-close-circle': mdiCloseCircle,
  'mdi-delete': mdiDelete,
  'mdi-eye': mdiEye,
  'mdi-eye-off': mdiEyeOff,
  'mdi-magnify': mdiMagnify,
  'mdi-menu-down': mdiMenuDown,
  'mdi-pencil': mdiPencil,
  'mdi-refresh': mdiRefresh,
}

/** Zeichnet ein Icon: Namen aus der Liste werden zur Grafik, Vuetifys eigene Icons gehen direkt durch. */
const named = {
  component: (props: IconProps) => h(mdi.component, { ...props, icon: PATHS[String(props.icon)] ?? props.icon }),
}

// Die Icons, die Vuetify selbst braucht (Pfeile, Kreuze, Häkchen), kommen über "aliases" als Grafik
export const icons: IconOptions = {
  defaultSet: 'named',
  aliases,
  sets: { named, mdi },
}
