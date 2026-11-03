import { defineStore } from 'pinia'

import { checkWindowsName } from '../../core/names'
import { backend, BackendError } from '@/lib/backend'
// Dieselben Regeln wie im Backend, damit Formular und Prüfung nie auseinanderlaufen
function windowsNameReport(input) {
  const errors = checkWindowsName(input)
  return { valid: errors.length === 0, errors }
}
function windowsFieldReports({ projektname, moid, kunde }) {
  return {
    projektname: windowsNameReport(projektname),
    moid:        windowsNameReport(moid),
    kunde:       windowsNameReport(String(kunde)),
  }
}
function collectValidationDetails(reports) {
  return Object.entries<any>(reports)
    .filter(([, rep]) => !rep.valid)
    .map(([field, rep]) => ({ field, errors: rep.errors }))
}

const FIELD_LABELS = {
  projektname: 'Projektname',
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
      datum: new Date().toISOString().slice(0,10),
      stufe: '',
      template: '',
      // Bei vorhandenen Projekten: der in der Liste gewählte Projektordner
      ordner: '',
      // Projekt ohne Mo-ID, etwa weil es nicht in der Datenbank steht
      ohneMoid: false,
    },
    loading: { kunden:false, templates:false, rows:false, stufen:false, create:false },
    error: null as string | null,
    activeUser: null as string | null,
    renameEnabled: false,
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
      await Promise.allSettled([ this.loadKunden(), this.loadTemplates(), this.loadRenameEnabled() ])
    },

    // Ist das Umbenennen in der Konfiguration eingeschaltet?
    async loadRenameEnabled() {
      this.renameEnabled = await backend.isRenameEnabled()
    },

    // Nach der Konfiguration: Listen neu laden. Ein gewählter Kunde bleibt gewählt,
    // seine Produktionsstufen können sich aber geändert haben.
    async refreshAfterConfig() {
      await Promise.allSettled([ this.loadKunden(), this.loadTemplates(), this.loadRenameEnabled() ])
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

    // MoID immer groß, keine Leerzeichen am Rand. Läuft auch beim Verlassen der Felder.
    normalizeNames() {
      this.form.moid = this.form.ohneMoid ? '' : String(this.form.moid ?? '').trim().toUpperCase()
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

      const { kunde, projektname, moid, datum, template, stufe, ordner, ohneMoid } = this.form
      const payload = { kunde, projektname, moid, datum, template, stufe, ordner, ohneMoid }

      this.loading.create = true
      try {
        if (this.form.vorhanden === 'neu') {
          const res = await backend.createProject(payload)
          await this.loadRows(this.form.kunde)
          return res
        } else {
          const resolved = await backend.addSession(payload)
          if (!resolved?.templateDest) throw new Error('Kein passender Projektordner gefunden!')
          await this.loadRows(this.form.kunde)
          return resolved
        }
      } finally {
        this.loading.create = false
      }
    },

    // Nach dem Umbenennen: Liste neu laden, die alten Werte im Formular passen nicht mehr
    async resetAfterRename() {
      Object.assign(this.form, { projektname: '', moid: '', ordner: '', ohneMoid: false, datum: new Date().toISOString().slice(0, 10) })
      await this.loadRows(this.form.kunde)
    },

    resetForm() {
      const today = new Date().toISOString().slice(0,10)
      this.form = { kunde:'', vorhanden:'neu', projektname:'', moid:'', datum: today, stufe:'', template:'', ordner:'', ohneMoid:false }
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
