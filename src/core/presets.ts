/**
 * Store und Recall: Presets zwischen Rechner und zentralem Archiv kopieren.
 *
 *   Store:  lokale Ablage von Pro Tools oder Soundminer -> Archiv des Mitarbeiters
 *   Recall: Archiv des Mitarbeiters -> lokale Ablage
 *
 * So hat jeder Mitarbeiter seine Einstellungen auf jedem Rechner. Das Archiv liegt
 * unter Mitarbeiter/<Name>/immo24 auf dem gemeinsamen Speicher.
 *
 * Jede Kategorie läuft für sich: Scheitert eine, laufen die anderen weiter, und das
 * Ergebnis nennt pro Kategorie den Status.
 *   ok:      alles kopiert
 *   partial: Quelle fehlte, es gab nichts zu kopieren
 *   error:   beim Kopieren ging etwas schief
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ConfigService } from './config.ts'
import { CoreError } from './errors.ts'
import { exists, isPlainObject } from './files.ts'
import type { SessionService } from './session.ts'

type Action = 'store' | 'recall'

export interface CategoryResult {
  category: string
  status: 'ok' | 'partial' | 'error'
  note?: string
}

/** Pfade, die jede Kategorie braucht. */
interface Context {
  action: Action
  /** Pro Tools User-Ordner auf diesem Rechner */
  ptUser: string
  /** immo24-Ordner des Mitarbeiters im Archiv */
  archive: string
  user: string
}

/** Wird geworfen, wenn die Quelle fehlt. Das ist ein Hinweis, kein Fehler. */
class SourceMissing extends Error {}

/** Ordner kopieren, vorhandene Dateien werden überschrieben. */
async function copyFolder(source: string, target: string, exclude?: string): Promise<void> {
  if (!(await exists(source))) throw new SourceMissing(source)
  await fs.mkdir(target, { recursive: true })
  for (const name of await fs.readdir(source)) {
    if (name === exclude) continue
    await fs.cp(path.join(source, name), path.join(target, name), { recursive: true, force: true })
  }
}

/**
 * Kopiert die fünf "Quick Presets". Pro Tools erwartet sie direkt im Hauptordner statt
 * im Benutzerordner, im Archiv liegen sie deshalb getrennt. Fehlende werden übersprungen.
 */
async function copyQuickPresets(sourceDir: string, targetDir: string, extension: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })
  for (let i = 1; i <= 5; i++) {
    const file = `Quick Preset ${i}.${extension}`
    if (await exists(path.join(sourceDir, file))) {
      await fs.copyFile(path.join(sourceDir, file), path.join(targetDir, file))
    }
  }
}

/** Dreht Quelle und Ziel je nach Richtung um. */
function direction(ctx: Context, local: string, archive: string) {
  return ctx.action === 'store' ? { source: local, target: archive } : { source: archive, target: local }
}

/** Kategorien, die nur aus einem Ordner bestehen: Templates und Track Presets. */
function simpleFolder(localFolder: string, archiveFolder: string) {
  return async (ctx: Context) => {
    const { source, target } = direction(
      ctx,
      path.join(ctx.ptUser, localFolder, ctx.user),
      path.join(ctx.archive, archiveFolder),
    )
    await copyFolder(source, target)
  }
}

/** Kategorien mit Benutzerordner und optionalen Quick Presets. */
function withQuickPresets(localRoot: string, archiveFolder: string, quickFolder: string, extension: string) {
  return async (ctx: Context, quick: boolean) => {
    const root = path.join(ctx.ptUser, localRoot)
    const { source, target } = direction(ctx, path.join(root, ctx.user), path.join(ctx.archive, archiveFolder))
    const quicks = direction(ctx, root, path.join(ctx.archive, quickFolder, 'Quick Presets'))
    // Der Zielordner entsteht immer, damit das Archiv aussieht wie bei Version 0.4
    await fs.mkdir(quicks.target, { recursive: true })
    await copyFolder(source, target, 'Quick Presets')
    if (quick) await copyQuickPresets(quicks.source, quicks.target, extension)
  }
}

/**
 * Plug-In Settings: Pro Tools legt pro Plug-In einen Ordner an, darin einen pro Benutzer.
 * Maßgeblich sind die auf diesem Rechner vorhandenen Plug-Ins. Fehlt der Benutzerordner,
 * wird er angelegt, sonst schlägt der Recall für neue Benutzer fehl.
 */
