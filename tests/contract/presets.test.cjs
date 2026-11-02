/**
 * Hält fest, was Store und Recall in Node-RED kopieren.
 * Store: von der lokalen Pro-Tools-Ablage ins zentrale Archiv des Mitarbeiters.
 * Recall: aus dem Archiv zurück in die lokale Ablage.
 */
const path = require('node:path')
const test = require('node:test')
const { expectReference, seedConfigured, startBackend, write } = require('./harness.cjs')

const USER = 'Tester'

/** Legt lokale Presets an. Dazu gehören auch fremde Dateien, die nicht mitkopiert werden dürfen. */
function seedLocalPresets({ ptUser, soundminer }) {
  const files = {
    [`Session Templates/${USER}/Vorlage.ptxt`]: 'template',
    [`Track Presets/${USER}/Spur.trackpreset`]: 'track',
    [`Track Presets/anderer/fremd.trackpreset`]: 'fremd',
    [`Plug-In Settings/EQ/${USER}/Mein.tfx`]: 'eq',
    [`Plug-In Settings/EQ/anderer/fremd.tfx`]: 'fremd',
    [`Plug-In Settings/Ohne User/anderer/fremd.tfx`]: 'fremd',
    'Fade Presets/Fade In/Weich.fdpreset': 'fade',
    'Fade Presets/Fade In/Quick Preset 1.fdpreset': 'quick fade',
    'Fade Presets/Fade Out/keine-vorlage.txt': 'x',
    'Fade Presets/Fade Out/Hart.fdpreset': 'hart',
    'Fade Presets/Cross Fade/Kreuz.fdpreset': 'kreuz',
    'Fade Presets/Batch Fade/Stapel.fdpreset': 'stapel',
    [`Clip Effects Presets/${USER}/Clip.tfx`]: 'clip',
    'Clip Effects Presets/Quick Preset 1.tfx': 'quick clip',
    [`Pro Tools Presets/Memory Location Window/${USER}/Ort.ptpreset`]: 'ort',
    'Pro Tools Presets/Memory Location Window/Quick Preset 2.ptpreset': 'quick ort',
    [`Pro Tools Presets/Track Data to Recall/${USER}/Daten.ptpreset`]: 'daten',
    [`Pro Tools Presets/Keyboard Shortcuts/${USER}/Tasten.ptpreset`]: 'tasten',
  }
  for (const [file, content] of Object.entries(files)) write(path.join(ptUser, file), content)
  write(path.join(soundminer, 'Standard.tabstate'), 'layout')
  write(path.join(soundminer, 'andere-datei.txt'), 'x')
}

/** Eine Anfrage mit allen Kategorien, so wie die Oberfläche sie schickt. */
const everything = (action) => ({
  action,
  categories: {
    cat1: [{ key: 'templates' }, { key: 'trackPresets' }, { key: 'pluginSettings' }],
    cat2: [
      { key: 'fadePresets', quick: true },
      { key: 'clipFxPresets', quick: true },
      { key: 'memoryLocation', quick: true },
      { key: 'trackDataToRecall', quick: true },
    ],
    cat3: [{ key: 'keyboardShortcuts' }],
  },
})

test('Pro-Tools- und Soundminer-Presets', { timeout: 120000 }, async (t) => {
  const backend = await startBackend({ seed: seedConfigured })
  t.after(() => backend.stop())
  const { call, dirs, snapshot, steps } = backend

  seedLocalPresets(dirs)
  const archive = path.join(dirs.mitarbeiter, USER, 'immo24')
  await call('Start', 'GET', '/api/initialize')
  await call('Module laden', 'GET', '/api/modules')
  await call('Anmelden', 'POST', '/api/login', { user: USER })

  // Bekannter Fehler: Ohne Auswahl antwortet Node-RED nie
  await call('Hänger: nichts ausgewählt', 'POST', '/api/protools/presets', { action: 'store', categories: {} })

  await call('Store alles, ohne Quick', 'POST', '/api/protools/presets', {
    action: 'store',
    categories: { cat2: [{ key: 'fadePresets', quick: false }] },
  })
  snapshot('Archiv nach Store nur Fades', archive)

  await call('Store alles', 'POST', '/api/protools/presets', everything('store'))
  snapshot('Archiv nach Store', archive)

  // Einzeln, damit Fehler einer Kategorie nicht die anderen überdecken
  for (const [cat, key, quick] of [
    ['cat1', 'templates'],
    ['cat1', 'trackPresets'],
    ['cat1', 'pluginSettings'],
    ['cat2', 'fadePresets', true],
    ['cat2', 'clipFxPresets', true],
    ['cat2', 'memoryLocation', true],
    ['cat2', 'trackDataToRecall', true],
    ['cat3', 'keyboardShortcuts'],
  ]) {
    await call(`Recall ${key}`, 'POST', '/api/protools/presets', {
      action: 'recall',
      categories: { [cat]: [{ key, quick }] },
    })
  }
  snapshot('Lokal nach Recall', dirs.ptUser)

  // Soundminer
  await call('Soundminer: nichts ausgewählt', 'POST', '/api/soundminer/presets', { action: 'store', categories: {} })
  await call('Soundminer Store', 'POST', '/api/soundminer/presets', { action: 'store', categories: { cat1: [{ key: 'tablayouts' }] } })
  snapshot('Archiv nach Soundminer-Store', path.join(archive, 'soundminer'))
  write(path.join(archive, 'soundminer', 'Neu.tabstate'), 'neu')
  await call('Soundminer Recall', 'POST', '/api/soundminer/presets', { action: 'recall', categories: { cat1: [{ key: 'tablayouts' }] } })
  snapshot('Lokal nach Soundminer-Recall', dirs.soundminer)

  expectReference('presets', steps)
})
