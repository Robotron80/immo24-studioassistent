import { defineStore } from 'pinia'

import { backend } from '@/lib/backend'
// Windows-Dateinamen-Regeln
const WINDOWS_FORBIDDEN_RE = /[<>:"/\\|?*\u0000-\u001F]/g
function windowsNameReport(input) {
  const s = String(input ?? '').trim()
  const res = { valid: true, errors: [] }
  const bad = s.match(WINDOWS_FORBIDDEN_RE)
  if (bad) {
    res.valid = false
    const uniq = [...new Set(bad)]
    res.errors.push({
      code: 'forbidden_chars',
      chars: uniq,
      message: `Unzulässige Zeichen: ${uniq.join(' ')}`
    })
  }
  if (/[. ]$/.test(s)) {
    res.valid = false
    res.errors.push({
      code: 'trailing_dot_or_space',
      message: 'Darf nicht mit Punkt oder Leerzeichen enden'
    })
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(s)) {
    res.valid = false
    res.errors.push({
      code: 'reserved_name',
      message: 'Reservierter Windows-Name'
    })
  }
  return res
}
function windowsFieldReports({ projektname, moid, kunde }) {
  return {
    projektname: windowsNameReport(projektname),
    moid:        windowsNameReport(moid),
    kunde:       windowsNameReport(String(kunde)),
  }
}
function collectValidationDetails(reports) {
  return Object.entries(reports)
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
    kunden: [],
    templates: [],
    rows: [],
    stufen: [],
    form: {
      kunde: '',
      vorhanden: 'neu',
      projektname: '',
      moid: '',
      datum: new Date().toISOString().slice(0,10),
      stufe: '',
      template: '',
    },
    loading: { kunden:false, templates:false, rows:false, stufen:false, create:false },
    error: null,
    activeUser: null,
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
      try { await this.fetchActiveUser() } catch {}
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
      this.form.moid = String(this.form.moid ?? '').trim().toUpperCase()
      this.form.projektname = String(this.form.projektname ?? '').trim()
    },

    validateRequired() {
      const f = this.form, fehlende = []
      if (!f.kunde) fehlende.push('Kunde')
      if (!f.datum) fehlende.push('Datum')
      if (!f.moid) fehlende.push('Mo-ID')
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
        const e = new Error('validation_failed')
        e.status = 422
        e.error = 'validation_failed'
        e.details = details
        throw e
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

      const stufeValue = this.form.stufe
      const stufeLabel =
        this.stufen.find(s => s.value === stufeValue)?.label
        || (stufeValue || '').replace(/^\d+_/, '').replace(/_/g, ' ').trim()

      // Bei neuen Projekten die Eingaben bereinigen, damit das Formular zeigt, was entsteht
      if (this.form.vorhanden === 'neu') this.normalizeNames()

      const { kunde, vorhanden, projektname, moid, datum, template, stufe } = this.form
      const payload = { kunde, vorhanden, projektname, moid, datum, template, stufe, stufeLabel }

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
      Object.assign(this.form, { projektname: '', moid: '', datum: new Date().toISOString().slice(0, 10) })
      await this.loadRows(this.form.kunde)
    },

    resetForm() {
      const today = new Date().toISOString().slice(0,10)
      this.form = { kunde:'', vorhanden:'neu', projektname:'', moid:'', datum: today, stufe:'', template:'' }
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
