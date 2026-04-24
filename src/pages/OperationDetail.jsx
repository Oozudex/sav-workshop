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
  if (op.dateFin < today)   return { label: 'Terminée', pill: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400' }
  if (op.dateDebut > today) return { label: 'À venir',  pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' }
  return { label: 'En cours', pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' }
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

// Colonnes Excel attendues → champs internes
const EXCEL_COLS = {
  'nom':             'nom',
  'produit':         'nom',
  'marque':          'marque',
  'brand':           'marque',
  'référence':       'reference',
  'reference':       'reference',
  'ref produit':     'reference',
  'ref. produit':    'reference',
  'ref fournisseur': 'refFournisseur',
  'réf fournisseur': 'refFournisseur',
  'ref. fournisseur':'refFournisseur',
  'segment':         'segment',
  'prix fort':       'prixFort',
  'prix op':         'prixOp',
  'prix opération':  'prixOp',
}

const SEGMENT_ALIASES = {
  'velo': 'velo', 'vélo': 'velo', 'bike': 'velo',
  'trottinette': 'trottinette', 'scooter': 'trottinette',
  'roller': 'roller',
  'accessoires': 'accessoires', 'accessoire': 'accessoires', 'acces': 'accessoires',
}

function parseExcelRows(rows) {
  if (!rows.length) return []
  const headers = rows[0].map(h => String(h || '').toLowerCase().trim())
  const fieldMap = headers.map(h => EXCEL_COLS[h] || null)

  return rows.slice(1).map(row => {
    const obj = {}
    fieldMap.forEach((field, i) => {
      if (!field) return
      const val = row[i] != null ? String(row[i]).trim() : ''
      if (!val) return
      if (field === 'prixFort' || field === 'prixOp') {
        const n = parseFloat(val.replace(',', '.'))
        if (!isNaN(n)) obj[field] = n
      } else if (field === 'segment') {
        obj[field] = SEGMENT_ALIASES[val.toLowerCase()] || val.toLowerCase()
      } else {
        obj[field] = val
      }
    })
    return obj
  }).filter(r => r.nom)
}

function ImportModal({ opId, onClose }) {
  const fileRef = useRef(null)
  const [rows,      setRows]      = useState(null) // parsed preview rows
  const [fileName,  setFileName]  = useState('')
  const [importing, setImporting] = useState(false)
  const [error,     setError]     = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const parsed = parseExcelRows(raw)
        if (!parsed.length) { setError('Aucune ligne valide trouvée. Vérifiez que la première ligne contient les en-têtes.'); return }
        setRows(parsed)
      } catch {
        setError('Impossible de lire le fichier. Assurez-vous que c\'est un fichier Excel (.xlsx / .xls) ou CSV.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!rows?.length) return
    setImporting(true)
    try {
      const batch = writeBatch(db)
      for (const r of rows) {
        const ref = doc(collection(db, 'op_commerciales', opId, 'produits'))
        batch.set(ref, { ...r, createdAt: serverTimestamp() })
      }
      await batch.commit()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Importer depuis Excel</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Zone de dépôt */}
          {!rows ? (
            <div>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
                Importez un fichier Excel (.xlsx, .xls) ou CSV. La première ligne doit contenir les en-têtes :<br/>
                <span className="font-mono text-[11px] text-gray-400">Nom, Marque, Référence, Réf fournisseur, Segment, Prix fort, Prix op</span>
              </p>
              <label className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-200 dark:border-neutral-700 rounded-xl p-8 cursor-pointer hover:border-gray-400 dark:hover:border-neutral-500 transition-colors">
                <svg className="h-8 w-8 text-gray-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs text-gray-400 dark:text-neutral-500">Cliquez pour choisir un fichier</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>
              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                  <strong className="text-gray-700 dark:text-neutral-300">{rows.length} produits</strong> détectés dans <span className="font-mono">{fileName}</span>
                </div>
                <button onClick={() => { setRows(null); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 underline">
                  Changer de fichier
                </button>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
                      {['Nom', 'Marque', 'Référence', 'Réf. fourn.', 'Segment', 'Prix fort', 'Prix OP'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b last:border-0 border-gray-100 dark:border-neutral-800">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.nom}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.marque || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-neutral-400">{r.reference || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-neutral-400">{r.refFournisseur || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.segment || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{r.prixFort != null ? `${r.prixFort} €` : '—'}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-neutral-300 font-semibold">{r.prixOp != null ? `${r.prixOp} €` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-neutral-500 bg-gray-50 dark:bg-neutral-800/30 border-t border-gray-100 dark:border-neutral-800">
                    … et {rows.length - 50} autres produits
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
            Annuler
          </button>
          <button onClick={handleImport} disabled={!rows?.length || importing}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {importing ? 'Import en cours…' : `Importer ${rows?.length || 0} produits`}
          </button>
        </div>
      </div>
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
    let list = filterSeg ? produits.filter(p => p.segment === filterSeg) : produits
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

          {/* Table produits */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 dark:text-neutral-500">
              Aucun produit.{canCreate && ' Cliquez sur "+ Produit" pour en ajouter.'}
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    {['Produit', 'Marque', 'Réf. produit', 'Réf. fourn.', 'Segment', 'Prix fort', 'Prix OP', 'Remise'].map(h => {
                      const col = h === 'Marque' ? 'marque' : h === 'Segment' ? 'segment' : null
                      const active = sortBy === col
                      return col ? (
                        <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wide">
                          <button onClick={() => handleSort(col)}
                            className={['inline-flex items-center gap-1 font-semibold transition-colors',
                              active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                            ].join(' ')}>
                            {h}
                            <span className="text-[9px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </button>
                        </th>
                      ) : (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide text-[10px]">{h}</th>
                      )
                    })}
                    {canCreate && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const rem = remise(p.prixFort, p.prixOp)
                    return (
                      <tr key={p.id} className="border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nom}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-neutral-400">{p.marque || '—'}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 dark:text-neutral-400">{p.reference || '—'}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 dark:text-neutral-400">{p.refFournisseur || '—'}</td>
                        <td className="px-4 py-3">
                          {p.segment && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEGMENT_COLORS[p.segment]}`}>
                              {SEGMENT_LABELS[p.segment] || p.segment}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-neutral-400">{fmtPrice(p.prixFort)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{fmtPrice(p.prixOp)}</td>
                        <td className="px-4 py-3">
                          {rem != null && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">-{rem}%</span>
                          )}
                        </td>
                        {canCreate && (
                          <td className="px-4 py-3">
                            <button onClick={() => setModal(p)}
                              className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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
