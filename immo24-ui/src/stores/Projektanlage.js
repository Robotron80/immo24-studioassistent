import { defineStore } from 'pinia'

const API = import.meta.env.VITE_API_BASE || '/api'

async function getJSON(url, options) {
  const r = await fetch(url, options)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export const useProjektanlage = defineStore('Projektanlage', {
  state: () => ({
    kunden: [],          // [{label,value, stufen?:[]}]
    templates: [],       // [{label,value}]
    rows: [],            // Tabelle
    stufen: [],          // abhängig von ausgewähltem Kunden
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
  }),

  actions: {
    async init() {
      await Promise.all([this.loadKunden(), this.loadTemplates()])
    },

    async loadKunden() {
    this.loading.kunden = true
    try {
        const raw = await getJSON(`${API}/projektanlage/kunden`)
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
      try { this.templates = await getJSON(`${API}/projektanlage/templates`) }
      finally { this.loading.templates = false }
    },

    async selectKunde(kunde) {
      this.form.kunde = kunde
      await Promise.all([this.loadRows(kunde), this.loadStufenForKunde(kunde)])
    },

    async loadRows(kunde) {
      if (!kunde) { this.rows = []; return }
      this.loading.rows = true
      try { this.rows = await getJSON(`${API}/projektanlage/projekte?kunde=${encodeURIComponent(kunde)}`) }
      finally { this.loading.rows = false }
    },

    async loadStufenForKunde(kunde) {
      this.loading.stufen = true
      try {
        const entry = this.kunden.find(k => k.value === kunde || k.label === kunde)
        this.stufen = entry?.stufen || []
      } finally { this.loading.stufen = false }
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

    async createOrResolve() {
      const fehlende = this.validateRequired()
      if (fehlende.length) throw new Error(`Bitte ausfüllen: ${fehlende.join(', ')}`)

      this.loading.create = true
      try {
        if (this.form.vorhanden === 'neu') {
          const res = await getJSON(`${API}/projects`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify(this.form),
          })
          if (res?.templateDest && res?.filename) {
            try {
              await getJSON(`${API}/os/open`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ fullPath: `${res.templateDest}/${res.filename}` })
              })
            } catch {}
          }
        } else {
          const resolved = await getJSON(`${API}/projects/resolve-existing`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify(this.form),
          })
          if (!resolved?.templateDest) throw new Error('Kein passender Projektordner gefunden!')
        }
        await this.loadRows(this.form.kunde)
      } finally {
        this.loading.create = false
      }
    },

    resetForm() {
      const today = new Date().toISOString().slice(0,10)
      this.form = { kunde:'', vorhanden:'neu', projektname:'', moid:'', datum: today, stufe:'', template:'' }
      this.rows = []
      this.stufen = []
    },
  },
})