import { fileURLToPath, URL } from 'node:url'

import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Fonts from 'unplugin-fonts/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import Layouts from 'vite-plugin-vue-layouts-next'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

const mainExternals = ['express', 'node-red']

export default defineConfig({
  base: './',
  plugins: [
    VueRouter({
      routesFolder: 'src/renderer/pages',
      dts: 'src/renderer/typed-router.d.ts',
    }),
    Layouts({
      layoutsDirs: 'src/renderer/layouts',
      pagesDirs: 'src/renderer/pages',
    }),
    Vue({
      template: { transformAssetUrls },
    }),
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/renderer/styles/settings.scss',
      },
    }),
    Components({
      dirs: ['src/renderer/components'],
      dts: 'src/renderer/components.d.ts',
    }),
    Fonts({}),
    AutoImport({
      imports: [
        'vue',
        VueRouterAutoImports,
        {
          pinia: ['defineStore', 'storeToRefs'],
        },
      ],
      dts: 'src/renderer/auto-imports.d.ts',
      vueTemplate: true,
    }),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            // Lesbare Stacktraces im Log
            minify: false,
            rollupOptions: { external: mainExternals },
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
    exclude: [
      'vuetify',
      'vue-router',
      'unplugin-vue-router/runtime',
      'unplugin-vue-router/data-loaders',
      'unplugin-vue-router/data-loaders/basic',
    ],
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
