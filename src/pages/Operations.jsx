import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc,
  writeBatch, getDocs,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import { formatEuro } from '../lib/orders'
import { buildPromoIndex, isOpVisibleFor, opRayons, opStatus, searchPromos } from '../lib/opSearch'
import { BON_PLAN_COLLECTION, bonPlanDocId, parseBonPlanSheet, remiseBonPlan } from '../lib/bonPlan'
import { SEGMENT_LABELS, cleanRef, normName, normSegment, parsePrice } from '../lib/opImport'
import { safeUrl } from '../lib/security'
import { readSheetRows } from '../lib/excel'

// ── Parseurs catalogue ────────────────────────────────────────────────────────
const CAT_COLS = {
  'univers': 'univers', 'segment': 'segment', 'famille': 'famille',
  'us-fami': 'sousFamille', 'sous-famille': 'sousFamille', 'sous famille': 'sousFamille',
  'chrono': 'chrono', 'r.n.': 'rn', 'rn': 'rn',
  'marque': 'marque', 'référence': 'reference', 'reference': 'reference',
  'article': 'nom', 'designation': 'nom', 'désignation': 'nom',
  'couleur': 'couleur', 'coloris': 'couleur', 'color': 'couleur', 'colorway': 'couleur',
  'stk': 'stock', 'val stk': 'valeurStock', 'val. stk': 'valeurStock',
}
function parseCatalogueRows(rows) {
  if (!rows.length) return []
  const headers = rows[0].map(h => String(h || '').toLowerCase().trim())
  const fieldMap = headers.map(h => CAT_COLS[h] || null)
  return rows.slice(1).map(row => {
    const obj = {}
    fieldMap.forEach((field, i) => {
      if (!field) return
      const val = row[i] != null ? String(row[i]).trim() : ''
      if (!val) return
      if (field === 'stock' || field === 'valeurStock') {
        const n = parseFloat(val.replace(',', '.').replace(/\s/g, ''))
        if (!isNaN(n)) obj[field] = n
      } else { obj[field] = val }
    })
    return obj
  }).filter(r => r.reference || r.nom)
}

const getStatus = op => opStatus(op)

