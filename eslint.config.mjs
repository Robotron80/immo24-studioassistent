/**
 * ESLint: prüft den Code automatisch auf typische Fehler und unsaubere Stellen.
 * Aufruf mit "npm run lint", läuft auch in der Pipeline. Die Formatierung (Einrückung,
 * Anführungszeichen) übernimmt Prettier, deshalb sind die Stilregeln hier abgeschaltet.
 */
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', 'tests/contract/reference/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Unbenutzte Variablen sind ein Fehler, ein Unterstrich am Anfang markiert Absicht
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // "any" schaltet die Typprüfung ab, deshalb ist es im Programmcode verboten
      '@typescript-eslint/no-explicit-any': 'error',
      // Seitennamen wie "Anmeldung" bestehen aus einem Wort, das ist so gewollt
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Die Tests spielen frei geformte Anfragen im Stil der alten HTTP-Schnittstelle ab
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Die Testumgebung und Skripte sind CommonJS (require)
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
)
