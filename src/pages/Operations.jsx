import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  collectionGroup,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'

function getStatus(op) {
  const today = new Date().toLocaleDateString('fr-CA') // YYYY-MM-DD local
  if (op.dateFin < today)    return 'terminee'
  if (op.dateDebut > today)  return 'a_venir'
  return 'en_cours'
}

const STATUS_CONFIG = {
  en_cours: { label: 'En cours',  pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  a_venir:  { label: 'À venir',   pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  terminee: { label: 'Terminée',  pill: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400' },
}

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

export function OpModal({ op, onClose, onSave }) {
  const [form, setForm] = useState({
    nom:         op?.nom         || '',
    dateDebut:   op?.dateDebut   || '',
    dateFin:     op?.dateFin     || '',
    description: op?.description || '',
    lien:        op?.lien        || '',
    // rayonTypes = tableau (migration depuis l'ancien champ rayonType string)
    rayonTypes:  op?.rayonTypes  || (op?.rayonType ? [op.rayonType] : []),
    magasinIds:  op?.magasinIds  || [],
    globale:     op?.globale     ?? false,
  })
  const [magasins, setMagasins] = useState([])
  const [saving,   setSaving]   = useState(false)
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
              🌐 OP Globale
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

export default function Operations() {
  const navigate = useNavigate()
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const canCreate = GLOBAL_ROLES.includes(profile?.role)

  const [ops,        setOps]        = useState([])
  const [allProduits,setAllProduits] = useState([])
  const [modal,      setModal]      = useState(null) // null | {} | {id,...}
  const [section,    setSection]    = useState('en_cours')
  const [search,     setSearch]     = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'op_commerciales'), orderBy('dateDebut', 'desc'))
    return onSnapshot(q, snap => setOps(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // Chargement de tous les produits (collectionGroup) pour la recherche
  useEffect(() => {
    const q = query(collectionGroup(db, 'produits'), orderBy('reference', 'asc'))
    return onSnapshot(q, snap => setAllProduits(snap.docs.map(d => ({
      id:    d.id,
      opId:  d.ref.parent.parent.id,
      ...d.data(),
    }))))
  }, [])

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return allProduits.filter(p =>
      (p.nom           || '').toLowerCase().includes(term) ||
      (p.reference     || '').toLowerCase().includes(term) ||
      (p.refFournisseur|| '').toLowerCase().includes(term)
    ).map(p => ({
      ...p,
      op: ops.find(o => o.id === p.opId),
    }))
  }, [search, allProduits, ops])

  async function handleSave(form) {
    const data = {
      nom:         form.nom.trim(),
      dateDebut:   form.dateDebut,
      dateFin:     form.dateFin,
      description: form.description.trim() || null,
      lien:        form.lien?.trim()        || null,
      globale:     form.globale             ?? false,
      rayonTypes:  form.rayonTypes?.length ? form.rayonTypes : null,
      rayonType:   null, // déprécié, on garde null pour compatibilité
      magasinIds:  form.magasinIds?.length  ? form.magasinIds : null,
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

  const isRayonRole = RAYON_TYPES.includes(profile?.role)

  // Filtrer les OPs selon le rayon et le magasin de l'utilisateur
  const visibleOps = useMemo(() => ops.filter(op => {
    // Filtre rayon (nouveau champ rayonTypes tableau + rétro-compat rayonType string)
    const rayons = op.rayonTypes?.length ? op.rayonTypes : (op.rayonType ? [op.rayonType] : [])
    if (rayons.length > 0 && isRayonRole && !rayons.includes(profile?.role)) return false
    // Filtre magasin
    if (op.magasinIds && profile?.magasinId && !op.magasinIds.includes(profile.magasinId)) return false
    return true
  }), [ops, isRayonRole, profile])

  // OPs globales en cours uniquement (séparées du reste)
  const today = new Date().toLocaleDateString('fr-CA')
  const opGlobales = visibleOps.filter(op => op.globale && op.dateDebut <= today && op.dateFin >= today)
  const opStandard = visibleOps.filter(op => !op.globale)

  const grouped = { en_cours: [], a_venir: [], terminee: [] }
  for (const op of opStandard) grouped[getStatus(op)].push(op)

  const SECTIONS = [
    { key: 'en_cours', label: 'En cours',  count: grouped.en_cours.length },
    { key: 'a_venir',  label: 'À venir',   count: grouped.a_venir.length },
    { key: 'terminee', label: 'Terminées', count: grouped.terminee.length },
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
                          <a href={op.lien} target="_blank" rel="noopener noreferrer"
                            className="ml-1.5 underline font-semibold hover:text-amber-900 dark:hover:text-amber-200">
                            En cliquant ici →
                          </a>
                        )}
                      </p>
                    )}
                    {!op.description && op.lien && (
                      <a href={op.lien} target="_blank" rel="noopener noreferrer"
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
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
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
              placeholder="Rechercher par nom, référence produit ou fournisseur…"
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
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              {searchResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400 dark:text-neutral-500">
                  Aucun produit trouvé pour « {search.trim()} »
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
                      {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-neutral-800">
                        {['Opération', 'Statut', 'Produit', 'Marque', 'Réf. produit', 'Réf. fourn.', 'Prix fort', 'Prix OP'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map(p => {
                        const st = p.op ? getStatus(p.op) : null
                        return (
                          <tr key={`${p.opId}_${p.id}`}
                            className="border-b last:border-0 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/operations/${p.opId}`)}>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.op?.nom || p.opId}</td>
                            <td className="px-4 py-3">
                              {st && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st.pill}`}>{st.label}</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">
                              <span className={p.nom?.toLowerCase().includes(search.trim().toLowerCase()) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1 rounded' : ''}>
                                {p.nom}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">{p.marque || '—'}</td>
                            <td className="px-4 py-3 font-mono text-gray-500 dark:text-neutral-400">
                              <span className={p.reference?.toLowerCase().includes(search.trim().toLowerCase()) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1 rounded' : ''}>
                                {p.reference || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-500 dark:text-neutral-400">
                              <span className={p.refFournisseur?.toLowerCase().includes(search.trim().toLowerCase()) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1 rounded' : ''}>
                                {p.refFournisseur || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">{p.prixFort != null ? `${p.prixFort} €` : '—'}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{p.prixOp != null ? `${p.prixOp} €` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* Tabs + Liste (masqués pendant la recherche) */}
          {!search.trim() && (<>
            <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
              {SECTIONS.map(s => (
                <button key={s.key} onClick={() => setSection(s.key)}
                  className={['h-9 px-4 text-xs font-semibold border-b-2 transition-colors',
                    section === s.key
                      ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                  ].join(' ')}>
                  {s.label}
                  {s.count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {s.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Liste des OPs */}
            {grouped[section].length === 0 ? (
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
                      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer group"
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
                        const rayons = op.rayonTypes?.length ? op.rayonTypes : (op.rayonType ? [op.rayonType] : [])
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
