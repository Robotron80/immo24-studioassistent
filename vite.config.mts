import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import electron from 'vite-plugin-electron'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

/**
 * Content-Security-Policy: Die gebaute Oberfläche darf nur Skripte und Dateien aus der App
 * selbst laden, nichts aus dem Netz. Eine zweite Absicherung, falls doch einmal fremder
 * Code in eine Seite gelangt. Stile dürfen inline sein, weil Vuetify sie so setzt.
 * Nur beim Bauen, der Entwicklungsserver braucht mehr Freiheiten.
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
}

export default defineConfig({
  base: './',
  plugins: [
    contentSecurityPolicy,
    Vue({
      template: { transformAssetUrls },
    }),
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/renderer/styles/settings.scss',
      },
    }),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            // Lesbare Stacktraces im Log
            minify: false,
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
    ]),
  ],
  optimizeDeps: {
    exclude: ['vuetify'],
  },
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src/renderer', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
      scss: {
        api: 'modern-compiler',
      },
    },
  },
})
