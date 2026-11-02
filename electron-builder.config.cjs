const { version } = require('./package.json')

// Next-Builds laufen als eigene App neben der installierten Version.
// RC und Release tragen die echte Identität und ersetzen die alte Version als Update.
const isNext = version.includes('-next')

module.exports = {
  appId: isNext ? 'de.immo24.studioassistent.next' : 'de.immo24.studioassistent',
  productName: isNext ? 'immo24 Studioassistent Next' : 'immo24 Studioassistent',
  files: [
    'dist/**',
    'dist-electron/**',
    'assets/**',
    'package.json',
  ],
  win: {
    target: ['nsis'],
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    license: 'assets/license.txt',
    deleteAppDataOnUninstall: true,
  },
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }],
    category: 'public.app-category.productivity',
    // Ohne Apple-Zertifikat: Ad-hoc-Signatur, die Apple Silicon zum Starten voraussetzt
    identity: '-',
    hardenedRuntime: false,
  },
  dmg: {
    iconSize: 128,
  },
  directories: {
    buildResources: 'assets',
    output: 'release',
  },
  icon: 'assets/icon',
  // Packt den Programmcode in eine einzige Datei. Das spart Virenscannern tausende Einzelprüfungen.
  asar: true,
}
