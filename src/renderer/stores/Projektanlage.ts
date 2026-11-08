/**
 * Der Speicher der Seite Produktionsbuch: Formular, Auswahllisten und Projektliste.
 * Hier steht auch der angemeldete Nutzer, den die Kopfleiste anzeigt.
 * Die eigentliche Arbeit macht das Backend, dieser Speicher ruft es nur auf.
 */
import { defineStore } from 'pinia'

import { localDate } from '../../core/dates'
import { checkMoids, checkWindowsName, formatMoids } from '../../core/names'
import { backend, BackendError } from '@/lib/backend'
// Dieselben Regeln wie im Backend, damit Formular und Prüfung nie auseinanderlaufen
function windowsNameReport(input) {
  const errors = checkWindowsName(input)
  return { valid: errors.length === 0, errors }
}
function windowsFieldReports({ projektname, moid, kunde, anmerkung }) {
  return {
    projektname: windowsNameReport(projektname),
    moid:        windowsNameReport(moid),
    kunde:       windowsNameReport(String(kunde)),
    anmerkung:   windowsNameReport(anmerkung),
  }
}
function collectValidationDetails(reports) {
  return Object.entries<any>(reports)
    .filter(([, rep]) => !rep.valid)
    .map(([field, rep]) => ({ field, errors: rep.errors }))
}

const FIELD_LABELS = {
  projektname: 'Projektname',
  anmerkung: 'Anmerkung',
  moid: 'Mo-ID',
  kunde: 'Kunde',
}


