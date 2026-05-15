import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import { GLOBAL_ROLES } from '../lib/constants'
import { useMagasin } from '../store/useMagasin'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, where, serverTimestamp,
} from 'firebase/firestore'

const MODELES = ['CX COU', "TON'R", 'SOLEIL', 'ATX', 'RCC', 'MATCH', 'MATCH IT', 'MATCH +', 'SUPERINOX', 'RCX']

const PRIX_MODELES = {
  'CX COU':    220,
  "TON'R":     140,
  'SOLEIL':    195,
  'ATX':       320,
  'RCC':       220,
  'MATCH':      93,
  'MATCH IT':  150,
  'MATCH +':   180,
  'SUPERINOX': 215,
  'RCX':       240,
}

const MARQUAGE_TYPES = [
  { value: '',          label: 'Sans marquage',       prix: null },
  { value: 'classique', label: 'Classique / Italique', prix: 15 },
  { value: 'stylisee',  label: 'Stylisée',             prix: 19 },
]

const PRIX_LIVRAISON = 7.10

const STATUTS_ORDER = ['en_attente', 'commande', 'recu', 'livre', 'annule']

const STATUT_CONFIG = {
  en_attente: {
    label: 'En attente',
    pill: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300',
    activeTab: 'border-gray-500 text-gray-700 dark:text-gray-300',
  },
  commande: {
    label: 'Commandé OBUT',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    activeTab: 'border-blue-500 text-blue-700 dark:text-blue-300',
  },
  recu: {
    label: 'Reçu en magasin',
    pill: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    activeTab: 'border-violet-500 text-violet-700 dark:text-violet-300',
  },
  livre: {
    label: 'Remis au client',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    activeTab: 'border-emerald-500 text-emerald-700 dark:text-emerald-300',
  },
  annule: {
    label: 'Annulé',
    pill: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',
    activeTab: 'border-red-500 text-red-600 dark:text-red-400',
  },
}

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function todayStr() {
  return new Date().toLocaleDateString('fr-CA')
}

