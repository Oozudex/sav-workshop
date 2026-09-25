import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import {
  doc, onSnapshot, collection, query, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPE_LABELS } from '../lib/constants'
import { OpModal } from './Operations'
import IlvDialog from '../components/IlvDialog'
import { deleteOperation, opFormData } from '../lib/opActions'
import { opRayons } from '../lib/opSearch'
import { readSheetWithFills } from '../lib/excel'
import { BON_PLAN_COLLECTION, bonPlanTransfer } from '../lib/bonPlan'
import {
  SEGMENT_LABELS, bonPlanPrices, cleanRef, isBonPlanBetter, normName, parseOpSheet, planImport, prixReference, remisePct, resolveLines,
} from '../lib/opImport'

const SEGMENTS = ['velo', 'trottinette', 'roller', 'accessoires', 'textile']
const SEGMENT_COLORS = {
  velo:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  trottinette: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  roller:      'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  accessoires: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400',
  textile:     'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
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
    chrono:        produit?.chrono        || '',
    couleur:       produit?.couleur       || '',
    segment:       produit?.segment       || SEGMENTS[0],
    prixFort:      produit?.prixFort      ?? '',
    prixOp:        produit?.prixOp        ?? '',
  })
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const rem = remisePct({
    prixFort: form.prixFort !== '' ? Number(form.prixFort) : null,
    prixOp:   form.prixOp   !== '' ? Number(form.prixOp)   : null,
    prixBonPlan: produit?.prixBonPlan ?? null,
  })

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
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Chrono</span>
              <input className="Input" value={form.chrono} onChange={e => set('chrono', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur</span>
              <input className="Input" value={form.couleur} onChange={e => set('couleur', e.target.value)} />
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
              <button type="button" onClick={() => {
                if (!confirm(`Retirer « ${produit.nom}${produit.couleur ? ` ${produit.couleur}` : ''} » de l'OP ?`)) return
                onSave(null); onClose()
              }}
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

// ── Import Excel ───────────────────────────────────────────────────────────────

const LINE_STATUS = {
  found:   { label: 'En stock',          pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  check:   { label: 'À vérifier',        pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  outside: { label: 'Hors base vélos',   pill: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300' },
  missing: { label: 'Pas en stock',      pill: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' },
}
const MATCH_LABELS = { chrono: 'par chrono', ref: 'par référence', modele: 'par réf. fournisseur' }

function Check({ checked, onChange, disabled, color = 'blue', label }) {
  const on = color === 'blue' ? 'bg-blue-500 border-blue-500' : 'bg-gray-900 border-gray-900 dark:bg-white dark:border-white'
  return (
    <label className={`inline-flex items-center justify-center ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
      <span className={['h-4 w-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
        checked ? on : 'border-gray-300 dark:border-neutral-600 hover:border-blue-400'].join(' ')}>
        {checked && <svg className={`h-2.5 w-2.5 ${color === 'blue' ? 'text-white' : 'text-white dark:text-black'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </span>
    </label>
  )
}

// Prix de la ligne : prix barré (prix fort, ou prix bon plan s'il sert de référence), prix OP, remise
function LinePrices({ p }) {
  const ref = prixReference(p)
  const better = isBonPlanBetter(p)
  const rem = remisePct(p)
  return (
    <div className={['space-y-0.5 whitespace-nowrap', better ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-baseline gap-1.5">
        {ref != null && <span className="text-gray-400 dark:text-neutral-500 line-through">{fmtPrice(ref)}</span>}
        <span className="font-semibold text-gray-900 dark:text-white">{fmtPrice(p.prixOp)}</span>
        {rem != null && !better && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{rem}%</span>}
      </div>
      {p.prixBonPlan != null && (
        <p className={`text-[10px] ${better ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
          {better
            ? `Bon plan déjà à ${fmtPrice(p.prixBonPlan)} : plus avantageux que l'OP`
            : `Bon plan ${fmtPrice(p.prixBonPlan)} · prix fort ${fmtPrice(p.prixFort)}`}
        </p>
      )}
    </div>
  )
}

function ImportModal({ opId, produits, onClose }) {
  const fileRef = useRef(null)
  const [base,      setBase]      = useState(null) // { catalogue, bonPlans } : base des vélos en stock
  const [baseError, setBaseError] = useState('')
  const [fileName,  setFileName]  = useState('')
  const [lines,     setLines]     = useState(null) // lignes du fichier rapprochées avec la base
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState({})   // index de ligne → ids des déclinaisons cochées (« à vérifier »)
  const [bonPlan,   setBonPlan]   = useState({})   // index de ligne → passe en bon plan à la fin de l'OP
  const [importing, setImporting] = useState(false)

  // La base est chargée avant de pouvoir choisir le fichier : sinon tout serait « pas en stock »
  useEffect(() => {
    Promise.all([getDocs(collection(db, 'catalogue_produits')), getDocs(collection(db, BON_PLAN_COLLECTION))])
      .then(([cat, bp]) => setBase({
        catalogue: cat.docs.map(d => ({ id: d.id, ...d.data() })),
        bonPlans:  bonPlanPrices(bp.docs.map(d => d.data())),
      }))
      .catch(() => setBaseError('Impossible de charger la base des vélos. Vérifie la connexion puis rouvre la fenêtre.'))
  }, [])

  function reset() {
    setLines(null); setFileName(''); setError(''); setSelected({}); setBonPlan({})
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file || !base) return
    reset()
    setFileName(file.name)
    try {
      const { rows, fills } = await readSheetWithFills(file)
      const parsed = parseOpSheet(rows, fills)
      if (parsed.error) { setError(parsed.error); return }
      const resolved = resolveLines(parsed.rows, base.catalogue)
      // Case bon plan : ligne en bleu dans l'Excel, ou produit déjà coché dans l'OP
      const already = planImport(resolved, { existing: produits })
      setBonPlan(Object.fromEntries(resolved.map((l, i) => [i,
        l.highlighted || already.some(a => a.line === l.line && a.existing?.passeBonPlan)])))
      setLines(resolved)
    } catch {
      setError('Impossible de lire le fichier.')
    }
  }

  const plan = useMemo(() => lines
    ? planImport(lines, { selected, bonPlan, bonPlans: base.bonPlans, existing: produits })
    : [], [lines, selected, bonPlan, base, produits])

  const byLine = useMemo(() => {
    const map = new Map()
    for (const a of plan) map.set(a.line, [...(map.get(a.line) || []), a])
    return map
  }, [plan])

  const writes   = plan.filter(a => a.action !== 'same')
  const count    = action => plan.filter(a => a.action === action).length
  const countSt  = status => (lines || []).filter(l => l.status === status).length
  const toCheck  = (lines || []).filter((l, i) => l.status === 'check' && !selected[i]?.length).length
  const nbBonPlan = plan.filter(a => a.data.passeBonPlan).length

  function toggleVariant(i, id) {
    setSelected(s => {
      const cur = s[i] || []
      return { ...s, [i]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }
    })
  }

  async function handleImport() {
    if (!writes.length) { onClose(); return }
    setImporting(true)
    setError('')
    try {
      // Un batch Firestore est limité à 500 écritures
      for (let start = 0; start < writes.length; start += 450) {
        const batch = writeBatch(db)
        for (const a of writes.slice(start, start + 450)) {
          if (a.action === 'update') {
            batch.update(doc(db, 'op_commerciales', opId, 'produits', a.existing.id), { ...a.data, updatedAt: serverTimestamp() })
          } else {
            batch.set(doc(collection(db, 'op_commerciales', opId, 'produits')), { ...a.data, createdAt: serverTimestamp() })
          }
        }
        await batch.commit()
      }
      onClose()
    } catch {
      setError("L'import a échoué en cours de route. Relance-le : les produits déjà importés seront simplement mis à jour.")
    } finally {
      setImporting(false)
    }
  }

  const reimport = produits.length > 0

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {reimport ? 'Réimporter le fichier de l\'OP' : 'Importer le fichier de l\'OP'}
          </span>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!lines ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-neutral-400 space-y-1.5">
                <p>
                  Colonnes lues : <span className="font-mono text-[11px] text-gray-600 dark:text-neutral-300">Nom, Marque, Réf fournisseur, Segment, Prix fort, Prix op</span>
                  <span className="text-gray-400"> (et si présentes : Référence, Chrono, Couleur, Famille).</span>
                </p>
                <p>Les vélos sont retrouvés dans la base par leur réf. fournisseur ou leur chrono. Les autres articles (textile, accessoires) sont importés sans vérifier le stock.</p>
                <p>Les lignes <span className="px-1 rounded bg-cyan-200 text-cyan-900 dark:bg-cyan-500/30 dark:text-cyan-200">surlignées en bleu</span> passeront en prix bon plan à la fin de l'OP.</p>
                {reimport && (
                  <p className="text-gray-700 dark:text-neutral-300">
                    Cette OP contient déjà {produits.length} produit{produits.length > 1 ? 's' : ''} : leurs prix seront mis à jour et les nouveaux produits ajoutés, sans doublon.
                  </p>
                )}
              </div>
              <label className={['flex flex-col items-center gap-3 border-2 border-dashed rounded-xl p-8 transition-colors',
                base ? 'border-gray-200 dark:border-neutral-700 cursor-pointer hover:border-gray-400 dark:hover:border-neutral-500' : 'border-gray-100 dark:border-neutral-800 cursor-wait',
              ].join(' ')}>
                <svg className="h-8 w-8 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                <span className="text-xs text-gray-400 dark:text-neutral-500">
                  {baseError ? 'Base des vélos indisponible' : base ? 'Cliquez pour choisir un fichier (.xlsx, .xls, .csv)' : 'Chargement de la base des vélos…'}
                </span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={!base} />
              </label>
              {(error || baseError) && <p className="text-xs text-red-500">{error || baseError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <strong className="text-gray-700 dark:text-neutral-300">{lines.length} lignes</strong> dans <span className="font-mono">{fileName}</span>
                </div>
                <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 underline">Changer de fichier</button>
              </div>

              {/* Résumé */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-black">
                  {plan.length} produit{plan.length > 1 ? 's' : ''} dans l'OP
                </span>
                {reimport && <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {count('create')} nouveau{count('create') > 1 ? 'x' : ''} · {count('update')} mis à jour · {count('same')} inchangé{count('same') > 1 ? 's' : ''}
                </span>}
                {countSt('outside') > 0 && <span className={`h-6 px-2.5 inline-flex items-center rounded-full ${LINE_STATUS.outside.pill}`}>{countSt('outside')} hors base vélos</span>}
                {toCheck > 0 && <span className={`h-6 px-2.5 inline-flex items-center rounded-full ${LINE_STATUS.check.pill}`}>{toCheck} à vérifier</span>}
                {countSt('missing') > 0 && <span className={`h-6 px-2.5 inline-flex items-center rounded-full ${LINE_STATUS.missing.pill}`}>{countSt('missing')} pas en stock</span>}
                {nbBonPlan > 0 && <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">{nbBonPlan} passeront en bon plan</span>}
              </div>
              {toCheck > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  « À vérifier » : ces produits n'ont été trouvés que par leur nom, qui peut correspondre à d'anciens modèles. Coche les bonnes déclinaisons, sinon ils ne seront pas importés.
                </p>
              )}

              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
                      {['Ligne', 'Produit', 'Stock et déclinaisons', 'Prix', ...(reimport ? ['Réimport'] : [])].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-blue-500 uppercase tracking-wide whitespace-nowrap">Bon plan fin d'OP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const st = LINE_STATUS[l.status]
                      const entries = byLine.get(l.line) || []
                      const prices = entries[0]?.data || { prixFort: l.prixFort, prixOp: l.prixOp, prixBonPlan: null }
                      const actions = new Set(entries.map(a => a.action))
                      const changed = entries.find(a => a.action === 'update' && a.existing.prixOp !== a.data.prixOp)
                      return (
                        <tr key={l.line} className={['border-b last:border-0 border-gray-100 dark:border-neutral-800 align-top',
                          l.status === 'missing' ? 'bg-red-50/40 dark:bg-red-500/5' : '',
                          bonPlan[i] && l.status !== 'missing' ? 'bg-blue-50/50 dark:bg-blue-500/5' : '',
                        ].join(' ')}>
                          <td className="px-3 py-2 font-mono text-gray-400">{l.line}</td>
                          <td className="px-3 py-2 min-w-[180px]">
                            <p className={['font-medium', l.status === 'missing' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'].join(' ')}>{l.nom || '(sans nom)'}</p>
                            <p className="text-[10px] text-gray-400 dark:text-neutral-500">
                              {[l.marque, SEGMENT_LABELS[l.segment] || l.segment].filter(Boolean).join(' · ')}
                              {l.refFournisseur && <span className="font-mono"> · {l.refFournisseur}</span>}
                            </p>
                          </td>
                          <td className="px-3 py-2 min-w-[240px]">
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.pill}`}>
                              {st.label}{l.status === 'found' && ` ${MATCH_LABELS[l.how]}`}
                            </span>
                            {l.status === 'outside' && <p className="mt-1 text-[10px] text-gray-400">Importé sans vérifier le stock</p>}
                            {l.status === 'missing' && <p className="mt-1 text-[10px] text-red-500 dark:text-red-400">Introuvable dans la base : non importé</p>}
                            {l.status === 'check' && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">Trouvé seulement par le nom : coche les bonnes déclinaisons</p>}
                            {(l.status === 'found' || l.status === 'check') && (
                              <div className="mt-1.5 space-y-1">
                                {l.matches.map(m => (
                                  <div key={m.id} className="flex items-center gap-1.5 flex-wrap">
                                    {l.status === 'check' && (
                                      <Check color="dark" checked={!!selected[i]?.includes(m.id)} onChange={() => toggleVariant(i, m.id)}
                                        label={`Importer ${m.nom} ${m.reference || ''}`} />
                                    )}
                                    {m.couleur
                                      ? <span className="text-[10px] font-semibold bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded">{m.couleur}</span>
                                      : <span className="text-[10px] text-gray-300 dark:text-neutral-600 italic">N.B</span>}
                                    <span className="font-mono text-[10px] text-gray-500 dark:text-neutral-400">{m.reference || '—'}</span>
                                    <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-500">{m.chrono || '—'}</span>
                                    {l.status === 'check' && m.nom !== l.nom && <span className="text-[10px] text-gray-500 dark:text-neutral-400">{m.nom}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2"><LinePrices p={prices} /></td>
                          {reimport && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              {!entries.length ? <span className="text-gray-300 dark:text-neutral-600">—</span> : (
                                <>
                                  <p className={actions.has('create') ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                    : actions.has('update') ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-400'}>
                                    {actions.has('create') ? 'Nouveau' : actions.has('update') ? 'Mis à jour' : 'Inchangé'}
                                  </p>
                                  {changed && <p className="text-[10px] text-gray-500 dark:text-neutral-400">Prix OP {fmtPrice(changed.existing.prixOp)} → {fmtPrice(changed.data.prixOp)}</p>}
                                </>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center">
                            <Check checked={!!bonPlan[i] && l.status !== 'missing'} disabled={l.status === 'missing'}
                              onChange={() => setBonPlan(b => ({ ...b, [i]: !b[i] }))}
                              label={`${l.nom} passe en bon plan à la fin de l'OP`} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
          <button onClick={handleImport} disabled={!lines || !plan.length || importing}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {importing ? 'Import en cours…'
              : !lines ? 'Importer'
              : !writes.length && plan.length ? 'Rien à changer'
              : reimport ? `Enregistrer ${writes.length} produit${writes.length > 1 ? 's' : ''}`
              : `Importer ${plan.length} produit${plan.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OperationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const canCreate = GLOBAL_ROLES.includes(profile?.role)

  const [op,         setOp]       = useState(undefined) // undefined : chargement, null : introuvable
  const [produits,   setProduits] = useState([])
  const [modal,      setModal]    = useState(null) // null | {} | {id,...}
  const [filterSeg,  setFilterSeg] = useState('')
  const [searchProd, setSearchProd] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [transfer,   setTransfer]   = useState({ busy: false, error: '' })
  const [ilv,        setIlv]        = useState(null)

  // Déclinaisons d'un produit de l'OP → sources d'ILV (prix promo par défaut)
  function openIlv(group, p) {
    setIlv({
      initialKey: p.id,
      preferredType: 'promo',
      sources: group.map(v => ({
        key: v.id, label: [v.couleur, v.reference, v.chrono].filter(Boolean).join(' · ') || v.nom,
        chrono: v.chrono, refFournisseur: v.refFournisseur, nom: v.nom, marque: v.marque, reference: v.reference,
        couleur: v.couleur, prixFort: v.prixFort ?? null, prixOp: v.prixOp, prixBonPlan: v.prixBonPlan ?? null,
        dateDebut: op.dateDebut, dateFin: op.dateFin,
      })),
    })
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
    const data = {
      nom:            form.nom.trim(),
      marque:         form.marque.trim()         || null,
      reference:      form.reference.trim()      || null,
      refFournisseur: form.refFournisseur.trim()  || null,
      chrono:         cleanRef(form.chrono)       || null,
      couleur:        form.couleur.trim()         || null,
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

  async function toggleGroupBonPlan(group) {
    const allChecked = group.every(p => !!p.passeBonPlan)
    const newValue = !allChecked
    const batch = writeBatch(db)
    group.forEach(p => batch.update(doc(db, 'op_commerciales', id, 'produits', p.id), { passeBonPlan: newValue }))
    await batch.commit()
  }

  // Fin d'OP : les prix OP cochés deviennent les prix bon plan (un document par chrono : pas de doublon)
  async function handleTransferBonPlan() {
    const { docs, produitIds, skipped } = bonPlanTransfer(produits, id)
    if (!docs.length) return
    setTransfer({ busy: true, error: '' })
    try {
      const writes = [
        ...docs.map(d => b => b.set(doc(db, BON_PLAN_COLLECTION, d.id), { ...d.data, updatedAt: serverTimestamp() })),
        ...produitIds.map(pid => b => b.update(doc(db, 'op_commerciales', id, 'produits', pid), { bonPlanTransfere: true })),
      ]
      // Un batch Firestore est limité à 500 écritures ; relancer après un échec ne crée pas de doublon
      for (let i = 0; i < writes.length; i += 450) {
        const batch = writeBatch(db)
        writes.slice(i, i + 450).forEach(w => w(batch))
        await batch.commit()
      }
      setTransfer({ busy: false, error: skipped.length
        ? `${skipped.length} produit${skipped.length > 1 ? 's' : ''} sans chrono ni réf. fournisseur non transféré${skipped.length > 1 ? 's' : ''} : ${skipped.map(p => p.nom).join(', ')}`
        : '' })
    } catch {
      setTransfer({ busy: false, error: 'Le transfert a échoué. Relance-le : il reprendra sans créer de doublon.' })
    }
  }

  async function handleDeleteOp() {
    if (!confirm(`Supprimer l'opération « ${op?.nom} » et ses ${produits.length} produit${produits.length > 1 ? 's' : ''} ? Cette action est irréversible.`)) return
    try {
      await deleteOperation(id)
      navigate('/operations')
    } catch {
      alert("La suppression a échoué. Réessaie : ce qui reste de l'opération sera supprimé.")
    }
  }

  async function handleSaveOp(form) {
    await updateDoc(doc(db, 'op_commerciales', id), { ...opFormData(form), updatedAt: serverTimestamp() })
  }

  if (!op) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-gray-400">
          {op === undefined ? 'Chargement…' : (
            <>
              <p>Cette opération n'existe plus.</p>
              <button onClick={() => navigate('/operations')} className="text-xs underline hover:text-gray-600">Retour aux opérations</button>
            </>
          )}
        </div>
      </div>
    )
  }

  const status = getStatus(op)
  const filtered = (() => {
    let list = produits
    if (filterSeg) list = list.filter(p => p.segment === filterSeg)
    const words = normName(searchProd).split(' ').filter(Boolean)
    if (words.length) list = list.filter(p => {
      const text = normName([p.nom, p.marque, p.reference, p.refFournisseur, p.chrono, p.couleur].join(' '))
      return words.every(w => text.includes(w))
    })
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

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-5">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
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
                  {op.globale && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white">OP Animation</span>
                  )}
                  {opRayons(op).length > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
                      Rayon{opRayons(op).length > 1 ? 's' : ''} : {opRayons(op).map(r => RAYON_TYPE_LABELS[r] || r).join(', ')}
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
                <div className="flex flex-wrap items-center gap-2 shrink-0">
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

          {/* Bannière transfert en bon plan (OP terminée) */}
          {status.key === 'terminee' && (() => {
            const toTransfer = produits.filter(p => p.passeBonPlan && !p.bonPlanTransfere)
            if (!toTransfer.length) return null
            return (
              <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  <div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>{toTransfer.length} produit{toTransfer.length > 1 ? 's' : ''}</strong> marqué{toTransfer.length > 1 ? 's' : ''} pour passer en prix bon plan : {toTransfer.length > 1 ? 'leur prix OP deviendra leur' : 'son prix OP deviendra son'} prix bon plan.
                    </p>
                    {transfer.error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{transfer.error}</p>}
                  </div>
                </div>
                {canCreate && (
                  <button onClick={handleTransferBonPlan} disabled={transfer.busy}
                    className="shrink-0 h-7 px-3 rounded-lg disabled:opacity-60 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition-colors">
                    {transfer.busy ? 'Transfert…' : 'Passer en bon plan'}
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
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilterSeg('')}
              className={['h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap',
                !filterSeg ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
              ].join(' ')}>
              Tous ({produits.length})
            </button>
            {SEGMENTS.map(s => {
              const count = produits.filter(p => p.segment === s).length
              if (!count) return null
              return (
                <button key={s} onClick={() => setFilterSeg(s === filterSeg ? '' : s)}
                  className={['h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap',
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
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    {['Produit', 'Déclinaisons', 'Marque', 'Segment', 'Prix fort', 'Prix OP', 'Remise'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                    {canCreate && <th className="px-4 py-3 text-center text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Bon plan fin d'OP</th>}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group) => {
                    const first       = group[0]
                    const rem         = remisePct(first)
                    const isCheap     = isBonPlanBetter(first)
                    const ref         = prixReference(first)
                    const allBonPlan    = group.every(p => !!p.passeBonPlan)
                    const someBonPlan   = group.some(p => !!p.passeBonPlan)
                    const allDone     = group.every(p => !!p.bonPlanTransfere)
                    return (
                      <tr key={group.map(p => p.id).join('-')}
                        style={{position: 'relative'}}
                        className={['border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors',
                          allBonPlan ? 'bg-blue-50/40 dark:bg-blue-500/5' : '',
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
                                {canCreate && (
                                  <button onClick={() => setModal(p)} title="Modifier ou supprimer cette déclinaison"
                                    aria-label={`Modifier ${p.nom} ${p.couleur || ''} ${p.chrono || ''}`}
                                    className="h-6 w-6 -ml-1 grid place-items-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors shrink-0">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                  </button>
                                )}
                                {p.couleur
                                  ? <span className="text-[10px] font-semibold bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded shrink-0">{p.couleur}</span>
                                  : <span className="text-[10px] text-gray-300 dark:text-neutral-600 italic shrink-0">N.B</span>}
                                <span className="text-[11px] font-mono text-gray-700 dark:text-neutral-300">{p.reference || '—'}</span>
                                <span className="text-[10px] font-mono text-gray-400 dark:text-neutral-500">{p.chrono || '—'}</span>
                                {p.prixOp != null && (
                                  <button onClick={() => openIlv(group, p)} title="Télécharger l’ILV de cette déclinaison"
                                    className="relative z-10 h-5 px-1.5 rounded-md text-[10px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800">
                                    ILV
                                  </button>
                                )}
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
                        <td className={['px-4 py-3 align-top whitespace-nowrap', isCheap ? 'text-gray-400 dark:text-neutral-600' : 'text-gray-600 dark:text-neutral-400'].join(' ')}>
                          {first.prixBonPlan != null && !isCheap ? (
                            <>
                              <span className="line-through text-gray-400 dark:text-neutral-500">{fmtPrice(first.prixFort)}</span>
                              <span className="block text-[10px] font-semibold text-blue-600 dark:text-blue-400" title="Le produit a déjà un prix bon plan : c'est lui qui sert de prix de référence">
                                Bon plan {fmtPrice(ref)}
                              </span>
                            </>
                          ) : fmtPrice(first.prixFort)}
                        </td>

                        {/* Prix OP */}
                        <td className="px-4 py-3 align-top">
                          {allBonPlan ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-500/30 shadow-sm shadow-blue-100 dark:shadow-none">
                                {fmtPrice(first.prixOp)}
                              </span>
                              <span className="relative group">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold cursor-default select-none">i</span>
                                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-gray-900 dark:bg-neutral-700 text-white text-[10px] leading-tight px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg text-center">
                                  Ce prix passera en prix bon plan à la fin de l'OP
                                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-neutral-700" />
                                </span>
                              </span>
                              {allDone && <span className="text-[10px] font-normal text-green-500">✓</span>}
                            </div>
                          ) : (
                            <span className="font-semibold text-gray-900 dark:text-white">{fmtPrice(first.prixOp)}</span>
                          )}
                          {allDone && !allBonPlan && <span className="block text-[10px] font-normal text-green-500 mt-0.5">✓ transféré</span>}
                        </td>

                        {/* Remise */}
                        <td className="px-4 py-3 align-top">
                          {rem != null && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{rem}%</span>}
                        </td>

                        {/* Bon plan — acheteur/directeur uniquement */}
                        {canCreate && (
                          <td className="px-4 py-3 text-center align-top">
                            <label className="inline-flex items-center justify-center cursor-pointer">
                              <input type="checkbox" className="sr-only"
                                checked={allBonPlan}
                                onChange={() => toggleGroupBonPlan(group)}
                                disabled={allDone} />
                              <span className={['h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                                allDone ? 'bg-green-500 border-green-500' :
                                allBonPlan ? 'bg-blue-500 border-blue-500' :
                                someBonPlan ? 'bg-blue-200 border-blue-300 dark:bg-blue-500/30 dark:border-blue-500/50' :
                                'border-gray-300 dark:border-neutral-600 hover:border-blue-400',
                              ].join(' ')}>
                                {(allBonPlan || allDone) && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                {someBonPlan && !allBonPlan && !allDone && <span className="block h-0.5 w-2 bg-blue-600 dark:bg-blue-400 rounded" />}
                              </span>
                            </label>
                          </td>
                        )}

                        {/* Overlay "bon plan moins cher" — grise la ligne + message centré */}
                        {isCheap && (
                          <td style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 0, border: 'none', zIndex: 5, pointerEvents: 'none'}}>
                            <div className="absolute inset-0 bg-white/75 dark:bg-neutral-900/80" />
                            <div className="relative h-full flex items-center justify-center z-10 pointer-events-none">
                              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-500/40 shadow-md shadow-orange-100/60 dark:shadow-none">
                                <svg className="h-3.5 w-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                                <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                  Bon plan moins cher — déjà disponible à meilleur prix
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
        <ImportModal opId={id} produits={produits} onClose={() => setShowImport(false)} />
      )}
      {ilv && <IlvDialog {...ilv} onClose={() => setIlv(null)} />}
    </div>
  )
}