async function pluginSettings(ctx: Context): Promise<void> {
  const root = path.join(ctx.ptUser, 'Plug-In Settings')
  if (!(await exists(root))) throw new SourceMissing(root)

  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const userDir = path.join(root, entry.name, ctx.user)
    await fs.mkdir(userDir, { recursive: true })
    const { source, target } = direction(ctx, userDir, path.join(ctx.archive, 'pluginsettings', entry.name))
    // Nicht jedes Plug-In hat Einstellungen im Archiv, das ist kein Fehler
    if (await exists(source)) await copyFolder(source, target)
  }
}

const FADE_FOLDERS = ['Batch Fade', 'Cross Fade', 'Fade In', 'Fade Out']
const QUICK_FADE = /^Quick Preset\s+[1-5]\.fdpreset$/i

/** Fade Presets: vier feste Ordner, nur .fdpreset-Dateien, Quick Presets separat. */
async function fadePresets(ctx: Context, quick: boolean): Promise<void> {
  let missing = 0
  for (const folder of FADE_FOLDERS) {
    const { source, target } = direction(
      ctx,
      path.join(ctx.ptUser, 'Fade Presets', folder),
      path.join(ctx.archive, 'fadepresets', folder),
    )
    if (!(await exists(source))) {
      missing++
      continue
    }
    await fs.mkdir(target, { recursive: true })
    for (const name of await fs.readdir(source)) {
      if (/\.fdpreset$/i.test(name) && !QUICK_FADE.test(name)) {
        await fs.copyFile(path.join(source, name), path.join(target, name))
      }
    }
    if (quick) await copyQuickPresets(source, target, 'fdpreset')
  }
  if (missing > 0) throw new SourceMissing('Fade Presets')
}

/**
 * Alle Pro-Tools-Kategorien in fester Reihenfolge.
 * key: so nennt sie die Oberfläche. category: so heißt sie im Ergebnis.
 * Die Ordnernamen im Archiv müssen bleiben, Version 0.4 nutzt dieselben.
 */
const PRO_TOOLS_CATEGORIES: Array<{ key: string; category: string; run: (ctx: Context, quick: boolean) => Promise<void> }> = [
  { key: 'templates', category: 'templates', run: simpleFolder('Session Templates', 'templates') },
  { key: 'trackpresets', category: 'trackpresets', run: simpleFolder('Track Presets', 'trackpresets') },
  { key: 'pluginsettings', category: 'pluginsettings', run: pluginSettings },
  { key: 'fadepresets', category: 'fadePresets', run: fadePresets },
  {
    key: 'clipfxpresets',
    category: 'clipfxpresets',
    run: withQuickPresets('Clip Effects Presets', 'clipeffectspresets', 'clipeffectspresets', 'tfx'),
  },
  {
    key: 'memorylocation',
    category: 'memoryLocation',
    run: withQuickPresets('Pro Tools Presets/Memory Location Window', 'memorylocationpresets', 'memorylocationpresets', 'ptpreset'),
  },
  {
    key: 'trackdatatorecall',
    category: 'trackdatarecall',
    run: withQuickPresets('Pro Tools Presets/Track Data to Recall', 'trackdatapresets', 'trackdatarecallpresets', 'ptpreset'),
  },
  {
    key: 'keyboardshortcuts',
    category: 'keyboardshortcuts',
    run: withQuickPresets('Pro Tools Presets/Keyboard Shortcuts', 'keyboardshortcuts', 'keyboardshortcuts', 'ptpreset'),
  },
]

/** Führt eine Kategorie aus und übersetzt den Ausgang in einen Status. */
async function runCategory(category: string, run: () => Promise<void>): Promise<CategoryResult> {
  try {
    await run()
    return { category, status: 'ok' }
  } catch (error) {
    if (error instanceof SourceMissing) return { category, status: 'partial', note: 'some items were not present' }
    return { category, status: 'error', note: error instanceof Error ? error.message : String(error) }
  }
}

