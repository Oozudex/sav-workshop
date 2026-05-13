import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  doc, onSnapshot, collection, query, orderBy,
  addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPE_LABELS } from '../lib/constants'
import { OpModal } from './Operations'
import * as XLSX from 'xlsx'

const SEGMENTS = ['velo', 'trottinette', 'roller', 'accessoires']
const SEGMENT_LABELS = { velo: 'Vélo', trottinette: 'Trottinette', roller: 'Roller', accessoires: 'Accessoires' }
const SEGMENT_COLORS = {
  velo:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  trottinette: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  roller:      'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  accessoires: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400',
}

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function fmtPrice(val) {
  if (val == null || val === '') return '—'
  return `${Number(val).toFixed(2)} €`
}

function remise(prixFort, prixOp) {
  if (!prixFort || !prixOp || prixFort <= 0) return null
  return Math.round((1 - prixOp / prixFort) * 100)
}

function getStatus(op) {
  const today = new Date().toLocaleDateString('fr-CA')
  if (op.dateFin < today)   return { label: 'Terminée', key: 'terminee', pill: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300' }
  if (op.dateDebut > today) return { label: 'À venir',  key: 'a_venir',  pill: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' }
  return { label: 'En cours', key: 'en_cours', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' }
}

function ProduitModal({ produit, onClose, onSave }) {
  const [form, setForm] = useState({
    nom:           produit?.nom           || '',
    marque:        produit?.marque        || '',
    reference:     produit?.reference     || '',
    refFournisseur:produit?.refFournisseur|| '',
    segment:       produit?.segment       || SEGMENTS[0],
    prixFort:      produit?.prixFort      ?? '',
    prixOp:        produit?.prixOp        ?? '',
  })
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const rem = remise(Number(form.prixFort), Number(form.prixOp))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    try { await onSave(form); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {produit?.id ? 'Modifier le produit' : 'Ajouter un produit'}
          </span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom du produit *</span>
              <input className="Input" value={form.nom} onChange={e => set('nom', e.target.value)} autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Marque</span>
              <input className="Input" value={form.marque} onChange={e => set('marque', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Réf. produit</span>
              <input className="Input" value={form.reference} onChange={e => set('reference', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Réf. fournisseur</span>
              <input className="Input" value={form.refFournisseur} onChange={e => set('refFournisseur', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Segment</span>
              <select className="Input" value={form.segment} onChange={e => set('segment', e.target.value)}>
                {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide block">Remise</span>
              <div className={['h-10 flex items-center px-3 rounded-xl text-sm font-bold',
                rem != null ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-gray-50 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500',
              ].join(' ')}>
                {rem != null ? `-${rem}%` : '—'}
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Prix fort (€)</span>
              <input type="number" step="0.01" min="0" className="Input" value={form.prixFort} onChange={e => set('prixFort', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Prix OP (€)</span>
              <input type="number" step="0.01" min="0" className="Input" value={form.prixOp} onChange={e => set('prixOp', e.target.value)} />
            </label>
          </div>
          <div className="flex items-center justify-between pt-1">
            {produit?.id ? (
              <button type="button" onClick={() => { onSave(null); onClose() }}
                className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">
                Supprimer
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
                Annuler
              </button>
              <button type="submit" disabled={saving || !form.nom.trim()}
                className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Parseurs Excel OP ─────────────────────────────────────────────────────────
const NEW_OP_COLS = {
  'famille': 'famille', 'family': 'famille',
  'référence': 'reference', 'reference': 'reference', 'ref produit': 'reference', 'réf produit': 'reference',
  'nom': 'nom', 'produit': 'nom', 'article': 'nom',
  'marque': 'marque', 'brand': 'marque',
  'prix fort': 'prixFort',
  'prix op': 'prixOp', 'prix promo': 'prixOp', 'prix opération': 'prixOp',
  'remise': '_remise',
  'segment': 'segment',
  'ref fournisseur': 'refFournisseur', 'réf fournisseur': 'refFournisseur', 'ref. fournisseur': 'refFournisseur',
}
const SEGMENT_ALIASES = {
  'velo': 'velo', 'vélo': 'velo', 'bike': 'velo',
  'trottinette': 'trottinette', 'scooter': 'trottinette',
  'roller': 'roller',
  'accessoires': 'accessoires', 'accessoire': 'accessoires', 'acces': 'accessoires',
}
function parseOpRows(rows) {
  if (!rows.length) return []
  const headers = rows[0].map(h => String(h || '').toLowerCase().trim())
  const fieldMap = headers.map(h => NEW_OP_COLS[h] || null)
  return rows.slice(1).map(row => {
    const obj = {}
    fieldMap.forEach((field, i) => {
      if (!field) return
      const raw = row[i] != null ? String(row[i]).trim() : ''
      if (!raw) return
      if (field === 'prixFort' || field === 'prixOp') {
        const n = parseFloat(raw.replace('€', '').replace(/\s/g, '').replace(',', '.'))
        if (!isNaN(n)) obj[field] = n
      } else if (field === 'segment') {
        obj[field] = SEGMENT_ALIASES[raw.toLowerCase()] || raw.toLowerCase()
      } else if (field === '_remise') {
        // skip — calculé automatiquement
      } else {
        obj[field] = raw
      }
    })
    return obj
  }).filter(r => r.nom || r.reference)
}

// ── Popup anomalie ─────────────────────────────────────────────────────────────
function AnomalyModal({ anomalies, onResolve }) {
  // Pour 0 match → excluded automatiquement. Pour N matches → multi-sélection checkboxes.
  const [selections, setSelections] = useState(() =>
    anomalies.map(a => ({
      excluded: a.matches.length === 0,
      selectedMatches: a.matches.length > 0 ? [a.matches[0]] : [],
    }))
  )

  function toggleMatch(ai, match) {
    setSelections(s => s.map((sel, i) => {
      if (i !== ai) return sel
      const already = sel.selectedMatches.some(m => (m.chrono || m.id) === (match.chrono || match.id))
      const next = already
        ? sel.selectedMatches.filter(m => (m.chrono || m.id) !== (match.chrono || match.id))
        : [...sel.selectedMatches, match]
      return { ...sel, selectedMatches: next.length ? next : sel.selectedMatches }
    }))
  }

  const actionable = anomalies.filter((_, i) => !selections[i].excluded)
  const excluded   = anomalies.filter((_, i) =>  selections[i].excluded)

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-amber-300 dark:border-amber-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 shrink-0">
          <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{anomalies.length} anomalie{anomalies.length > 1 ? 's' : ''} détectée{anomalies.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {excluded.length > 0 && `${excluded.length} produit${excluded.length > 1 ? 's' : ''} non en stock (exclu${excluded.length > 1 ? 's' : ''} du listing). `}
              {actionable.length > 0 && `Sélectionnez les correspondances pour les ${actionable.length} restant${actionable.length > 1 ? 's' : ''}.`}
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {anomalies.map((a, i) => (
            <div key={i} className={['rounded-xl border p-4 space-y-3',
              selections[i].excluded
                ? 'border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5'
                : 'border-gray-200 dark:border-neutral-700',
            ].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={['text-xs font-semibold', selections[i].excluded ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-white'].join(' ')}>
                    {a.nom || '(sans nom)'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-neutral-500 font-mono mt-0.5">{a.reference || '—'}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  a.matches.length === 0
                    ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                }`}>
                  {a.matches.length === 0 ? 'Non en stock — exclu' : `${a.matches.length} correspondances`}
                </span>
              </div>

              {a.matches.length === 0 && (
                <p className="text-[11px] text-red-500 dark:text-red-400">Ce produit n'existe pas dans le catalogue. Il ne sera pas ajouté au listing OP.</p>
              )}

              {a.matches.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-gray-400 dark:text-neutral-500 uppercase tracking-wide font-semibold">
                    Sélectionner les déclinaisons à intégrer ({selections[i].selectedMatches.length} sélectionnée{selections[i].selectedMatches.length > 1 ? 's' : ''})
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {a.matches.map(m => {
                      const key = m.chrono || m.id
                      const checked = selections[i].selectedMatches.some(x => (x.chrono || x.id) === key)
                      return (
                        <label key={key} className={['flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          checked
                            ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800'
                            : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800/50',
                        ].join(' ')}>
                          <span className={['h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            checked ? 'bg-gray-900 border-gray-900 dark:bg-white dark:border-white' : 'border-gray-300 dark:border-neutral-600',
                          ].join(' ')}>
                            {checked && <svg className="h-2.5 w-2.5 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </span>
                          <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleMatch(i, m)} />
                          <span className="text-[11px] font-mono text-gray-500 dark:text-neutral-400 shrink-0">{m.chrono || '?'}</span>
                          <span className="text-[11px] text-gray-700 dark:text-neutral-300 truncate">{m.nom}</span>
                          {m.couleur
                            ? <span className="text-[10px] font-semibold text-gray-500 dark:text-neutral-400 shrink-0 bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded">{m.couleur}</span>
                            : <span className="text-[10px] text-gray-300 dark:text-neutral-600 shrink-0 italic">N.B</span>}
                          {m.reference && <span className="text-[10px] text-gray-400 dark:text-neutral-500 ml-auto shrink-0">{m.reference}</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={() => onResolve(selections)}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            Valider et continuer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import OP (nouveau flux) ───────────────────────────────────────────────────
function ImportModal({ opId, onClose }) {
  const fileRef = useRef(null)
  const [rows,       setRows]       = useState(null)
  const [fileName,   setFileName]   = useState('')
  const [importing,  setImporting]  = useState(false)
  const [error,      setError]      = useState('')
  const [catalogue,      setCatalogue]      = useState([])
  const [prixExclu,      setPrixExclu]      = useState([])
  const [anomalies,      setAnomalies]      = useState([])
  const [showAnomaly,    setShowAnomaly]    = useState(false)
  const [excluChoices,   setExcluChoices]   = useState({}) // index → bool

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'catalogue_produits'), s => setCatalogue(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(collection(db, 'prix_exclu_team'),    s => setPrixExclu(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2() }
  }, [])

  function normRef(r) { return (r || '').toUpperCase().replace(/\s+/g, '') }

  function findInCatalogue(reference, nom) {
    const rn = normRef(reference)
    const exact = catalogue.filter(p => normRef(p.reference) === rn)
    if (exact.length === 1) return { chrono: exact[0].chrono, matches: exact }
    if (exact.length > 1)  return { chrono: null, matches: exact }
    // fallback par nom
    if (nom) {
      const nl = nom.toLowerCase()
      const byName = catalogue.filter(p => (p.nom || '').toLowerCase() === nl)
      if (byName.length === 1) return { chrono: byName[0].chrono, matches: byName }
      if (byName.length > 1)  return { chrono: null, matches: byName }
    }
    return { chrono: null, matches: [] }
  }

  function checkExclu(chrono, prixOp) {
    if (!chrono || prixOp == null) return null
    const cn = (chrono || '').trim().toLowerCase()
    const match = prixExclu.find(p => (p.chrono || '').trim().toLowerCase() === cn)
    if (!match || match.prixExcluTeam == null) return null
    if (match.prixExcluTeam >= prixOp) {
      return { type: 'override', prixFortExclu: match.prixExcluTeam }
    }
    return { type: 'cheaper', prixExcluTeam: match.prixExcluTeam }
  }

  function buildRows(parsed, resolvedAnomalies) {
    const anomIdx = {}
    let ai = 0
    parsed.forEach((r, i) => {
      const res = findInCatalogue(r.reference, r.nom)
      if (!res.chrono) anomIdx[i] = ai++
    })

    const result = []
    parsed.forEach((r, i) => {
      if (anomIdx[i] != null) {
        const resolved = resolvedAnomalies?.[anomIdx[i]]
        if (!resolved) {
          // Pas encore résolu — afficher comme anomalie dans le preview
          const noStock = findInCatalogue(r.reference, r.nom).matches.length === 0
          result.push({ ...r, chrono: null, _exclu: null, _hasAnomaly: true, _noStock: noStock })
          return
        }
        if (resolved.excluded || !resolved.selectedMatches?.length) return // exclu
        for (const match of resolved.selectedMatches) {
          const exclu = checkExclu(match.chrono, r.prixOp)
          result.push({
            ...r,
            chrono:    match.chrono,
            reference: match.reference || r.reference || null,
            couleur:   match.couleur   || r.couleur   || null,
            nom:       r.nom           || match.nom,
            _exclu: exclu, _hasAnomaly: false, _noStock: false,
          })
        }
      } else {
        const res = findInCatalogue(r.reference, r.nom)
        const catMatch = res.matches[0]
        const exclu = checkExclu(res.chrono, r.prixOp)
        result.push({
          ...r,
          chrono:    res.chrono,
          reference: r.reference || catMatch?.reference || null,
          couleur:   r.couleur   || catMatch?.couleur   || null,
          _exclu: exclu, _hasAnomaly: false, _noStock: false,
        })
      }
    })
    return result
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setAnomalies([]); setRows(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const parsed = parseOpRows(raw)
        if (!parsed.length) { setError('Aucune ligne valide trouvée. Vérifiez les en-têtes.'); return }

        const anom = []
        parsed.forEach(r => {
          const res = findInCatalogue(r.reference, r.nom)
          if (!res.chrono) anom.push({ ...r, matches: res.matches })
        })
        setAnomalies(anom)
        const built = buildRows(parsed, null)
        setRows({ parsed, built })
        if (anom.length > 0) setShowAnomaly(true)
      } catch { setError('Impossible de lire le fichier.') }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleAnomalyResolve(selections) {
    setShowAnomaly(false)
    const built = buildRows(rows.parsed, selections)
    setRows(r => ({ ...r, built }))
  }

  async function handleImport() {
    if (!rows?.built?.length) return
    setImporting(true)
    try {
      const batch = writeBatch(db)
      rows.built.forEach((r, i) => {
        const { _exclu, _hasAnomaly, _noStock, ...data } = r
        if (_exclu?.type === 'override') data.prixFort = _exclu.prixFortExclu
        if (_exclu?.type === 'cheaper')  data.excluTeamCheaper = true
        data.passExcluTeam = !!excluChoices[i]
        const ref = doc(collection(db, 'op_commerciales', opId, 'produits'))
        batch.set(ref, { ...data, createdAt: serverTimestamp() })
      })
      await batch.commit()
      onClose()
    } finally { setImporting(false) }
  }

  const built       = rows?.built || []
  const anomCount   = built.filter(r => r._hasAnomaly && !r._noStock).length
  const noStockCount= anomalies.filter(a => a.matches.length === 0).length
  const excluOver   = built.filter(r => r._exclu?.type === 'override').length
  const excluCheap  = built.filter(r => r._exclu?.type === 'cheaper').length

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Importer depuis Excel</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!rows ? (
            <div>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
                Importez un fichier Excel (.xlsx, .xls) ou CSV. En-têtes supportées :<br />
                <span className="font-mono text-[11px] text-gray-400">Famille, Référence, Nom, Marque, Prix fort, Prix op/promo, Segment</span>
              </p>
              <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-200 dark:border-neutral-700 rounded-xl p-8 cursor-pointer hover:border-gray-400 dark:hover:border-neutral-500 transition-colors">
                <svg className="h-8 w-8 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                <span className="text-xs text-gray-400 dark:text-neutral-500">Cliquez pour choisir un fichier</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>
              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <strong className="text-gray-700 dark:text-neutral-300">{built.length} produits</strong> dans <span className="font-mono">{fileName}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(anomCount > 0 || noStockCount > 0) && (
                    <button onClick={() => setShowAnomaly(true)}
                      className="h-6 px-2.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 hover:bg-amber-200">
                      {noStockCount > 0 && `${noStockCount} non en stock`}
                      {noStockCount > 0 && anomCount > 0 && ' · '}
                      {anomCount > 0 && `${anomCount} à résoudre`}
                    </button>
                  )}
                  {excluOver > 0 && (
                    <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                      {excluOver} prix fort exclu team
                    </span>
                  )}
                  {excluCheap > 0 && (
                    <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {excluCheap} déjà moins cher en exclu
                    </span>
                  )}
                  <button onClick={() => { setRows(null); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 underline">Changer</button>
                </div>
              </div>

              {/* Légende */}
              <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />Prix fort remplacé par exclu team</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-neutral-600 shrink-0" />Moins cher en exclu team (grisé)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />Chrono manquant</span>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
                      {['Chrono', 'Réf.', 'Nom', 'Couleur', 'Prix fort', 'Prix OP', 'Remise'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Exclu team fin OP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {built.slice(0, 100).map((r, i) => {
                      const isCheap    = r._exclu?.type === 'cheaper'
                      const isOverride = r._exclu?.type === 'override'
                      const prixFortDisplay = isOverride ? r._exclu.prixFortExclu : r.prixFort
                      const rem = prixFortDisplay && r.prixOp ? Math.round((1 - r.prixOp / prixFortDisplay) * 100) : null
                      const isExclu = !!excluChoices[i]
                      return (
                        <tr key={i} className={['border-b last:border-0 border-gray-100 dark:border-neutral-800',
                          isCheap ? 'opacity-40' : '',
                          isExclu ? 'bg-blue-50/50 dark:bg-blue-500/5' : '',
                        ].join(' ')}>
                          <td className="px-3 py-2 font-mono text-gray-500 dark:text-neutral-400">
                            {r._hasAnomaly ? <span className="text-amber-500">⚠ manquant</span> : (r.chrono || '—')}
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-500 dark:text-neutral-400">{r.reference || '—'}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                            {r.nom}
                            {isCheap && <span className="ml-1.5 text-[10px] text-gray-400">· exclu moins cher</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">
                            {r.couleur
                              ? <span className="text-[10px] font-semibold bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded">{r.couleur}</span>
                              : <span className="text-[10px] text-gray-300 dark:text-neutral-600 italic">N.B</span>}
                          </td>
                          <td className={['px-3 py-2', isOverride ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-neutral-400'].join(' ')}>
                            {prixFortDisplay != null ? `${prixFortDisplay} €` : '—'}
                            {isOverride && <span className="ml-1 text-[10px] font-normal text-blue-400">(exclu)</span>}
                          </td>
                          <td className={['px-3 py-2 font-semibold', isExclu ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'].join(' ')}>
                            {r.prixOp != null ? `${r.prixOp} €` : '—'}
                          </td>
                          <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{rem != null ? `-${rem}%` : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <label className="inline-flex items-center justify-center cursor-pointer">
                              <input type="checkbox" className="sr-only" checked={isExclu}
                                onChange={() => setExcluChoices(c => ({ ...c, [i]: !c[i] }))} />
                              <span className={['h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                                isExclu ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-neutral-600 hover:border-blue-400',
                              ].join(' ')}>
                                {isExclu && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </span>
                            </label>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {built.length > 100 && (
                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 dark:bg-neutral-800/30 border-t border-gray-100 dark:border-neutral-800">
                    … et {built.length - 100} autres produits
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
          <button onClick={handleImport} disabled={!built.length || importing}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {importing ? 'Import en cours…' : `Importer ${built.length} produits`}
          </button>
        </div>
      </div>
      {showAnomaly && anomalies.length > 0 && (
        <AnomalyModal anomalies={anomalies} onResolve={handleAnomalyResolve} />
      )}
    </div>
  )
}

export default function OperationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth(s => ({ profile: s.profile }))
  const canCreate = GLOBAL_ROLES.includes(profile?.role)

  const [op,         setOp]       = useState(null)
  const [produits,   setProduits] = useState([])
  const [modal,      setModal]    = useState(null) // null | {} | {id,...}
  const [filterSeg,  setFilterSeg] = useState('')
  const [searchProd, setSearchProd] = useState('')
  const [sortBy,     setSortBy]   = useState(null)
  const [sortDir,    setSortDir]  = useState('asc')
  const [showImport, setShowImport] = useState(false)

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  useEffect(() => {
    return onSnapshot(doc(db, 'op_commerciales', id), snap => {
      setOp(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [id])

  useEffect(() => {
    const q = query(collection(db, 'op_commerciales', id, 'produits'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setProduits(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [id])

  async function handleSaveProduit(form) {
    if (!form) return // suppression
    const data = {
      nom:            form.nom.trim(),
      marque:         form.marque.trim()         || null,
      reference:      form.reference.trim()      || null,
      refFournisseur: form.refFournisseur.trim()  || null,
      segment:        form.segment,
      prixFort:       form.prixFort !== '' ? Number(form.prixFort) : null,
      prixOp:         form.prixOp   !== '' ? Number(form.prixOp)   : null,
    }
    if (modal?.id) {
      await updateDoc(doc(db, 'op_commerciales', id, 'produits', modal.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'op_commerciales', id, 'produits'), { ...data, createdAt: serverTimestamp() })
    }
  }

  async function handleDeleteProduit(p) {
    await deleteDoc(doc(db, 'op_commerciales', id, 'produits', p.id))
  }

  async function toggleGroupExcluTeam(group) {
    const allChecked = group.every(p => !!p.passExcluTeam)
    const newValue = !allChecked
    const batch = writeBatch(db)
    group.forEach(p => batch.update(doc(db, 'op_commerciales', id, 'produits', p.id), { passExcluTeam: newValue }))
    await batch.commit()
  }

  async function handleTransferExcluTeam() {
    const toTransfer = produits.filter(p => p.passExcluTeam && !p.excluTeamTransferred)
    if (!toTransfer.length) return
    const batch = writeBatch(db)
    for (const p of toTransfer) {
      const excluRef = doc(collection(db, 'prix_exclu_team'))
      batch.set(excluRef, {
        chrono:        p.chrono || null,
        nom:           p.nom,
        marque:        p.marque || null,
        segment:       p.segment || null,
        prixFort:      p.prixFort || null,
        prixExcluTeam: p.prixOp,
        sourceOpId:    id,
        importedAt:    serverTimestamp(),
      })
      batch.update(doc(db, 'op_commerciales', id, 'produits', p.id), { excluTeamTransferred: true })
    }
    await batch.commit()
  }

  async function handleDeleteOp() {
    if (!confirm(`Supprimer l'opération "${op?.nom}" ? Cette action est irréversible.`)) return
    await deleteDoc(doc(db, 'op_commerciales', id))
    navigate('/operations')
  }

  async function handleSaveOp(form) {
    const data = {
      nom:        form.nom.trim(),
      dateDebut:  form.dateDebut,
      dateFin:    form.dateFin,
      description:form.description.trim() || null,
      lien:       form.lien?.trim()        || null,
      globale:    form.globale             ?? false,
      rayonTypes: form.rayonTypes?.length  ? form.rayonTypes : null,
      rayonType:  null,
      magasinIds: form.magasinIds?.length  ? form.magasinIds : null,
    }
    await updateDoc(doc(db, 'op_commerciales', id), { ...data, updatedAt: serverTimestamp() })
  }

  if (!op) return <div className="min-h-screen flex flex-col"><Navbar /><div className="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div></div>

  const status = getStatus(op)
  const filtered = (() => {
    const term = searchProd.trim().toLowerCase()
    let list = produits
    if (filterSeg) list = list.filter(p => p.segment === filterSeg)
    if (term) list = list.filter(p =>
      (p.nom       || '').toLowerCase().includes(term) ||
      (p.reference || '').toLowerCase().includes(term) ||
      (p.chrono    || '').toLowerCase().includes(term) ||
      (p.couleur   || '').toLowerCase().includes(term)
    )
    if (sortBy) {
      const seg_order = SEGMENTS
      list = [...list].sort((a, b) => {
        let va, vb
        if (sortBy === 'marque') {
          va = (a.marque || '').toLowerCase()
          vb = (b.marque || '').toLowerCase()
        } else {
          va = seg_order.indexOf(a.segment)
          vb = seg_order.indexOf(b.segment)
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  })()

  // Grouper par nom pour l'affichage
  const grouped = (() => {
    const map = new Map()
    for (const p of filtered) {
      const key = p.nom || p.id
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return Array.from(map.values())
  })()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.pill}`}>{status.label}</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{op.nom}</h1>
                <p className="text-sm text-gray-400 dark:text-neutral-500">
                  {fmtDate(op.dateDebut)} → {fmtDate(op.dateFin)}
                </p>
                {op.description && <p className="text-sm text-gray-600 dark:text-neutral-400 mt-2">{op.description}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {op.rayonType && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
                      Rayon : {RAYON_TYPE_LABELS[op.rayonType] || op.rayonType}
                    </span>
                  )}
                  {op.magasinIds?.length > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {op.magasinIds.length} magasin{op.magasinIds.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              {canCreate && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => navigate('/operations')}
                    className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
                    ← Retour
                  </button>
                  <button onClick={() => setModal({ editOp: true })}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">
                    Modifier l'OP
                  </button>
                  <button onClick={handleDeleteOp}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                    Supprimer l'OP
                  </button>
                  <button onClick={() => setShowImport(true)}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Importer Excel
                  </button>
                  <button onClick={() => setModal({})}
                    className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                    + Produit
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bannière transfert exclu team (OP terminée) */}
          {status.key === 'terminee' && (() => {
            const toTransfer = produits.filter(p => p.passExcluTeam && !p.excluTeamTransferred)
            if (!toTransfer.length) return null
            return (
              <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>{toTransfer.length} produit{toTransfer.length > 1 ? 's' : ''}</strong> marqué{toTransfer.length > 1 ? 's' : ''} pour transfert en prix exclu team.
                  </p>
                </div>
                {canCreate && (
                  <button onClick={handleTransferExcluTeam}
                    className="shrink-0 h-7 px-3 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition-colors">
                    Transférer vers exclu team
                  </button>
                )}
              </div>
            )
          })()}

          {/* Recherche produits */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
            <input value={searchProd} onChange={e => setSearchProd(e.target.value)}
              placeholder="Rechercher par nom, référence, chrono, couleur…"
              className="w-full h-9 pl-9 pr-8 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10" />
            {searchProd && (
              <button onClick={() => setSearchProd('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded text-gray-400 hover:text-gray-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Filtres segment */}
          <div className="flex items-center gap-2">
            <button onClick={() => setFilterSeg('')}
              className={['h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors',
                !filterSeg ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
              ].join(' ')}>
              Tous ({produits.length})
            </button>
            {SEGMENTS.map(s => {
              const count = produits.filter(p => p.segment === s).length
              if (!count) return null
              return (
                <button key={s} onClick={() => setFilterSeg(s === filterSeg ? '' : s)}
                  className={['h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors',
                    filterSeg === s ? SEGMENT_COLORS[s] : 'text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
                  ].join(' ')}>
                  {SEGMENT_LABELS[s]} ({count})
                </button>
              )
            })}
          </div>

          {/* Table produits — groupée par nom */}
          {grouped.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 dark:text-neutral-500">
              Aucun produit.{canCreate && ' Cliquez sur "+ Produit" pour en ajouter.'}
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    {['Produit', 'Déclinaisons', 'Marque', 'Segment', 'Prix fort', 'Prix OP', 'Remise'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                    {canCreate && <th className="px-4 py-3 text-center text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Exclu team fin OP</th>}
                    {canCreate && <th className="px-4 py-3 w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group) => {
                    const first       = group[0]
                    const rem         = remise(first.prixFort, first.prixOp)
                    const isCheap     = first.excluTeamCheaper === true
                    const allExclu    = group.every(p => !!p.passExcluTeam)
                    const someExclu   = group.some(p => !!p.passExcluTeam)
                    const allDone     = group.every(p => !!p.excluTeamTransferred)
                    return (
                      <tr key={group.map(p => p.id).join('-')}
                        style={{position: 'relative'}}
                        className={['border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors',
                          allExclu ? 'bg-blue-50/40 dark:bg-blue-500/5' : '',
                        ].join(' ')}>

                        {/* Nom */}
                        <td className="px-4 py-3 align-top">
                          <span className="font-semibold text-gray-900 dark:text-white">{first.nom}</span>
                        </td>

                        {/* Déclinaisons : couleur + ref + chrono */}
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1.5">
                            {group.map(p => (
                              <div key={p.id} className="flex items-center gap-1.5 flex-wrap">
                                {p.couleur
                                  ? <span className="text-[10px] font-semibold bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded shrink-0">{p.couleur}</span>
                                  : <span className="text-[10px] text-gray-300 dark:text-neutral-600 italic shrink-0">N.B</span>}
                                <span className="text-[11px] font-mono text-gray-700 dark:text-neutral-300">{p.reference || '—'}</span>
                                <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500">{p.chrono || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Marque */}
                        <td className="px-4 py-3 text-gray-600 dark:text-neutral-400 align-top">{first.marque || '—'}</td>

                        {/* Segment */}
                        <td className="px-4 py-3 align-top">
                          {first.segment && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEGMENT_COLORS[first.segment]}`}>
                              {SEGMENT_LABELS[first.segment] || first.segment}
                            </span>
                          )}
                        </td>

                        {/* Prix fort */}
                        <td className={['px-4 py-3 align-top', isCheap ? 'text-gray-400 dark:text-neutral-600' : 'text-gray-600 dark:text-neutral-400'].join(' ')}>
                          {fmtPrice(first.prixFort)}
                        </td>

                        {/* Prix OP */}
                        <td className="px-4 py-3 align-top">
                          {allExclu ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-500/30 shadow-sm shadow-blue-100 dark:shadow-none">
                                {fmtPrice(first.prixOp)}
                              </span>
                              <span className="relative group">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold cursor-default select-none">i</span>
                                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-gray-900 dark:bg-neutral-700 text-white text-[10px] leading-tight px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg text-center">
                                  Ce prix passera en prix exclu team à la fin de l'OP
                                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-neutral-700" />
                                </span>
                              </span>
                              {allDone && <span className="text-[10px] font-normal text-green-500">✓</span>}
                            </div>
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-white">{fmtPrice(first.prixOp)}</span>
                          )}
                          {allDone && !allExclu && <span className="block text-[10px] font-normal text-green-500 mt-0.5">✓ transféré</span>}
                        </td>

                        {/* Remise */}
                        <td className="px-4 py-3 align-top">
                          {rem != null && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{rem}%</span>}
                        </td>

                        {/* Exclu team — acheteur/directeur uniquement */}
                        {canCreate && (
                          <td className="px-4 py-3 text-center align-top">
                            <label className="inline-flex items-center justify-center cursor-pointer">
                              <input type="checkbox" className="sr-only"
                                checked={allExclu}
                                onChange={() => toggleGroupExcluTeam(group)}
                                disabled={allDone} />
                              <span className={['h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                                allDone ? 'bg-green-500 border-green-500' :
                                allExclu ? 'bg-blue-500 border-blue-500' :
                                someExclu ? 'bg-blue-200 border-blue-300 dark:bg-blue-500/30 dark:border-blue-500/50' :
                                'border-gray-300 dark:border-neutral-600 hover:border-blue-400',
                              ].join(' ')}>
                                {(allExclu || allDone) && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                {someExclu && !allExclu && !allDone && <span className="block h-0.5 w-2 bg-blue-600 dark:bg-blue-400 rounded" />}
                              </span>
                            </label>
                          </td>
                        )}

                        {/* Édition — acheteur/directeur uniquement, et seulement si 1 seule variante */}
                        {canCreate && (
                          <td className="px-4 py-3 align-top">
                            {group.length === 1 && (
                              <button onClick={() => setModal(first)}
                                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                            )}
                          </td>
                        )}

                        {/* Overlay "exclu team moins cher" — grise la ligne + message centré */}
                        {isCheap && (
                          <td style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 0, border: 'none', zIndex: 5}}>
                            <div className="absolute inset-0 bg-white/75 dark:bg-neutral-900/80" />
                            <div className="relative h-full flex items-center justify-center z-10 pointer-events-none">
                              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-500/40 shadow-md shadow-orange-100/60 dark:shadow-none">
                                <svg className="h-3.5 w-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                  Exclu team moins cher — déjà disponible à meilleur prix
                                </span>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {modal !== null && !modal.editOp && (
        <ProduitModal
          produit={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={async (form) => {
            if (!form) { await handleDeleteProduit(modal); setModal(null) }
            else await handleSaveProduit(form)
          }}
        />
      )}
      {modal?.editOp && op && (
        <OpModal op={op} onClose={() => setModal(null)} onSave={handleSaveOp} />
      )}
      {showImport && (
        <ImportModal opId={id} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
