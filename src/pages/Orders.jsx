import { useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  addDoc, collection, doc, onSnapshot,
  orderBy, query, where, serverTimestamp, updateDoc, deleteDoc,
} from 'firebase/firestore'
import { getNextOrderNumber } from '../lib/getNextOrderNumber'
import { GLOBAL_ROLES, CAN_DELETE_ROLES } from '../lib/constants'
import { useMagasin } from '../store/useMagasin'
import { useStaff } from '../lib/useStaff'

/* ── Statuts ──────────────────────────────────────────────────────────────── */
const STATUTS = ['en-attente', 'en-cours', 'livree', 'annulee']

const STATUT_META = {
  'en-attente': {
    label: 'En attente',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20',
    select: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
  },
  'en-cours': {
    label: 'En cours',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
    select: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  },
  'livree': {
    label: 'Livrée',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    select: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  'annulee': {
    label: 'Annulée',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
    select: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  },
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtPrice(n) {
  const v = Number(n || 0)
  if (!v) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const INITIAL_FORM = {
  client: '', tel: '', ref_produit: '', produit: '',
  prix: '', date: '', statut: 'en-attente', commentaire: '',
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Orders() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()
  const isGlobal  = GLOBAL_ROLES.includes(profile?.role)
  const canEdit   = !!user
  const canDelete = CAN_DELETE_ROLES.includes(profile?.role)

  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const staff = useStaff(effectiveMagasinId)

  const [orders, setOrders]               = useState([])
  const [q, setQ]                         = useState('')
  const [filterStatut, setFilterStatut]   = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [showForm, setShowForm]           = useState(false)
  const [form, setForm]                   = useState(INITIAL_FORM)
  const [submitting, setSubmitting]       = useState(false)
  const [activeOrder, setActiveOrder]     = useState(null)
  const [toast, setToast]                 = useState(null)

  /* Chargement temps réel */
  useEffect(() => {
    if (!profile) return
    if (!isGlobal && !effectiveMagasinId) return
    const base = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const qRef = effectiveMagasinId
      ? query(base, where('magasinId', '==', effectiveMagasinId))
      : base
    return onSnapshot(qRef, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [effectiveMagasinId, profile, isGlobal])

  /* Filtres */
  const needle   = q.trim().toLowerCase()
  const creators = useMemo(() => [...new Set(orders.map(o => o.createur).filter(Boolean))], [orders])

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterStatut  && o.statut  !== filterStatut)  return false
      if (filterCreator && o.createur !== filterCreator) return false
      if (needle && ![o.client, o.ref_produit, o.produit, o.commentaire]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)) return false
      return true
    })
  }, [orders, needle, filterStatut, filterCreator])

  /* Stats */
  const stats = useMemo(() => ({
    total:      orders.length,
    enAttente:  orders.filter(o => o.statut === 'en-attente').length,
    enCours:    orders.filter(o => o.statut === 'en-cours').length,
    livrees:    orders.filter(o => o.statut === 'livree').length,
    annulees:   orders.filter(o => o.statut === 'annulee').length,
  }), [orders])

  /* Toast */
  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  /* Création */
  function openForm() {
    setForm({
      ...INITIAL_FORM,
      createur: profile?.displayName || user?.email?.split('@')[0] || '',
      date: new Date().toISOString().split('T')[0],
    })
    setShowForm(true)
  }

  async function createOrder(e) {
    e.preventDefault()
    if (!form.client.trim()) return
    setSubmitting(true)
    try {
      const num = await getNextOrderNumber()
      await addDoc(collection(db, 'orders'), {
        numero:       num,
        client:       form.client.trim(),
        tel:          form.tel.trim()         || null,
        ref_produit:  form.ref_produit.trim() || null,
        produit:      form.produit.trim()     || null,
        prix:         parseFloat(String(form.prix).replace(',', '.')) || null,
        date:         form.date               || null,
        statut:       form.statut,
        createur:     form.createur?.trim()   || null,
        commentaire:  form.commentaire.trim() || null,
        magasinId:    effectiveMagasinId || null,
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
        createdBy:    user.uid,
      })
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  /* Changement de statut */
  async function changeStatut(order, statut) {
    await updateDoc(doc(db, 'orders', order.id), { statut, updatedAt: serverTimestamp() })
    if (activeOrder?.id === order.id) setActiveOrder(o => ({ ...o, statut }))
  }

  /* Suppression */
  async function remove(order) {
    if (!canDelete) return
    if (!confirm(`Supprimer la commande #${order.numero} de ${order.client} ?`)) return
    await deleteDoc(doc(db, 'orders', order.id))
    if (activeOrder?.id === order.id) setActiveOrder(null)
  }

  /* Mise à jour commentaire */
  async function saveComment(order, commentaire) {
    await updateDoc(doc(db, 'orders', order.id), { commentaire: commentaire || null, updatedAt: serverTimestamp() })
    if (activeOrder?.id === order.id) setActiveOrder(o => ({ ...o, commentaire }))
  }

  const hasFilters = q || filterStatut || filterCreator

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 p-5">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Commandes client</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{orders.length} commande{orders.length !== 1 ? 's' : ''}</p>
            </div>
            {canEdit && (
              <button
                onClick={openForm}
                className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors
                           bg-gray-900 text-white hover:bg-gray-700
                           dark:bg-white dark:text-black dark:hover:bg-gray-100"
              >
                + Nouvelle commande
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Total"      value={stats.total}     />
            <StatCard label="En attente" value={stats.enAttente} dot="bg-amber-400"   />
            <StatCard label="En cours"   value={stats.enCours}   dot="bg-blue-500"    />
            <StatCard label="Livrées"    value={stats.livrees}   dot="bg-emerald-500" />
            <StatCard label="Annulées"   value={stats.annulees}  dot="bg-red-500"     />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="Input h-8 w-64 text-xs"
              placeholder="Recherche client, réf, désignation…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <select
              className="Input h-8 text-xs w-40"
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {STATUTS.map(s => <option key={s} value={s}>{STATUT_META[s].label}</option>)}
            </select>
            {creators.length > 0 && (
              <select
                className="Input h-8 text-xs w-40"
                value={filterCreator}
                onChange={e => setFilterCreator(e.target.value)}
              >
                <option value="">Tous les agents</option>
                {creators.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {hasFilters && (
              <button
                onClick={() => { setQ(''); setFilterStatut(''); setFilterCreator('') }}
                className="h-8 px-3 rounded-lg text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100
                           dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                Effacer
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400 dark:text-neutral-500">
              {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Tableau */}
          <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 text-left">
                    <Th>N° cmd</Th>
                    <Th>Client</Th>
                    <Th>Téléphone</Th>
                    <Th>Réf. produit</Th>
                    <Th>Désignation</Th>
                    <Th right>Prix TTC</Th>
                    <Th>Date</Th>
                    <Th>Statut</Th>
                    <Th>Créé par</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr
                      key={o.id}
                      onClick={() => setActiveOrder(o)}
                      className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 font-mono text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                        #{o.numero || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {o.client || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                        {o.tel || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 dark:text-neutral-300 whitespace-nowrap">
                        {o.ref_produit || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-neutral-300 max-w-[200px] truncate">
                        {o.produit || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-neutral-300 whitespace-nowrap">
                        {fmtPrice(o.prix)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                        {fmtDate(o.date ? { toDate: () => new Date(o.date) } : null)}
                      </td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <StatusSelect
                          value={o.statut || 'en-attente'}
                          disabled={!canEdit}
                          onChange={s => changeStatut(o, s)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                        {o.createur || '—'}
                      </td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {canDelete && (
                          <button
                            onClick={() => remove(o)}
                            title="Supprimer"
                            className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50
                                       dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-xs text-gray-400 dark:text-neutral-500">
                        Aucune commande{hasFilters ? ' pour ces filtres' : ''}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Modal détail */}
      {activeOrder && (
        <OrderModal
          order={activeOrder}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setActiveOrder(null)}
          onChangeStatut={s => changeStatut(activeOrder, s)}
          onSaveComment={c => saveComment(activeOrder, c)}
          onDelete={() => remove(activeOrder)}
          onCopy={showToast}
        />
      )}

      {/* Formulaire création */}
      {showForm && (
        <OrderForm
          form={form}
          setForm={setForm}
          submitting={submitting}
          onSubmit={createOrder}
          onClose={() => setShowForm(false)}
          staff={staff}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999]
                        flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border
                        bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium
                        dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300
                        animate-fade-in">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}

/* ── Modal détail ──────────────────────────────────────────────────────────── */
function OrderModal({ order, canEdit, canDelete, onClose, onChangeStatut, onSaveComment, onDelete, onCopy }) {
  const [comment, setComment] = useState(order.commentaire || '')
  const [saving, setSaving]   = useState(false)
  const overlayRef = useRef(null)

  useEffect(() => { setComment(order.commentaire || '') }, [order.commentaire])
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  async function handleSaveComment() {
    setSaving(true)
    try { await onSaveComment(comment) } finally { setSaving(false) }
  }

  async function copyInfo() {
    const lines = [
      `N° commande : #${order.numero || '—'}`,
      `Client : ${order.client || '—'}`,
      `Téléphone : ${order.tel || '—'}`,
      `Réf. produit : ${order.ref_produit || '—'}`,
      `Désignation : ${order.produit || '—'}`,
      `Prix TTC : ${fmtPrice(order.prix)}`,
      `Date : ${fmtDate(order.date ? { toDate: () => new Date(order.date) } : null)}`,
      `Statut : ${STATUT_META[order.statut]?.label || order.statut}`,
      `Créé par : ${order.createur || '—'}`,
      order.commentaire ? `Commentaire : ${order.commentaire}` : null,
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(lines)
    onCopy?.('Informations copiées dans le presse-papier')
  }

  const meta = STATUT_META[order.statut] || STATUT_META['en-attente']

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[5vh] overflow-y-auto"
    >
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden
                      bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-gray-400 dark:text-neutral-500">#{order.numero || '—'}</span>
            <span className="font-semibold text-sm text-gray-900 dark:text-white">{order.client}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyInfo}
              title="Copier les infos"
              className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                         dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                title="Supprimer"
                className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50
                           dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                         dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Client */}
          <MCard title="Client">
            <MGrid>
              <MField label="Nom"><MVal>{order.client}</MVal></MField>
              <MField label="Téléphone"><MVal>{order.tel}</MVal></MField>
            </MGrid>
          </MCard>

          {/* Produit */}
          <MCard title="Produit">
            <MGrid>
              <MField label="Référence">
                <MVal mono>{order.ref_produit}</MVal>
              </MField>
              <MField label="Prix TTC">
                <MVal>{fmtPrice(order.prix)}</MVal>
              </MField>
              <MField label="Désignation" span2>
                <MVal>{order.produit}</MVal>
              </MField>
            </MGrid>
          </MCard>

          {/* Suivi */}
          <MCard title="Suivi">
            <MGrid>
              <MField label="Date de commande">
                <MVal>{fmtDate(order.date ? { toDate: () => new Date(order.date) } : null)}</MVal>
              </MField>
              <MField label="Créé par">
                <MVal>{order.createur}</MVal>
              </MField>
              <MField label="Statut" span2>
                <StatusSelect
                  value={order.statut || 'en-attente'}
                  disabled={!canEdit}
                  onChange={onChangeStatut}
                  full
                />
              </MField>
            </MGrid>
          </MCard>

          {/* Commentaire */}
          <MCard title="Commentaire">
            <textarea
              rows={3}
              className="Input text-xs"
              value={comment}
              disabled={!canEdit}
              onChange={e => setComment(e.target.value)}
              placeholder="Notes internes…"
            />
            {canEdit && comment !== (order.commentaire || '') && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSaveComment}
                  disabled={saving}
                  className="h-7 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50
                             bg-gray-900 text-white hover:bg-gray-700
                             dark:bg-white dark:text-black dark:hover:bg-gray-100"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            )}
          </MCard>
        </div>
      </div>
    </div>
  )
}

/* ── Formulaire création ──────────────────────────────────────────────────── */
function OrderForm({ form, setForm, submitting, onSubmit, onClose, staff = [] }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[5vh] overflow-y-auto"
    >
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden
                      bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Nouvelle commande</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                       dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="p-5 space-y-4">

            {/* Client */}
            <FCard title="Client">
              <FGrid>
                <FField label="Nom du client" required>
                  <input className="Input" value={form.client} onChange={e => set('client', e.target.value)} autoFocus />
                </FField>
                <FField label="Téléphone">
                  <input className="Input" value={form.tel} onChange={e => set('tel', e.target.value)} />
                </FField>
              </FGrid>
            </FCard>

            {/* Produit */}
            <FCard title="Produit">
              <FGrid>
                <FField label="Réf. produit">
                  <input className="Input font-mono" placeholder="ECR-4K-27" value={form.ref_produit} onChange={e => set('ref_produit', e.target.value)} />
                </FField>
                <FField label="Prix TTC (€)">
                  <input className="Input" placeholder="0.00" value={form.prix} onChange={e => set('prix', e.target.value)} />
                </FField>
                <FField label="Désignation" span2>
                  <input className="Input" placeholder="Nom complet du produit" value={form.produit} onChange={e => set('produit', e.target.value)} />
                </FField>
              </FGrid>
            </FCard>

            {/* Suivi */}
            <FCard title="Suivi">
              <FGrid>
                <FField label="Date de commande">
                  <input type="date" className="Input" value={form.date} onChange={e => set('date', e.target.value)} />
                </FField>
                <FField label="Statut">
                  <select className="Input" value={form.statut} onChange={e => set('statut', e.target.value)}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_META[s].label}</option>)}
                  </select>
                </FField>
                <FField label="Créé par" span2>
                  {staff.length > 0 ? (
                    <select className="Input" value={form.createur || ''} onChange={e => set('createur', e.target.value)}>
                      <option value="">— Sélectionner</option>
                      {staff.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}
                    </select>
                  ) : (
                    <input className="Input" value={form.createur || ''} onChange={e => set('createur', e.target.value)} />
                  )}
                </FField>
              </FGrid>
            </FCard>

            {/* Commentaire */}
            <FCard title="Commentaire">
              <textarea
                rows={2}
                className="Input text-xs"
                placeholder="Notes internes optionnelles…"
                value={form.commentaire}
                onChange={e => set('commentaire', e.target.value)}
              />
            </FCard>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 rounded-lg text-xs font-medium border transition-colors
                         text-gray-700 border-gray-200 hover:bg-gray-50
                         dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !form.client.trim()}
              className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50
                         bg-gray-900 text-white hover:bg-gray-700
                         dark:bg-white dark:text-black dark:hover:bg-gray-100"
            >
              {submitting ? 'Création…' : 'Créer la commande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Composants UI ────────────────────────────────────────────────────────── */
function StatCard({ label, value, dot }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        {dot && <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />}
        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </div>
  )
}

function StatusSelect({ value, onChange, disabled, full = false }) {
  const meta = STATUT_META[value] || STATUT_META['en-attente']
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className={[
        'rounded-lg border-0 text-xs font-medium px-2 py-1 cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20',
        'disabled:cursor-default',
        full ? 'w-full' : '',
        meta.select,
      ].join(' ')}
    >
      {STATUTS.map(s => (
        <option key={s} value={s} className="bg-white dark:bg-neutral-900 text-gray-900 dark:text-white">
          {STATUT_META[s].label}
        </option>
      ))}
    </select>
  )
}

function Th({ children, right = false }) {
  return (
    <th className={`px-3 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

/* ── Modal helpers ── */
function MCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function MGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-3">{children}</div>
}

function MField({ label, children, span2 = false }) {
  return (
    <div className={span2 ? 'col-span-full' : ''}>
      <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}

function MVal({ children, mono = false }) {
  return (
    <p className={`text-sm text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>
      {children || '—'}
    </p>
  )
}

/* ── Form helpers ── */
function FCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function FGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-5 gap-y-3">{children}</div>
}

function FField({ label, children, required = false, span2 = false }) {
  return (
    <label className={`block space-y-1 ${span2 ? 'col-span-full' : ''}`}>
      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