/** Baut die Gesamtantwort für die Oberfläche. */
function summarize(action: string, started: string, details: CategoryResult[]) {
  const hasError = details.some((detail) => detail.status === 'error')
  const hasPartial = details.some((detail) => detail.status === 'partial')
  let message = action === 'store' ? 'Store erfolgreich' : 'Recall erfolgreich'
  if (hasPartial) message = 'Vorgang abgeschlossen – mit Hinweisen'
  if (hasError) message = 'Vorgang abgeschlossen – Fehler aufgetreten'
  return {
    action,
    overall: hasError ? 'error' : 'ok',
    details,
    jobId: randomBytes(6).toString('hex'),
    started,
    finished: new Date().toISOString(),
    message,
  }
}

/** Prüft die Eingabe der Oberfläche und liefert die Richtung. */
function parseAction(input: { action?: unknown }): Action {
  const action = String(input?.action ?? '').toLowerCase()
  if (action !== 'store' && action !== 'recall') throw new CoreError('invalid_action')
  return action
}

/** Sammelt die gewählten Einträge aller Spalten der Oberfläche. */
function selectedItems(input: { categories?: unknown }): Array<{ key?: unknown; quick?: unknown }> {
  if (!isPlainObject(input?.categories)) return []
  return Object.values(input.categories).flatMap((items) => (Array.isArray(items) ? items : []))
}

export type IsProcessRunning = (app: 'protools' | 'soundminer') => Promise<boolean>

export function createPresetService(config: ConfigService, session: SessionService, isRunning: IsProcessRunning) {
  /** Liest Pfade und Benutzer. Nur mit Anmeldung möglich, das Archiv gehört einem Mitarbeiter. */
  async function context(action: Action): Promise<Context> {
    const user = session.requireUser().name
    const { data } = await config.getPaths()
    return {
      action,
      user,
      ptUser: String(data.PathPTUser ?? ''),
      archive: path.join(String(data.PathMitarbeiter ?? ''), user, 'immo24'),
    }
  }

  return {
    /** Für die Statusanzeige der Oberfläche. */
    async proToolsStatus() {
      return { online: await isRunning('protools') }
    },

    async soundminerStatus() {
      return { online: await isRunning('soundminer') }
    },

    /** Pro Tools: führt die gewählten Kategorien nacheinander aus. */
    async runProTools(input: { action?: unknown; categories?: unknown }) {
      const action = parseAction(input)
      const items = selectedItems(input)
      const find = (key: string) => items.find((item) => String(item?.key ?? '').toLowerCase() === key)
      const selected = PRO_TOOLS_CATEGORIES.filter(({ key }) => find(key))
      if (selected.length === 0) throw new CoreError('nothing_selected')

      const started = new Date().toISOString()
      const ctx = await context(action)
      const details: CategoryResult[] = []
      for (const { key, category, run } of selected) {
        details.push(await runCategory(category, () => run(ctx, !!find(key)?.quick)))
      }
      return summarize(action, started, details)
    },

    /**
     * Soundminer: kopiert die Tab-Layouts.
     * Läuft Soundminer gerade, brechen wir ab, weil es die Dateien sonst überschreibt.
     */
    async runSoundminer(input: { action?: unknown; categories?: unknown }) {
      const action = parseAction(input)
      const wanted = selectedItems(input).some((item) => String(item?.key ?? '').toLowerCase() === 'tablayouts')
      if (!wanted) throw new CoreError('nothing_selected')

      const started = new Date().toISOString()
      if (await isRunning('soundminer')) {
        return summarize(action, started, [{
          category: 'preflight',
          status: 'error',
          note: 'Soundminer läuft – bitte zuerst Soundminer schließen.',
        }])
      }

      const ctx = await context(action)
      const { data: modules } = await config.getModules()
      const soundminer = isPlainObject(modules.soundminer) ? modules.soundminer : {}
      const details = [await runCategory('tablayouts', async () => {
        if (soundminer.version !== 'V6 Pro') throw new Error(`Soundminer-Version nicht unterstützt: ${String(soundminer.version)}`)
        const { source, target } = direction(ctx, String(soundminer.supportPath ?? ''), path.join(ctx.archive, 'soundminer'))
        if (!(await exists(source))) throw new SourceMissing(source)
        await fs.mkdir(target, { recursive: true })
        for (const name of await fs.readdir(source)) {
          if (name.includes('tabstate')) await fs.copyFile(path.join(source, name), path.join(target, name))
        }
      })]
      return summarize(action, started, details)
    },
  }
}