const STATUS_CONFIG = {
  en_cours: { label: 'En cours', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-500/30', card: 'bg-amber-50/40 dark:bg-amber-500/5' },
  a_venir: { label: 'À venir', pill: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300', border: 'border-green-200 dark:border-green-500/30', card: 'bg-green-50/40 dark:bg-green-500/5' },
  terminee: { label: 'Terminée', pill: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-500/30', card: 'bg-violet-50/40 dark:bg-violet-500/5' },
}

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

export function OpModal({ op, onClose, onSave }) {
  const [form, setForm] = useState({
    nom: op?.nom || '',
    dateDebut: op?.dateDebut || '',
    dateFin: op?.dateFin || '',
    description: op?.description || '',
    lien: op?.lien || '',
    // rayonTypes = tableau (migration depuis l'ancien champ rayonType string)
    rayonTypes: op?.rayonTypes || (op?.rayonType ? [op.rayonType] : []),
    magasinIds: op?.magasinIds || [],
    globale: op?.globale ?? false,
  })
  const [magasins, setMagasins] = useState([])
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  function toggleMagasin(id) {
    setForm(f => ({
      ...f,
      magasinIds: f.magasinIds.includes(id)
        ? f.magasinIds.filter(x => x !== id)
        : [...f.magasinIds, id],
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nom.trim() || !form.dateDebut || !form.dateFin) return
    setSaving(true)
    try { await onSave(form); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {op?.id ? 'Modifier l\'opération' : 'Nouvelle opération'}
          </span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">

          {/* Type : Standard / Globale */}
          <div className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50">
            <button type="button" onClick={() => set('globale', false)}
              className={['flex-1 h-8 rounded-lg text-xs font-semibold transition-colors',
                !form.globale ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-700',
              ].join(' ')}>
              OP Standard
            </button>
            <button type="button" onClick={() => { set('globale', true); set('rayonType', '') }}
              className={['flex-1 h-8 rounded-lg text-xs font-semibold transition-colors',
                form.globale ? 'bg-amber-500 text-white' : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-700',
              ].join(' ')}>
              OP Animation
            </button>
          </div>
          {form.globale && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-500/20">
              Une OP Globale s'affiche en bannière pour les rayons sélectionnés.
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom de l'opération *</span>
            <input className="Input" value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Ex: OP CENTRALE - ASSURANCES" autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Date de début *</span>
              <input type="date" className="Input" value={form.dateDebut} onChange={e => set('dateDebut', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Date de fin *</span>
              <input type="date" className="Input" value={form.dateFin} onChange={e => set('dateFin', e.target.value)} />
            </label>
          </div>

          {/* Lien (OP Globale uniquement) */}
          {form.globale && (
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Lien (optionnel)</span>
              <input type="url" className="Input" value={form.lien} onChange={e => set('lien', e.target.value)} placeholder="https://…" />
            </label>
          )}

          {/* Rayons (multi-sélection) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rayons concernés</span>
              <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                {form.rayonTypes.length === 0 ? 'Tous' : `${form.rayonTypes.length} sélectionné${form.rayonTypes.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => set('rayonTypes', [])}
                className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors',
                  form.rayonTypes.length === 0 ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent' : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                ].join(' ')}>
                Tous les rayons
              </button>
              {RAYON_TYPES.map(r => {
                const active = form.rayonTypes.includes(r)
                return (
                  <button key={r} type="button"
                    onClick={() => set('rayonTypes', active ? form.rayonTypes.filter(x => x !== r) : [...form.rayonTypes, r])}
                    className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors',
                      active ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent' : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                    ].join(' ')}>
                    {RAYON_TYPE_LABELS[r]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Magasins */}
          {magasins.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasins concernés</span>
                <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                  {form.magasinIds.length === 0 ? 'Tous' : `${form.magasinIds.length} sélectionné${form.magasinIds.length > 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {magasins.map(m => (
                  <label key={m.id} className={['flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                    form.magasinIds.includes(m.id)
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800'
                      : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
                  ].join(' ')}>
                    <input type="checkbox" className="sr-only" checked={form.magasinIds.includes(m.id)} onChange={() => toggleMagasin(m.id)} />
                    <span className={['h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      form.magasinIds.includes(m.id) ? 'bg-gray-900 border-gray-900 dark:bg-white dark:border-white' : 'border-gray-300 dark:border-neutral-600',
                    ].join(' ')}>
                      {form.magasinIds.includes(m.id) && (
                        <svg className="h-2.5 w-2.5 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </span>
                    <span className="text-xs text-gray-700 dark:text-neutral-300 truncate">{m.nom}</span>
                  </label>
                ))}
              </div>
              {form.magasinIds.length === 0 && (
                <p className="text-[11px] text-gray-400 dark:text-neutral-500">Aucune sélection = visible dans tous les magasins</p>
              )}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Description</span>
            <textarea className="Input resize-none h-16 text-xs" value={form.description} onChange={e => set('description', e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
              Annuler
            </button>
            <button type="submit" disabled={saving || !form.nom.trim() || !form.dateDebut || !form.dateFin}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal import catalogue ────────────────────────────────────────────────────
function CatalogueImportModal({ catalogueCount, onClose }) {
  const fileRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError('')
    readSheetRows(file).then(raw => {
      try {
        const parsed = parseCatalogueRows(raw)
        if (!parsed.length) { setError('Aucune ligne valide. Vérifiez les en-têtes (Chrono, Référence, Article…)'); return }
        setRows(parsed)
      } catch { setError('Impossible de lire le fichier.') }
    }).catch(() => setError('Impossible de lire le fichier.'))
  }

  async function handleImport(mode) {
    if (!rows?.length) return
    setImporting(true)
    try {
      if (mode === 'replace') {
        // Supprimer l'existant d'abord
        const snap = await getDocs(collection(db, 'catalogue_produits'))
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db)
          snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
          await batch.commit()
        }
      }
      for (let i = 0; i < rows.length; i += 400) {
        const batch = writeBatch(db)
        rows.slice(i, i + 400).forEach(r => {
          const { stock, valeurStock, ...rest } = r
          batch.set(doc(collection(db, 'catalogue_produits')), { ...rest, importedAt: serverTimestamp() })
        })
        await batch.commit()
      }
      onClose()
    } finally { setImporting(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Importer le catalogue produits</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!rows ? (
            <div>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
                Importez le listing stock Excel. En-têtes attendues :<br />
                <span className="font-mono text-[11px] text-gray-400">Univers, Segment, Famille, Chrono, Marque, Référence, Article</span>
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  <strong className="text-gray-700 dark:text-neutral-300">{rows.length} produits</strong> dans <span className="font-mono">{fileName}</span>
                </span>
                <button onClick={() => { setRows(null); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">Changer</button>
              </div>
              {catalogueCount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Le catalogue contient déjà <strong>{catalogueCount} références</strong>. Choisissez le mode d'import ci-dessous.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
                      {['Chrono', 'Référence', 'Nom', 'Couleur', 'Famille', 'Marque'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 30).map((r, i) => (
                      <tr key={i} className="border-b last:border-0 border-gray-100 dark:border-neutral-800">
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-neutral-400">{r.chrono || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">{r.reference || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.nom || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.couleur || <span className="text-gray-300 dark:text-neutral-600">N.B</span>}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.famille || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.marque || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 30 && (
                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 dark:bg-neutral-800/30 border-t border-gray-100 dark:border-neutral-800">… et {rows.length - 30} autres</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
          {rows?.length > 0 && catalogueCount > 0 && (
            <button onClick={() => handleImport('add')} disabled={importing}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 border border-gray-900 text-gray-900 hover:bg-gray-50 dark:border-white dark:text-white dark:hover:bg-neutral-800">
              {importing ? '…' : `Ajouter aux ${catalogueCount} existants`}
            </button>
          )}
          <button onClick={() => handleImport(catalogueCount > 0 ? 'replace' : 'add')} disabled={!rows?.length || importing}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {importing ? 'Import…' : catalogueCount > 0 ? `Remplacer (${rows?.length || 0} produits)` : `Importer ${rows?.length || 0} produits`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal ajout manuel catalogue ──────────────────────────────────────────────
function AddCatalogueModal({ onClose }) {
  const empty = { chrono: '', reference: '', nom: '', couleur: '', famille: '', marque: '', univers: '', segment: '' }
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nom.trim() && !form.reference.trim()) return
    setSaving(true)
    try {
      const data = {}
      Object.entries(form).forEach(([k, v]) => { if (v.trim()) data[k] = v.trim() })
      await addDoc(collection(db, 'catalogue_produits'), { ...data, importedAt: serverTimestamp() })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Ajouter une référence catalogue</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Chrono</span>
              <input className="Input" value={form.chrono} onChange={e => set('chrono', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Référence</span>
              <input className="Input" value={form.reference} onChange={e => set('reference', e.target.value)} />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom / Désignation *</span>
              <input className="Input" value={form.nom} onChange={e => set('nom', e.target.value)} autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Marque</span>
              <input className="Input" value={form.marque} onChange={e => set('marque', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur</span>
              <input className="Input" value={form.couleur} onChange={e => set('couleur', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Famille</span>
              <input className="Input" value={form.famille} onChange={e => set('famille', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Univers</span>
              <input className="Input" value={form.univers} onChange={e => set('univers', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Segment</span>
              <input className="Input" value={form.segment} onChange={e => set('segment', e.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
            <button type="submit" disabled={saving || (!form.nom.trim() && !form.reference.trim())}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Section catalogue ─────────────────────────────────────────────────────────
function CatalogueSection({ canCreate }) {
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    return onSnapshot(
      collection(db, 'catalogue_produits'),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        data.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
        setProduits(data)
        setLoading(false)
      },
      err => { console.error('catalogue_produits:', err); setLoading(false) }
    )
  }, [])

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return produits
    return produits.filter(p =>
      (p.reference || '').toLowerCase().includes(t) ||
      (p.nom || '').toLowerCase().includes(t) ||
      (p.chrono || '').toLowerCase().includes(t)
    )
  }, [produits, search])

  async function handleClear() {
    if (!confirm(`Vider le catalogue (${produits.length} produits) ?`)) return
    for (let i = 0; i < produits.length; i += 400) {
      const batch = writeBatch(db)
      produits.slice(i, i + 400).forEach(p => batch.delete(doc(db, 'catalogue_produits', p.id)))
      await batch.commit()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Catalogue produits</h2>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Base de données ({produits.length} références) — utilisée pour résoudre les chronos lors de l'import OP</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            {produits.length > 0 && (
              <button onClick={handleClear} className="h-8 px-3 rounded-lg text-xs border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
                Vider
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              + Ajouter
            </button>
            <button onClick={() => setShowImport(true)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              Importer Excel
            </button>
          </div>
        )}
      </div>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par référence, chrono ou nom…"
          className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10" />
      </div>
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Chargement…</div>
      ) : produits.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 dark:text-neutral-500">
          Catalogue vide.{canCreate && ' Importez le listing stock pour démarrer.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                {['Chrono', 'Référence', 'Nom', 'Couleur', 'Famille', 'Marque'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(p => (
                <tr key={p.id} className="border-b last:border-0 border-gray-100 dark:border-neutral-800">
                  <td className="px-4 py-2.5 font-mono text-gray-500 dark:text-neutral-400">{p.chrono || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700 dark:text-neutral-300">{p.reference || '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{p.nom || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{p.couleur || <span className="text-gray-300 dark:text-neutral-600 italic text-[10px]">N.B</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{p.famille || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{p.marque || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50 dark:bg-neutral-800/30 border-t border-gray-100 dark:border-neutral-800">
              200 premiers sur {filtered.length} — affinez la recherche
            </div>
          )}
        </div>
      )}
      {showImport && <CatalogueImportModal catalogueCount={produits.length} onClose={() => setShowImport(false)} />}
      {showAdd && <AddCatalogueModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// ── Prix bon plan (carte fidélité) ────────────────────────────────────────────

const BP_STATE = {
  create: { label: 'Nouveau',     cls: 'text-emerald-600 dark:text-emerald-400 font-semibold' },
  update: { label: 'Mis à jour',  cls: 'text-blue-600 dark:text-blue-400 font-semibold' },
  same:   { label: 'Inchangé',    cls: 'text-gray-400' },
}

// Import Excel : un prix par chrono, les prix déjà présents sont remplacés (pas de doublon)
function BonPlanImportModal({ items, onClose }) {
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { rows, skipped }
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const existing = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const plan = useMemo(() => (parsed?.rows || []).map(r => {
    const id = bonPlanDocId(r)
    const prev = existing.get(id)
    const action = !prev ? 'create' : prev.prixBonPlan === r.prixBonPlan && (prev.prixFort ?? null) === (r.prixFort ?? null) ? 'same' : 'update'
    return { id, row: r, prev, action }
  }), [parsed, existing])
  const writes = plan.filter(p => p.action !== 'same')

  function reset() {
    setParsed(null); setFileName(''); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    reset()
    setFileName(file.name)
    try {
      const res = parseBonPlanSheet(await readSheetRows(file))
      if (res.error) setError(res.error)
      else setParsed(res)
    } catch {
      setError('Impossible de lire le fichier.')
    }
  }

  async function handleImport() {
    if (!writes.length) { onClose(); return }
    setImporting(true)
    setError('')
    try {
      for (let i = 0; i < writes.length; i += 450) {
        const batch = writeBatch(db)
        writes.slice(i, i + 450).forEach(({ id, row }) =>
          batch.set(doc(db, BON_PLAN_COLLECTION, id), { ...row, updatedAt: serverTimestamp() }, { merge: true }))
        await batch.commit()
      }
      onClose()
    } catch {
      setError("L'import a échoué en cours de route. Relance-le : il reprendra sans créer de doublon.")
    } finally {
      setImporting(false)
    }
  }

  const count = a => plan.filter(p => p.action === a).length

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Importer les prix bon plan</span>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!parsed ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-neutral-400 space-y-1">
                <p>Colonnes lues : <span className="font-mono text-[11px] text-gray-600 dark:text-neutral-300">Chrono, Prix bon plan</span> (obligatoires), <span className="font-mono text-[11px] text-gray-600 dark:text-neutral-300">Nom, Marque, Segment, Prix fort</span>.</p>
                <p>Un seul prix par chrono : si un chrono a déjà un prix bon plan, il est remplacé.</p>
              </div>
              <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-200 dark:border-neutral-700 rounded-xl p-8 cursor-pointer hover:border-gray-400 transition-colors">
                <svg className="h-8 w-8 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                <span className="text-xs text-gray-400 dark:text-neutral-500">Cliquez pour choisir un fichier (.xlsx, .xls, .csv)</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  <strong className="text-gray-700 dark:text-neutral-300">{plan.length} prix</strong> dans <span className="font-mono">{fileName}</span>
                  {' '}· {count('create')} nouveau{count('create') > 1 ? 'x' : ''} · {count('update')} mis à jour · {count('same')} inchangé{count('same') > 1 ? 's' : ''}
                </span>
                <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Changer de fichier</button>
              </div>
              {parsed.skipped > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {parsed.skipped} ligne{parsed.skipped > 1 ? 's' : ''} sans chrono ou sans prix bon plan ignorée{parsed.skipped > 1 ? 's' : ''}.
                </p>
              )}
              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
                      {['Nom', 'Marque', 'Chrono', 'Prix fort', 'Prix bon plan', 'Remise', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map(({ id, row, prev, action }) => {
                      const rem = remiseBonPlan(row)
                      return (
                        <tr key={id} className="border-b last:border-0 border-gray-100 dark:border-neutral-800">
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.nom || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{row.marque || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-700 dark:text-neutral-300">{row.chrono}</td>
                          <td className="px-3 py-2 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{formatEuro(row.prixFort)}</td>
                          <td className="px-3 py-2 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatEuro(row.prixBonPlan)}</td>
                          <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{rem != null ? `-${rem}%` : '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={BP_STATE[action].cls}>{BP_STATE[action].label}</span>
                            {action === 'update' && prev.prixBonPlan !== row.prixBonPlan && (
                              <span className="block text-[10px] text-gray-500 dark:text-neutral-400">{formatEuro(prev.prixBonPlan)} → {formatEuro(row.prixBonPlan)}</span>
                            )}
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
          <button onClick={handleImport} disabled={!parsed || importing}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {importing ? 'Import…' : !parsed ? 'Importer' : writes.length ? `Enregistrer ${writes.length} prix` : 'Rien à changer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Ajout manuel : remplace le prix bon plan du chrono s'il en a déjà un
function AddBonPlanModal({ items, onClose }) {
  const [form, setForm] = useState({ nom: '', marque: '', chrono: '', segment: '', prixFort: '', prixBonPlan: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const id = bonPlanDocId({ chrono: form.chrono })
  const prev = id && items.find(i => i.id === id)
  const valid = id && parsePrice(form.prixBonPlan) != null

  async function handleSave(e) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, BON_PLAN_COLLECTION, id), {
        chrono:      cleanRef(form.chrono),
        nom:         form.nom.trim(),
        marque:      form.marque.trim() || null,
        segment:     form.segment.trim() || null,
        prixFort:    parsePrice(form.prixFort),
        prixBonPlan: parsePrice(form.prixBonPlan),
        updatedAt:   serverTimestamp(),
      }, { merge: true })
      onClose()
    } catch {
      setError("L'enregistrement a échoué. Réessaie.")
    } finally {
      setSaving(false)
    }
  }

  const label = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Ajouter un prix bon plan</span>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 space-y-1">
              <span className={label}>Nom</span>
              <input className="Input" value={form.nom} onChange={e => set('nom', e.target.value)} autoFocus />
            </label>
            <label className="space-y-1">
              <span className={label}>Marque</span>
              <input className="Input" value={form.marque} onChange={e => set('marque', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className={label}>Chrono *</span>
              <input className="Input" value={form.chrono} onChange={e => set('chrono', e.target.value)} />
            </label>
            <label className="col-span-2 space-y-1">
              <span className={label}>Segment</span>
              <input className="Input" value={form.segment} onChange={e => set('segment', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className={label}>Prix fort (€)</span>
              <input className="Input" inputMode="decimal" value={form.prixFort} onChange={e => set('prixFort', e.target.value)} placeholder="0,00" />
            </label>
            <label className="space-y-1">
              <span className={label}>Prix bon plan (€) *</span>
              <input className="Input" inputMode="decimal" value={form.prixBonPlan} onChange={e => set('prixBonPlan', e.target.value)} placeholder="0,00" />
            </label>
          </div>
          {prev && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Ce chrono a déjà un prix bon plan ({formatEuro(prev.prixBonPlan)}) : il sera remplacé.
            </p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
            <button type="submit" disabled={saving || !valid}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Enregistrement…' : prev ? 'Remplacer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const segmentLabel = s => SEGMENT_LABELS[s] || s

function BonPlanSection({ canCreate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    return onSnapshot(
      collection(db, BON_PLAN_COLLECTION),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        data.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))
        setItems(data)
        setLoading(false)
      },
      () => { setError(true); setLoading(false) },
    )
  }, [])

  const segments = useMemo(() => {
    const s = new Set(items.map(p => normSegment(p.segment)).filter(Boolean))
    return [...s].sort((a, b) => segmentLabel(a).localeCompare(segmentLabel(b), 'fr'))
  }, [items])

  const filtered = useMemo(() => {
    const words = normName(search).split(' ').filter(Boolean)
    return items.filter(p => {
      if (segmentFilter && normSegment(p.segment) !== segmentFilter) return false
      const text = normName([p.nom, p.marque, p.chrono, p.refFournisseur].join(' '))
      return words.every(w => text.includes(w))
    })
  }, [items, search, segmentFilter])

  async function handleDelete(item) {
    if (!confirm(`Supprimer le prix bon plan de « ${item.nom || item.chrono} » ?`)) return
    await deleteDoc(doc(db, BON_PLAN_COLLECTION, item.id))
  }

  async function handleClear() {
    if (!confirm(`Supprimer tous les prix bon plan (${items.length}) ? Cette action est irréversible.`)) return
    for (let i = 0; i < items.length; i += 450) {
      const batch = writeBatch(db)
      items.slice(i, i + 450).forEach(p => batch.delete(doc(db, BON_PLAN_COLLECTION, p.id)))
      await batch.commit()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Prix bon plan</h2>
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Prix réservés aux porteurs de la carte fidélité ({items.length} référence{items.length > 1 ? 's' : ''})</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button onClick={handleClear} className="h-8 px-3 rounded-lg text-xs border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">Tout supprimer</button>
            )}
            <button onClick={() => setShowAdd(true)}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              + Ajouter
            </button>
            <button onClick={() => setShowImport(true)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              Importer Excel
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, marque ou chrono…"
            className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10" />
        </div>
        {segments.length > 0 && (
          <select
            value={segmentFilter}
            onChange={e => setSegmentFilter(e.target.value)}
            className={[
              'h-9 pl-3 pr-7 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 cursor-pointer transition-colors',
              segmentFilter
                ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-300',
            ].join(' ')}
          >
            <option value="">Tous les segments</option>
            {segments.map(s => <option key={s} value={s}>{segmentLabel(s)}</option>)}
          </select>
        )}
      </div>
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Chargement…</div>
      ) : error ? (
        <div className="text-center py-12 text-sm text-red-500">Impossible de charger les prix bon plan. Recharge la page.</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 dark:text-neutral-500">
          Aucun prix bon plan.{canCreate && ' Importez un fichier Excel pour démarrer.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                {['Nom', 'Marque', 'Chrono', 'Segment', 'Prix fort', 'Prix bon plan', 'Remise'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
                {canCreate && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const rem = remiseBonPlan(p)
                return (
                  <tr key={p.id} className="border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{p.nom || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{p.marque || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-700 dark:text-neutral-300">{p.chrono || p.refFournisseur || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{p.segment ? segmentLabel(normSegment(p.segment)) : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{formatEuro(p.prixFort)}</td>
                    <td className="px-4 py-2.5 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatEuro(p.prixBonPlan)}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400">{rem != null ? `-${rem}%` : '—'}</td>
                    {canCreate && (
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleDelete(p)} aria-label={`Supprimer ${p.nom || p.chrono}`}
                          className="h-6 w-6 grid place-items-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-neutral-700 dark:hover:text-red-400 dark:hover:bg-red-500/10">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {showImport && <BonPlanImportModal items={items} onClose={() => setShowImport(false)} />}
      {showAdd && <AddBonPlanModal items={items} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// Passe à true la première fois que `value` est vrai, puis y reste
function useLatch(value) {
  const [latched, setLatched] = useState(value)
  useEffect(() => { if (value) setLatched(true) }, [value])
  return latched || value
}

// Produits des OP données (une écoute par OP : seules les OP en cours ou à venir sont chargées)
function useOpProduits(opIds, enabled) {
  const [byOp, setByOp] = useState({})
  const [error, setError] = useState(false)
  const key = opIds.join(',')
  useEffect(() => {
    if (!enabled || !key) return
    const unsubs = key.split(',').map(id => onSnapshot(
      collection(db, 'op_commerciales', id, 'produits'),
      snap => setByOp(m => ({ ...m, [id]: snap.docs.map(d => ({ id: d.id, opId: id, ...d.data() })) })),
      () => setError(true),
    ))
    return () => unsubs.forEach(u => u())
  }, [key, enabled])
  const ids = key ? key.split(',') : []
  const produits = useMemo(() => (key ? key.split(',') : []).flatMap(id => byOp[id] || []), [byOp, key])
  return { produits, loading: enabled && ids.some(id => !byOp[id]), error }
}

function fmtShort(str) {
  const [, m, d] = (str || '').split('-')
  return d ? `${d}/${m}` : '—'
}

function Chip({ className, children }) {
  return <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${className}`}>{children}</span>
}

function Prices({ barre, prix, remise, strong }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      {barre != null && <span className="text-xs text-gray-400 dark:text-neutral-500 line-through">{formatEuro(barre)}</span>}
      <span className={`text-base font-bold ${strong}`}>{formatEuro(prix)}</span>
      {remise != null && remise > 0 && (
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">-{remise}%</span>
      )}
    </div>
  )
}

// Une ligne « ce produit est en OP » : en cours ou à venir, avec ses prix et ce qu'il faut savoir
function OpPromoLine({ s, allCouleurs, onOpenOp }) {
  const enCours = s.status === 'en_cours'
  const notes = []
  if (s.couleurs.length && s.couleurs.length < allCouleurs.length) notes.push(`Couleurs : ${s.couleurs.join(', ')}`)
  if (s.refIsBonPlan) notes.push(`Prix barré = prix bon plan (prix fort ${formatEuro(s.prixFort)})`)
  if (s.bonPlanBetter) notes.push('Le prix bon plan (carte fidélité) est déjà plus avantageux')
  if (s.futurBonPlan) notes.push(`Après l'OP : passe en bon plan à ${formatEuro(s.prixOp)}`)
  return (
    <div className={['rounded-xl border px-3 py-2.5', enCours
      ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10'
      : 'border-green-200 bg-green-50/60 dark:border-green-500/30 dark:bg-green-500/10',
      s.bonPlanBetter ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Chip className={enCours
            ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950'
            : 'bg-green-600 text-white dark:bg-green-500 dark:text-green-950'}>
            {enCours ? 'En OP' : 'OP à venir'}
          </Chip>
          <button onClick={() => onOpenOp(s.op.id)} className="text-xs font-semibold text-gray-900 dark:text-white hover:underline truncate">
            {s.op.nom}
          </button>
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            {enCours ? `jusqu'au ${fmtShort(s.op.dateFin)}` : `du ${fmtShort(s.op.dateDebut)} au ${fmtShort(s.op.dateFin)}`}
          </span>
        </div>
        <Prices barre={s.prixRef} prix={s.prixOp} remise={s.remise}
          strong={enCours ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'} />
      </div>
      {notes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {notes.map(n => <li key={n} className="text-[11px] text-gray-600 dark:text-neutral-400">{n}</li>)}
        </ul>
      )}
    </div>
  )
}

/**
 * Réponse à « ce vélo est-il en remise, ou va-t-il l'être ? » : une carte par produit avec
 * ses OP en cours et à venir et son prix bon plan (carte fidélité).
 */
function PromoResults({ results, term, loading, error, onOpenOp }) {
  const MAX = 30
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 py-6 text-center text-sm text-red-600 dark:text-red-400">
        La recherche est indisponible pour le moment. Vérifie la connexion et recharge la page.
      </div>
    )
  }
  if (!results.length) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 py-10 px-4 text-center space-y-1">
        {loading
          ? <p className="text-sm text-gray-400 dark:text-neutral-500">Recherche…</p>
          : <>
              <p className="text-sm font-semibold text-gray-700 dark:text-neutral-300">Aucune remise en cours ou à venir pour « {term} »</p>
              <p className="text-xs text-gray-400 dark:text-neutral-500">Ni en OP, ni en bon plan. Essaie avec la réf. fournisseur ou une partie du nom.</p>
            </>}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
        {results.length} produit{results.length > 1 ? 's' : ''}{results.length > MAX && ` : les ${MAX} premiers sont affichés, précise la recherche`}
      </p>
      {results.slice(0, MAX).map(g => (
        <div key={g.key} className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{g.nom}</p>
              <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                {g.marque}
                {g.refs.length > 0 && <span className="font-mono"> · {g.refs.join(', ')}</span>}
              </p>
            </div>
            {g.couleurs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {g.couleurs.map(c => (
                  <span key={c} className="text-[10px] font-semibold bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded">{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {g.ops.map(s => <OpPromoLine key={s.id} s={s} allCouleurs={g.couleurs} onOpenOp={onOpenOp} />)}
            {g.bonPlans.map(b => (
              <div key={`${b.prix}|${b.prixFort}`}
                className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Chip className="bg-blue-600 text-white dark:bg-blue-500">Bon plan</Chip>
                  <span className="text-[11px] text-gray-600 dark:text-neutral-400">
                    Carte fidélité
                    {g.bonPlans.length > 1 && (b.couleurs.length ? ` · ${b.couleurs.join(', ')}` : b.chronos.length > 0 && <span className="font-mono"> · {b.chronos.join(', ')}</span>)}
                  </span>
                </div>
                <Prices barre={b.prixFort} prix={b.prix} remise={b.remise} strong="text-blue-700 dark:text-blue-300" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Operations() {
  const navigate = useNavigate()
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const canCreate = GLOBAL_ROLES.includes(profile?.role)

  const [ops, setOps] = useState([])
  const [bonPlanList, setBonPlanList] = useState([])
  const [bonPlanError, setBonPlanError] = useState(false)
  const [modal, setModal] = useState(null) // null | {} | {id,...}
  const [section, setSection] = useState('en_cours')
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'op_commerciales'), orderBy('dateDebut', 'desc'))
    return onSnapshot(q, snap => setOps(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // OP ciblées sur le rayon et le magasin de l'utilisateur
  const visibleOps = useMemo(() => ops.filter(op => isOpVisibleFor(op, profile)), [ops, profile])

  // Les données de recherche (produits des OP en cours et à venir + prix bon plan) ne sont chargées
  // qu'à la première saisie dans la barre de recherche : ouvrir la page ne coûte pas de lectures.
  const searchUsed = useLatch(search.trim().length > 0)
  const searchOpIds = useMemo(() => visibleOps.filter(op => opStatus(op) !== 'terminee').map(op => op.id).sort(), [visibleOps])
  const opProduits = useOpProduits(searchOpIds, searchUsed)

  useEffect(() => {
    if (!searchUsed) return
    return onSnapshot(collection(db, BON_PLAN_COLLECTION),
      snap => setBonPlanList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setBonPlanError(true))
  }, [searchUsed])

  const promoIndex = useMemo(
    () => buildPromoIndex({ ops: visibleOps, produits: opProduits.produits, bonPlanList }),
    [visibleOps, opProduits.produits, bonPlanList],
  )
  const searchResults = useMemo(() => searchPromos(promoIndex, search), [promoIndex, search])

  async function handleSave(form) {
    const data = {
      nom: form.nom.trim(),
      dateDebut: form.dateDebut,
      dateFin: form.dateFin,
      description: form.description.trim() || null,
      lien: form.lien?.trim() || null,
      globale: form.globale ?? false,
      rayonTypes: form.rayonTypes?.length ? form.rayonTypes : null,
      rayonType: null, // déprécié, on garde null pour compatibilité
      magasinIds: form.magasinIds?.length ? form.magasinIds : null,
    }
    if (modal?.id) {
      await updateDoc(doc(db, 'op_commerciales', modal.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'op_commerciales'), { ...data, createdBy: user.uid, createdAt: serverTimestamp() })
    }
  }

  async function handleDelete(op) {
    if (!confirm(`Supprimer l'opération "${op.nom}" ?`)) return
    await deleteDoc(doc(db, 'op_commerciales', op.id))
  }

  // OPs globales en cours uniquement (séparées du reste)
  const today = new Date().toLocaleDateString('fr-CA')
  const opGlobales = visibleOps.filter(op => op.globale && op.dateDebut <= today && op.dateFin >= today)
  const opStandard = visibleOps.filter(op => !op.globale)

  const grouped = { en_cours: [], a_venir: [], terminee: [] }
  for (const op of opStandard) grouped[getStatus(op)].push(op)

  const SECTIONS = [
    { key: 'en_cours', label: 'En cours', count: grouped.en_cours.length },
    { key: 'a_venir', label: 'À venir', count: grouped.a_venir.length },
    { key: 'terminee', label: 'Terminées', count: grouped.terminee.length },
    { key: 'bon_plan', label: 'Prix bon plan', count: null },
    { key: 'catalogue', label: 'Base de données', count: null },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Opérations Commerciales</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Suivi des opérations et promotions en cours</p>
            </div>
            {canCreate && (
              <button onClick={() => setModal({})}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                + Nouvelle OP
              </button>
            )}
          </div>

          {/* Bannières OPs Globales en cours */}
          {opGlobales.length > 0 && (
            <div className="space-y-2">
              {opGlobales.map(op => (
                <div key={op.id}
                  className="relative rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-center gap-4">
                  <span className="shrink-0 text-amber-500 text-lg">🌐</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">{op.nom}</p>
                    {op.description && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                        {op.description}
                        {op.lien && (
                          <a href={safeUrl(op.lien)} target="_blank" rel="noopener noreferrer"
                            className="ml-1.5 underline font-semibold hover:text-amber-900 dark:hover:text-amber-200">
                            En cliquant ici →
                          </a>
                        )}
                      </p>
                    )}
                    {!op.description && op.lien && (
                      <a href={safeUrl(op.lien)} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline hover:text-amber-900 dark:hover:text-amber-200">
                        Voir le détail →
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    {fmtDate(op.dateDebut)} → {fmtDate(op.dateFin)}
                  </div>
                  {canCreate && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setModal(op)}
                        className="h-6 w-6 grid place-items-center rounded-lg text-amber-400 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(op)}
                        className="h-6 w-6 grid place-items-center rounded-lg text-amber-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recherche par référence */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Un vélo est-il en remise ? Nom, réf. fournisseur, chrono, couleur…"
              className="w-full h-9 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Résultats de recherche */}
          {search.trim() && (
            <PromoResults results={searchResults} term={search.trim()}
              loading={opProduits.loading} error={opProduits.error || bonPlanError}
              onOpenOp={id => navigate(`/operations/${id}`)} />
          )}

          {/* Tabs + Contenu (masqués pendant la recherche) */}
          {!search.trim() && (<>
            <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800 overflow-x-auto">
              {SECTIONS.map(s => {
                const ACTIVE = {
                  en_cours: 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300',
                  a_venir: 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-300',
                  terminee: 'border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-300',
                  bon_plan: 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-300',
                  catalogue: 'border-gray-900 text-gray-900 dark:border-white dark:text-white',
                }
                return (
                  <button key={s.key} onClick={() => setSection(s.key)}
                    className={['h-9 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0',
                      section === s.key
                        ? (ACTIVE[s.key] || 'border-gray-900 text-gray-900 dark:border-white dark:text-white')
                        : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                    ].join(' ')}>
                    {s.label}
                    {s.count > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {s.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Sections spéciales */}
            {section === 'bon_plan' && <BonPlanSection canCreate={canCreate} />}
            {section === 'catalogue' && <CatalogueSection canCreate={canCreate} />}

            {/* Liste des OPs (sections standard) */}
            {['en_cours', 'a_venir', 'terminee'].includes(section) && (
              grouped[section].length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
                  Aucune opération {section === 'en_cours' ? 'en cours' : section === 'a_venir' ? 'à venir' : 'terminée'}.
                  {canCreate && section !== 'terminee' && ' Cliquez sur "+ Nouvelle OP" pour commencer.'}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {grouped[section].map(op => {
                    const st = getStatus(op)
                    const cfg = STATUS_CONFIG[st]
                    return (
                      <div key={op.id}
                        className={`rounded-2xl border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer group ${cfg.card} ${cfg.border}`}
                        onClick={() => navigate(`/operations/${op.id}`)}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug flex-1">{op.nom}</h3>
                          <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
                        </div>
                        {op.description && (
                          <p className="text-xs text-gray-400 dark:text-neutral-500 leading-relaxed line-clamp-2">{op.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-neutral-500">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {fmtDate(op.dateDebut)} → {fmtDate(op.dateFin)}
                        </div>
                        {(() => {
                          const rayons = opRayons(op)
                          return rayons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {rayons.map(r => (
                                <span key={r} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                                  {RAYON_TYPE_LABELS[r] || r}
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-neutral-800">
                          <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                            {op.produitCount != null ? `${op.produitCount} produit${op.produitCount > 1 ? 's' : ''}` : 'Voir les produits'}
                          </span>
                          <div className="flex items-center gap-1">
                            {canCreate && (
                              <>
                                <button onClick={e => { e.stopPropagation(); setModal(op) }}
                                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 opacity-0 group-hover:opacity-100 transition-all">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button onClick={e => { e.stopPropagation(); handleDelete(op) }}
                                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" /></svg>
                                </button>
                              </>
                            )}
                            <span className="text-xs text-gray-400 group-hover:text-gray-700 dark:group-hover:text-neutral-200 transition-colors">→</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </>)}
        </div>
      </main>

      {modal !== null && (
        <OpModal op={modal?.id ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />
      )}
    </div>
  )
}