// ── Modal création / édition ──────────────────────────────────────────────────
function CommandeModal({ cmd, magasins, defaultMagasinId, profile, isGlobal, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    clientNom:     cmd?.clientNom     ?? '',
    clientPrenom:  cmd?.clientPrenom  ?? '',
    clientTel:     cmd?.clientTel     ?? '',
    dateCommande:  cmd?.dateCommande  ?? todayStr(),
    modele:        cmd?.modele        ?? MODELES[0],
    diametre:      cmd?.diametre      ?? '',
    strie:         cmd?.strie         ?? '',
    poids:         cmd?.poids         ?? '',
    marquage:      cmd?.marquage      ?? '',
    marquageType:  cmd?.marquageType  ?? '',
    prixModele:    cmd?.prixModele    != null ? String(cmd.prixModele)    : String(PRIX_MODELES[cmd?.modele ?? MODELES[0]] ?? ''),
    prixMarquage:  cmd?.prixMarquage  != null ? String(cmd.prixMarquage)  : '',
    prixLivraison: cmd?.prixLivraison != null ? String(cmd.prixLivraison) : String(PRIX_LIVRAISON),
    acompte:       cmd?.acompte       != null ? String(cmd.acompte)       : '',
    statut:        cmd?.statut        ?? 'en_attente',
    magasinId:     cmd?.magasinId     ?? defaultMagasinId ?? '',
  })
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleModeleChange(modele) {
    setForm(f => ({ ...f, modele, prixModele: String(PRIX_MODELES[modele] ?? '') }))
  }

  function handleMarquageTypeChange(marquageType) {
    const found = MARQUAGE_TYPES.find(mt => mt.value === marquageType)
    setForm(f => ({ ...f, marquageType, prixMarquage: found?.prix != null ? String(found.prix) : '' }))
  }

  const prixModeleN = parseFloat(form.prixModele) || 0
  const prixMarquageN = parseFloat(form.prixMarquage) || 0
  const prixLivraisonN = parseFloat(form.prixLivraison) || 0
  const acompteN = parseFloat(form.acompte) || 0
  const totalTTC = prixModeleN + prixMarquageN + prixLivraisonN
  const resteARegler = totalTTC - acompteN

  async function handleSave(e) {
    e.preventDefault()
    if (!form.clientNom.trim() || !form.magasinId) return
    setSaving(true)
    try {
      await onSave({
        clientNom: form.clientNom.trim(),
        clientPrenom: form.clientPrenom.trim() || null,
        clientTel: form.clientTel.trim() || null,
        dateCommande: form.dateCommande,
        modele: form.modele,
        diametre: form.diametre.trim() || null,
        strie: form.strie.trim() || null,
        poids: form.poids.trim() || null,
        marquage:      form.marquage.trim()      || null,
        marquageType:  form.marquageType          || null,
        prixModele: prixModeleN || null,
        prixMarquage: prixMarquageN || null,
        prixLivraison: prixLivraisonN || null,
        totalTTC: totalTTC || null,
        acompte: acompteN || null,
        resteARegler: totalTTC ? resteARegler : null,
        etabliePar: profile?.displayName || null,
        statut: form.statut,
        magasinId: form.magasinId,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {cmd?.id ? 'Modifier la commande' : 'Nouvelle commande OBUT'}
            </span>
            {cmd?.id && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUT_CONFIG[cmd.statut]?.pill}`}>
                {STATUT_CONFIG[cmd.statut]?.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Corps scrollable */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Magasin (global only) */}
            {isGlobal && (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin *</span>
                <select className="Input" value={form.magasinId} onChange={e => set('magasinId', e.target.value)} required>
                  <option value="">— Sélectionner un magasin</option>
                  {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </label>
            )}

            {/* Client */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-2">Client</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Nom *</span>
                  <input className="Input" value={form.clientNom} onChange={e => set('clientNom', e.target.value)} required autoFocus />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Prénom</span>
                  <input className="Input" value={form.clientPrenom} onChange={e => set('clientPrenom', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Téléphone</span>
                  <input className="Input" type="tel" value={form.clientTel} onChange={e => set('clientTel', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Date de commande</span>
                  <input className="Input" type="date" value={form.dateCommande} onChange={e => set('dateCommande', e.target.value)} />
                </label>
              </div>
            </div>

            {/* Boules */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-2">Boules</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Modèle *</span>
                  <select className="Input" value={form.modele} onChange={e => handleModeleChange(e.target.value)}>
                    {MODELES.map(m => (
                      <option key={m} value={m}>{m} — {PRIX_MODELES[m]} €</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Diamètre</span>
                  <input className="Input" value={form.diametre} onChange={e => set('diametre', e.target.value)} placeholder="ex : 70.5 mm" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Strie</span>
                  <input className="Input" value={form.strie} onChange={e => set('strie', e.target.value)} placeholder="ex : 0" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Poids</span>
                  <input className="Input" value={form.poids} onChange={e => set('poids', e.target.value)} placeholder="ex : 680 g" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Type de marquage</span>
                  <select className="Input" value={form.marquageType} onChange={e => handleMarquageTypeChange(e.target.value)}>
                    {MARQUAGE_TYPES.map(mt => (
                      <option key={mt.value} value={mt.value}>
                        {mt.label}{mt.prix != null ? ` — ${mt.prix} €` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Texte du marquage</span>
                  <input className="Input" value={form.marquage} onChange={e => set('marquage', e.target.value)}
                    placeholder="Texte, initiales…" disabled={!form.marquageType} />
                </label>
              </div>
            </div>

            {/* Prix */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-2">Prix</p>
              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Modèle TTC (€)</span>
                  <input className="Input" inputMode="decimal" value={form.prixModele}
                    onChange={e => set('prixModele', e.target.value)} placeholder="0.00" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                    Marquage TTC (€)
                    {!form.marquageType && <span className="ml-1 text-gray-300 dark:text-neutral-600 font-normal">— choisir type</span>}
                  </span>
                  <input className="Input" inputMode="decimal" value={form.prixMarquage}
                    onChange={e => set('prixMarquage', e.target.value)} placeholder="0.00"
                    disabled={!form.marquageType} />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">Livraison TTC (€)</span>
                  <input className="Input" inputMode="decimal" value={form.prixLivraison}
                    onChange={e => set('prixLivraison', e.target.value)} placeholder="0.00" />
                </label>
              </div>
              {totalTTC > 0 && (
                <div className="mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 px-4 py-3 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500 mb-1">Total TTC</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{totalTTC.toFixed(2)} €</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500 mb-1">Acompte versé (€)</p>
                    <input className="Input text-xs h-7 px-2" inputMode="decimal" value={form.acompte}
                      onChange={e => set('acompte', e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500 mb-1">Reste à régler</p>
                    <p className={`text-sm font-bold ${resteARegler > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {resteARegler.toFixed(2)} €
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Statut */}
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Statut</span>
              <select className="Input" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {STATUTS_ORDER.filter(s => s !== 'recu' && s !== 'livre').map(s => (
                  <option key={s} value={s}>{STATUT_CONFIG[s].label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
            {cmd?.id && onDelete ? (
              <button type="button" onClick={() => onDelete(cmd)}
                className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10 transition-colors">
                Supprimer
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                Annuler
              </button>
              <button type="submit" disabled={saving || !form.clientNom.trim() || !form.magasinId}
                className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
// ── Statistiques ─────────────────────────────────────────────────────────────
const MONTHS_FR    = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const MONTHS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function StatCard({ label, value, sub, color = 'teal', trend }) {
  const cls = {
    teal:   { wrap: 'from-teal-50 to-teal-100/50 dark:from-teal-500/10 dark:to-teal-500/5 border-teal-200 dark:border-teal-500/30', val: 'text-teal-700 dark:text-teal-300' },
    blue:   { wrap: 'from-blue-50 to-blue-100/50 dark:from-blue-500/10 dark:to-blue-500/5 border-blue-200 dark:border-blue-500/30', val: 'text-blue-700 dark:text-blue-300' },
    violet: { wrap: 'from-violet-50 to-violet-100/50 dark:from-violet-500/10 dark:to-violet-500/5 border-violet-200 dark:border-violet-500/30', val: 'text-violet-700 dark:text-violet-300' },
    amber:  { wrap: 'from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border-amber-200 dark:border-amber-500/30', val: 'text-amber-700 dark:text-amber-300' },
  }[color] || {}
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${cls.wrap} border p-4 space-y-1`}>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${cls.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-neutral-500">{sub}</p>}
      {trend !== undefined && trend !== null && (
        <p className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} % vs N-1
        </p>
      )}
    </div>
  )
}

function ObutBarChart({ data }) {
  const max = Math.max(...data.map(d => Math.max(d.current || 0, d.previous || 0)), 1)
  return (
    <div className="flex items-end gap-1.5 h-32 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <div className="w-full flex items-end justify-center gap-px h-24">
            <div className="w-[46%] bg-indigo-500 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d.current || 0) / max) * 100}%`, minHeight: d.current > 0 ? '3px' : '0' }}
              title={`${d.current || 0}`} />
            <div className="w-[46%] bg-gray-200 dark:bg-neutral-600 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d.previous || 0) / max) * 100}%`, minHeight: d.previous > 0 ? '3px' : '0' }}
              title={`${d.previous || 0}`} />
          </div>
          <span className="text-[8px] text-gray-400 dark:text-neutral-500 leading-none truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  )
}



function StatsSection({ commandes, magasins }) {
  const now          = new Date()
  const currentYear  = now.getFullYear()
  const prevYear     = currentYear - 1
  const currentMonth = now.getMonth()

  const [periode,      setPeriode]      = useState('annee')
  const [selectedYear, setSelectedYear] = useState(currentYear)

  const valid = useMemo(
    () => commandes.filter(c => c.statut !== 'annule' && c.dateCommande),
    [commandes]
  )

  const pad = n => String(n).padStart(2, '0')

  const byMonthKey = useMemo(() => {
    const map = {}
    valid.forEach(c => {
      const key = c.dateCommande.slice(0, 7)
      if (!map[key]) map[key] = { count: 0, revenue: 0 }
      map[key].count++
      map[key].revenue += c.totalTTC || 0
    })
    return map
  }, [valid])

  const byYear = useMemo(() => {
    const map = {}
    valid.forEach(c => {
      const y = c.dateCommande.slice(0, 4)
      if (!map[y]) map[y] = { count: 0, revenue: 0 }
      map[y].count++
      map[y].revenue += c.totalTTC || 0
    })
    return map
  }, [valid])

  const thisYearData  = byYear[String(currentYear)] || { count: 0, revenue: 0 }
  const lastYearData  = byYear[String(prevYear)]    || { count: 0, revenue: 0 }

  const yoyCount = lastYearData.count   > 0 ? Math.round((thisYearData.count   - lastYearData.count)   / lastYearData.count   * 100) : null
  const yoyCA    = lastYearData.revenue > 0 ? Math.round((thisYearData.revenue - lastYearData.revenue) / lastYearData.revenue * 100) : null

  const availableYears = useMemo(() => [...new Set(valid.map(c => c.dateCommande.slice(0, 4)))].sort((a, b) => b - a), [valid])

  const filtered = useMemo(() => valid.filter(c => {
    const y = Number(c.dateCommande.slice(0, 4))
    const m = Number(c.dateCommande.slice(5, 7)) - 1
    if (periode === 'annee') return y === selectedYear
    if (periode === 'ytd')   return y === currentYear
    if (periode === 'mois')  return y === currentYear && m === currentMonth
    return true
  }), [valid, periode, selectedYear, currentYear, currentMonth])

  const filteredCA = filtered.reduce((s, c) => s + (c.totalTTC || 0), 0)

  const monthlyComparison = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    label:    MONTHS_FR[i],
    current:  byMonthKey[`${currentYear}-${pad(i + 1)}`]?.count || 0,
    previous: byMonthKey[`${prevYear}-${pad(i + 1)}`]?.count   || 0,
  })), [byMonthKey, currentYear, prevYear])

  const tableYear  = periode === 'ytd' ? currentYear : selectedYear
  const showTable  = periode === 'annee' || periode === 'ytd'
  const monthlyTable = useMemo(() => !showTable ? null : MONTHS_LONG.map((label, i) => {
    const curr = byMonthKey[`${tableYear}-${pad(i + 1)}`]     || { count: 0, revenue: 0 }
    const prev = byMonthKey[`${tableYear - 1}-${pad(i + 1)}`] || { count: 0, revenue: 0 }
    return { label, curr, prev, diff: curr.count - prev.count }
  }), [byMonthKey, showTable, tableYear])

  const tableTotals = monthlyTable ? {
    curr: monthlyTable.reduce((s, r) => s + r.curr.count, 0),
    prev: monthlyTable.reduce((s, r) => s + r.prev.count, 0),
    ca:   monthlyTable.reduce((s, r) => s + r.curr.revenue, 0),
    diff: monthlyTable.reduce((s, r) => s + r.diff, 0),
  } : null

  const byModel = useMemo(() => {
    const map = {}
    filtered.forEach(c => {
      if (!map[c.modele]) map[c.modele] = { count: 0, revenue: 0 }
      map[c.modele].count++
      map[c.modele].revenue += c.totalTTC || 0
    })
    return map
  }, [filtered])

  const sortedModels = MODELES
    .map(m => ({ model: m, ...(byModel[m] || { count: 0, revenue: 0 }) }))
    .filter(m => m.count > 0)
    .sort((a, b) => b.count - a.count)
  const maxModel = Math.max(...sortedModels.map(m => m.count), 1)

  const byMagasin = useMemo(() => {
    const map = {}
    filtered.forEach(c => { map[c.magasinId] = (map[c.magasinId] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])
  const maxMagasin = byMagasin[0]?.[1] || 1

  if (valid.length === 0) {
    return <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">Aucune commande enregistrée pour afficher des statistiques.</div>
  }

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total commandes" value={valid.length} sub="Toutes années confondues" color="blue" />
        <StatCard label="Chiffre d'affaires total" value={`${valid.reduce((s, c) => s + (c.totalTTC || 0), 0).toFixed(0)} €`} sub="Toutes années confondues" color="teal" />
        <StatCard label="Cette année" value={thisYearData.count} sub={String(currentYear)} color="violet" trend={yoyCount} />
        <StatCard label="CA cette année" value={`${thisYearData.revenue.toFixed(0)} €`} sub={String(currentYear)} color="amber" trend={yoyCA} />
      </div>

      {/* Bar chart N vs N-1 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Commandes par mois — N vs N-1</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-neutral-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-indigo-500 inline-block" />{currentYear}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gray-300 dark:bg-neutral-600 inline-block" />{prevYear}</span>
          </div>
        </div>
        <ObutBarChart data={monthlyComparison} />
      </div>

      {/* Analyse par période */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Analyse par période</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="Input h-8 text-xs px-2" value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="mois">Ce mois</option>
              <option value="annee">Par année</option>
              <option value="ytd">Depuis début d'année</option>
              <option value="tout">Tout</option>
            </select>
            {periode === 'annee' && (
              <select className="Input h-8 text-xs px-2" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-neutral-800 border-y border-gray-100 dark:border-neutral-800 py-3">
          <div className="flex items-center justify-between pr-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Commandes</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{filtered.length}</p>
          </div>
          <div className="flex items-center justify-between pl-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Chiffre d'affaires</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-neutral-100">{filteredCA.toFixed(0)} €</p>
          </div>
        </div>

        {sortedModels.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Par modèle</p>
            {sortedModels.map(m => (
              <div key={m.model} className="flex items-center gap-3">
                <p className="text-xs text-gray-600 dark:text-neutral-300 w-20 shrink-0 truncate font-medium">{m.model}</p>
                <div className="flex-1 h-3.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${(m.count / maxModel) * 100}%` }} />
                </div>
                <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-6 text-right shrink-0">{m.count}</p>
                <p className="text-xs text-gray-400 dark:text-neutral-500 w-16 text-right shrink-0">{m.revenue.toFixed(0)} €</p>
              </div>
            ))}
          </div>
        )}

        {byMagasin.length > 1 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Par magasin</p>
            {byMagasin.map(([magId, count]) => {
              const nom = magasins.find(m => m.id === magId)?.nom || magId
              return (
                <div key={magId} className="flex items-center gap-3">
                  <p className="text-xs text-gray-600 dark:text-neutral-300 w-28 shrink-0 truncate">{nom}</p>
                  <div className="flex-1 h-3.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${(count / maxMagasin) * 100}%` }} />
                  </div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-6 text-right shrink-0">{count}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Table mensuelle */}
      {showTable && monthlyTable && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Détail mensuel — {tableYear}</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                <th className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Mois</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear}</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear - 1}</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Évol.</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">CA {tableYear}</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTable.map(({ label, curr, prev, diff }, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2 text-gray-700 dark:text-neutral-300">{label}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-white">{curr.count || '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-400 dark:text-neutral-500">{prev.count || '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-neutral-600'}`}>
                    {curr.count === 0 && prev.count === 0 ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-neutral-400">{curr.revenue > 0 ? `${curr.revenue.toFixed(0)} €` : '—'}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-neutral-800/50 font-semibold border-t-2 border-gray-200 dark:border-neutral-700">
                <td className="px-4 py-2.5 text-gray-800 dark:text-neutral-200">Total</td>
                <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{tableTotals.curr}</td>
                <td className="px-4 py-2.5 text-right text-gray-500 dark:text-neutral-400">{tableTotals.prev}</td>
                <td className={`px-4 py-2.5 text-right ${tableTotals.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : tableTotals.diff < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-neutral-600'}`}>
                  {tableTotals.diff > 0 ? `+${tableTotals.diff}` : tableTotals.diff === 0 ? '=' : tableTotals.diff}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">{tableTotals.ca.toFixed(0)} €</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Obut() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const magasinId = isGlobal ? selectedId : profile?.magasinId
  const canDelete = isGlobal || profile?.role === 'directeurmag'

  const [commandes, setCommandes] = useState([])
  const [magasins, setMagasins] = useState([])
  const [modal, setModal] = useState(null)
  const [statut, setStatut] = useState('en_attente')

  // Magasins (global)
  useEffect(() => {
    if (!isGlobal) return
    return onSnapshot(
      query(collection(db, 'magasins'), orderBy('nom', 'asc')),
      snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [isGlobal])

  // Commandes
  useEffect(() => {
    let q
    if (!isGlobal) {
      if (!profile?.magasinId) return
      q = query(collection(db, 'obut_commandes'), where('magasinId', '==', profile.magasinId), orderBy('dateCommande', 'desc'))
    } else if (selectedId) {
      q = query(collection(db, 'obut_commandes'), where('magasinId', '==', selectedId), orderBy('dateCommande', 'desc'))
    } else {
      q = query(collection(db, 'obut_commandes'), orderBy('dateCommande', 'desc'))
    }
    return onSnapshot(q, snap => setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isGlobal, selectedId, profile?.magasinId])

  const grouped = useMemo(() => {
    const g = {}
    STATUTS_ORDER.forEach(s => { g[s] = [] })
    commandes.forEach(c => { if (g[c.statut]) g[c.statut].push(c) })
    return g
  }, [commandes])

  const counts = useMemo(() => {
    const c = {}
    STATUTS_ORDER.forEach(s => { c[s] = grouped[s]?.length ?? 0 })
    return c
  }, [grouped])

  async function handleSave(data) {
    if (modal?.id) {
      await updateDoc(doc(db, 'obut_commandes', modal.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'obut_commandes'), { ...data, createdBy: user.uid, createdAt: serverTimestamp() })
    }
  }

  async function handleDelete(cmd) {
    if (!confirm(`Supprimer la commande de "${cmd.clientNom}" ?`)) return
    await deleteDoc(doc(db, 'obut_commandes', cmd.id))
    setModal(null)
  }

  function magasinNom(id) {
    return magasins.find(m => m.id === id)?.nom || '—'
  }

  const displayed = grouped[statut] ?? []

  const statsActives = [
    { key: 'en_attente', label: 'En attente' },
    { key: 'commande',   label: 'Commandé OBUT' },
    { key: 'recu',       label: 'Reçu en magasin' },
  ]

  const VISIBLE_TABS = isGlobal
    ? ['en_attente', 'commande', 'recu', 'annule', 'stats']
    : ['en_attente', 'commande', 'recu', 'annule']

  async function handleMarquerRecu(e, cmd) {
    e.stopPropagation()
    await updateDoc(doc(db, 'obut_commandes', cmd.id), { statut: 'recu', updatedAt: serverTimestamp() })
  }

  async function handleArchive(e, cmd) {
    e.stopPropagation()
    if (!confirm(
      `Archiver la commande de "${cmd.clientNom}" ?\n\n` +
      `Conformément au RGPD, les données personnelles du client (nom, prénom, téléphone) seront définitivement supprimées. ` +
      `Les données commerciales (modèle, prix, date, magasin) sont conservées pour les statistiques.`
    )) return
    await updateDoc(doc(db, 'obut_commandes', cmd.id), {
      statut:       'livre',
      clientNom:    null,
      clientPrenom: null,
      clientTel:    null,
      updatedAt:    serverTimestamp(),
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Commandes OBUT</h1>
            <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
              {(() => { const n = commandes.filter(c => c.statut !== 'livre').length; return `Boules de pétanque sur mesure — ${n} commande${n > 1 ? 's' : ''}` })()}
            </p>
          </div>
          <button
            onClick={() => setModal({})}
            disabled={isGlobal && !selectedId}
            title={isGlobal && !selectedId ? 'Sélectionnez un magasin pour créer une commande' : undefined}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
            + Nouvelle commande
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {statsActives.map(s => (
            <button key={s.key} onClick={() => setStatut(s.key)}
              className={[
                'text-left p-4 rounded-2xl border transition-all',
                statut === s.key
                  ? 'bg-white dark:bg-neutral-900 border-gray-300 dark:border-neutral-600 shadow-sm ring-2 ring-gray-200 dark:ring-neutral-700'
                  : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:border-gray-300 dark:hover:border-neutral-700',
              ].join(' ')}>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts[s.key]}</p>
              <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-1">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
          {VISIBLE_TABS.map(s => {
            if (s === 'stats') return (
              <button key="stats" onClick={() => setStatut('stats')}
                className={[
                  'h-9 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                  statut === 'stats'
                    ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                Statistiques
              </button>
            )
            return (
              <button key={s} onClick={() => setStatut(s)}
                className={[
                  'h-9 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                  statut === s
                    ? STATUT_CONFIG[s].activeTab
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                {STATUT_CONFIG[s].label}
                {counts[s] > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {counts[s]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Statistiques */}
        {statut === 'stats' && <StatsSection commandes={commandes} magasins={magasins} />}

        {/* Contenu liste */}
        {statut !== 'stats' && (displayed.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
            Aucune commande « {STATUT_CONFIG[statut].label} ».
          </div>
        ) : (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                  {isGlobal && <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Magasin</th>}
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tél.</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Modèle</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Caractéristiques</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Marquage</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total TTC</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Acompte</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reste</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Par</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayed.map(cmd => (
                  <tr key={cmd.id}
                    className="border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer group"
                    onClick={() => setModal(cmd)}>
                    <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 shrink-0">{fmtDate(cmd.dateCommande)}</td>
                    {isGlobal && (
                      <td className="px-4 py-3 font-medium text-gray-700 dark:text-neutral-300">{magasinNom(cmd.magasinId)}</td>
                    )}
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {[cmd.clientNom, cmd.clientPrenom].filter(Boolean).join(' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">{cmd.clientTel || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 dark:text-white">{cmd.modele}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-neutral-500">
                      {[cmd.diametre, cmd.strie && `strie ${cmd.strie}`, cmd.poids].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 max-w-[120px] truncate">{cmd.marquage || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {cmd.totalTTC != null ? `${Number(cmd.totalTTC).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {cmd.acompte ? `${Number(cmd.acompte).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {cmd.resteARegler != null ? (
                        <span className={cmd.resteARegler > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-emerald-600 dark:text-emerald-400'}>
                          {Number(cmd.resteARegler).toFixed(2)} €
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-neutral-500 max-w-[80px] truncate">{cmd.etabliePar || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {statut === 'commande' && (
                          <button
                            onClick={e => handleMarquerRecu(e, cmd)}
                            className="opacity-0 group-hover:opacity-100 h-6 px-2 rounded-lg text-[10px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/30 transition-all whitespace-nowrap">
                            Reçu en magasin
                          </button>
                        )}
                        {statut === 'recu' && (
                          <button
                            onClick={e => handleArchive(e, cmd)}
                            className="opacity-0 group-hover:opacity-100 h-6 px-2 rounded-lg text-[10px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30 transition-all whitespace-nowrap">
                            Archiver ✓
                          </button>
                        )}
                        <svg className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 dark:text-neutral-700 dark:group-hover:text-neutral-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>

      {modal !== null && (
        <CommandeModal
          cmd={modal?.id ? modal : null}
          magasins={magasins}
          defaultMagasinId={magasinId}
          profile={profile}
          isGlobal={isGlobal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={canDelete ? handleDelete : null}
        />
      )}
    </div>
  )
}
