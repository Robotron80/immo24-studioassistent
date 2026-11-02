/**
 * Die Seiten des Programms und ihre Adressen.
 * Alle Seiten liegen im Grundgerüst layouts/default.vue. Die App startet auf der
 * Projektanlage, Konfiguration und Einrichtung öffnet der Hauptprozess in eigenen Fenstern.
 */
import { createRouter, createWebHashHistory } from 'vue-router'

import DefaultLayout from '@/layouts/default.vue'
import Konfiguration from '@/pages/Konfiguration.vue'
import Projektanlage from '@/pages/Projektanlage.vue'
import ProTools from '@/pages/ProTools.vue'
import Setupwizard from '@/pages/Setupwizard.vue'
import Soundminer from '@/pages/Soundminer.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        { path: '', redirect: '/projektanlage' },
        { path: 'projektanlage', component: Projektanlage },
        { path: 'protools', component: ProTools },
        { path: 'soundminer', component: Soundminer },
        { path: 'konfiguration', component: Konfiguration },
        { path: 'Setupwizard', component: Setupwizard },
      ],
    },
  ],
})