export const useProjektanlage = defineStore('Projektanlage', {
  state: () => ({
    kunden: [] as any[],
    templates: [] as any[],
    rows: [] as any[],
    stufen: [] as any[],
    form: {
      kunde: '',
      vorhanden: 'neu',
      projektname: '',
      moid: '',
      datum: localDate(),
      stufe: '',
      template: '',
      // Freier Zusatz für den Sessionnamen, etwa "Kurzversion"
      anmerkung: '',
      // Bei vorhandenen Projekten: der in der Liste gewählte Projektordner
      ordner: '',
      // Projekt ohne Mo-ID, etwa weil es nicht in der Datenbank steht
      ohneMoid: false,
    },
    loading: { kunden:false, templates:false, rows:false, stufen:false, create:false },
    activeUser: null as string | null,
    renameEnabled: false,
    // Das Feld Anmerkung gibt es nur, wenn das Session-Schema {{anmerkung}} enthält
    noteEnabled: false,
  }),

  actions: {
    async fetchActiveUser() {
      try {
        this.activeUser = await backend.getActiveUser()
      } catch {
        this.activeUser = null
      }
    },

    async init() {
      await Promise.allSettled([ this.loadKunden(), this.loadTemplates(), this.loadRenameEnabled(), this.loadNoteEnabled() ])
    },

    // Ist das Umbenennen in der Konfiguration eingeschaltet?
    async loadRenameEnabled() {
      this.renameEnabled = await backend.isRenameEnabled()
    },

    // Sieht das Session-Schema eine Anmerkung vor?
    async loadNoteEnabled() {
      const { data } = await backend.getSchema()
      this.noteEnabled = String((data as Record<string, unknown>)?.sessionSchema ?? '').includes('{{anmerkung}}')
      if (!this.noteEnabled) this.form.anmerkung = ''
    },

    // Nach der Konfiguration: Listen neu laden. Ein gewählter Kunde bleibt gewählt,
    // seine Produktionsstufen können sich aber geändert haben.
    async refreshAfterConfig() {
      await Promise.allSettled([ this.loadKunden(), this.loadTemplates(), this.loadRenameEnabled(), this.loadNoteEnabled() ])
      if (this.form.kunde) await this.selectKunde(this.form.kunde)
    },

    async loadKunden() {
      this.loading.kunden = true
      try {
        const raw = await backend.listCustomers()
        this.kunden = (Array.isArray(raw) ? raw : []).map(k => ({
          label: String(k.label ?? ''),
          value: String(k.value ?? ''),
          stufen: Array.isArray(k.stufen) ? k.stufen.map(s => ({
            label: String(s.label ?? ''),
            value: String(s.value ?? ''),
          })) : []
        }))
      } finally {
        this.loading.kunden = false
      }
    },

    async loadTemplates() {
      this.loading.templates = true
      try { this.templates = await backend.listTemplates() }
      finally { this.loading.templates = false }
    },

    async selectKunde(kunde) {
      // Ein gewähltes Projekt gehört zum bisherigen Kunden
      if (kunde !== this.form.kunde) this.form.ordner = ''
      this.form.kunde = kunde
      await Promise.all([this.loadRows(kunde), this.loadStufenForKunde(kunde)])
    },

    async loadRows(kunde) {
      if (!kunde) { this.rows = []; return }
      this.loading.rows = true
      try { this.rows = await backend.listProjects(kunde) }
      finally { this.loading.rows = false }
    },

    async loadStufenForKunde(kunde) {
      this.loading.stufen = true
      try {
        const entry = this.kunden.find(k => k.value === kunde || k.label === kunde)
        this.stufen = entry?.stufen || []
      } finally { this.loading.stufen = false }
    },

    // MoIDs groß und einheitlich getrennt, etwa AB12+CD34. Läuft auch beim Verlassen der Felder.
    normalizeNames() {
      this.form.moid = this.form.ohneMoid ? '' : formatMoids(this.form.moid)
      this.form.projektname = String(this.form.projektname ?? '').trim()
    },

    validateRequired() {
      const f = this.form, fehlende: string[] = []
      if (!f.kunde) fehlende.push('Kunde')
      if (!f.datum) fehlende.push('Datum')
      if (!f.moid && !f.ohneMoid) fehlende.push('Mo-ID')
      if (!f.projektname) fehlende.push('Projektname')
      if (!f.stufe) fehlende.push('Produktionsstufe')
      if (!f.template) fehlende.push('Template')
      return fehlende
    },

    validateWindows() {
      const reports = windowsFieldReports(this.form)
      return collectValidationDetails(reports)
    },
    throwIfWindowsInvalid() {
      const details = this.validateWindows()
      if (details.length) {
        // Gleicher Aufbau wie ein Fehler aus dem Backend, die Seite behandelt beide gleich
        throw new BackendError({ code: 'validation_failed', details: { details } })
      }
    },

    windowsMessageFor(field, value) {
      // Liefert true (ok) oder einen kurzen Fehlersatz für Vuetify-Rules
      const rep = windowsNameReport(String(value ?? ''))
      if (rep.valid) return true
      const first = (rep.errors || [])[0]
      return first?.message || 'Ungültiger Name'
    },
    // Prüfung für das Feld Mo-ID: jede höchstens vier Stellen, keine doppelt
    moidRule(value) {
      return checkMoids(value)[0]?.message ?? true
    },
    windowsRule(field) {
      // Factory für Vuetify :rules → (v) => true|string
      return (v) => this.windowsMessageFor(field, v)
    },

    async createOrResolve() {
      const fehlende = this.validateRequired()
      if (fehlende.length) throw new Error(`Bitte ausfüllen: ${fehlende.join(', ')}`)
      this.throwIfWindowsInvalid()

      // Bei neuen Projekten die Eingaben bereinigen, damit das Formular zeigt, was entsteht
      if (this.form.vorhanden === 'neu') this.normalizeNames()

      if (this.form.vorhanden !== 'neu' && !this.form.ordner) {
        throw new Error('Bitte in der Liste ein Projekt auswählen.')
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.form.datum)) throw new Error('Das Datum muss das Format JJJJ-MM-TT haben.')

      const { kunde, projektname, moid, datum, template, stufe, ordner, ohneMoid, anmerkung } = this.form
      const payload = { kunde, projektname, moid, datum, template, stufe, ordner, ohneMoid, anmerkung }

      this.loading.create = true
      try {
        if (this.form.vorhanden === 'neu') {
          const res = await backend.createProject(payload)
          await this.loadRows(this.form.kunde)
          // Die Anmerkung gilt nur für diese eine Session
          this.form.anmerkung = ''
          return res
        } else {
          const resolved = await backend.addSession(payload)
          if (!resolved?.templateDest) throw new Error('Kein passender Projektordner gefunden!')
          await this.loadRows(this.form.kunde)
          this.form.anmerkung = ''
          return resolved
        }
      } finally {
        this.loading.create = false
      }
    },

    // Nach dem Umbenennen: Liste neu laden, die alten Werte im Formular passen nicht mehr
    async resetAfterRename() {
      Object.assign(this.form, { projektname: '', moid: '', ordner: '', ohneMoid: false, datum: localDate() })
      await this.loadRows(this.form.kunde)
    },

    resetForm() {
      this.form = { kunde:'', vorhanden:'neu', projektname:'', moid:'', datum: localDate(), stufe:'', template:'', anmerkung:'', ordner:'', ohneMoid:false }
      this.rows = []
      this.stufen = []
    },

    formatValidationDetails(details) {
      if (!Array.isArray(details)) return []
      return details.map(d => {
        const label = FIELD_LABELS[d.field] || d.field
        const parts = (d.errors || []).map(err => {
          if (err.code === 'forbidden_chars') {
            if (Array.isArray(err.chars) && err.chars.length) {
              return `Unzulässige Zeichen: ${err.chars.join(' ')}`
            }
            return 'Unzulässige Zeichen'
          }
          return err.message || err.code
        })
        return `${label}: ${parts.join('; ')}`
      })
    },
  },
})
