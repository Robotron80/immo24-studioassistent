import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineConfig({
  base: './',
  plugins: [
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
