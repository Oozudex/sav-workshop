import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AlertSettingsModal from '../components/AlertSettingsModal'
import OrderStatsModal from '../components/OrderStatsModal'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useAlerts } from '../store/useAlerts'
import { db } from '../lib/firebase'
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { getNextOrderNumber } from '../lib/counters'
import { GLOBAL_ROLES, CAN_DELETE_ROLES, ORDER_CLOSED_STATUTS } from '../lib/constants'
import {
  ORDER_ALERTS, ORDER_OPEN_STATUSES, ORDER_STATUSES, ORDER_STATUS_META, ORDER_TYPES, ORDER_VISIBLE_DAYS,
  formatEuro, formatOrderNumber, isLateDelivery, isOrderListed, isOrderOpen, orderMatches, orderStatus,
  orderFormErrors, orderStatusSince, orderTotal, parseEuro, remainingToPay,
} from '../lib/orders'
import { toDate } from '../lib/ticketStats'
import { useMagasin } from '../store/useMagasin'
import { useStaff } from '../lib/useStaff'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtDate(value) {
  const d = toDate(value)
  return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function fmtYmd(ymd) {
  return ymd ? fmtDate(`${ymd}T12:00:00`) : '—'
}

function sinceLabel(date) {
  const d = toDate(date)
  if (!d) return ''
  const n = Math.floor((Date.now() - d.getTime()) / 86400000)
  return n <= 0 ? "aujourd'hui" : `depuis ${n} j`
}

// Prochaine étape proposée en un clic dans la fiche
const NEXT_STEP = {
  'a-commander':    { to: 'commandee',      label: 'Commande passée au fournisseur' },
  'commandee':      { to: 'recue',          label: 'Reçue en magasin' },
  'recue':          { to: 'client-prevenu', label: '📞 Client prévenu' },
  'client-prevenu': { to: 'retiree',        label: 'Remise au client' },
}

// Champs modifiables, partagés par le formulaire de création et la modification
const EMPTY_FIELDS = {
  client: '', tel: '', type: 'piece', ref_produit: '', produit: '',
  fournisseur: '', refFournisseur: '', dateReceptionPrevue: '',
  prix: '', fraisPort: '', acompte: '', createur: '',
}
const FIELD_LABELS = {
  client: 'client', tel: 'téléphone', type: 'type', ref_produit: 'référence', produit: 'désignation',
  fournisseur: 'fournisseur', refFournisseur: 'n° commande fournisseur', dateReceptionPrevue: 'réception prévue',
  prix: 'prix de vente', fraisPort: 'frais de port', acompte: 'acompte', createur: 'créé par',
}

// Montants affichés à la française dans le formulaire : 249.9 → « 249,90 »
const MONEY_FIELDS = ['prix', 'fraisPort', 'acompte']
const moneyInput = v => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v)

function fieldsOf(order) {
  return Object.fromEntries(Object.keys(EMPTY_FIELDS).map(k => {
    const v = order?.[k] ?? EMPTY_FIELDS[k]
    return [k, MONEY_FIELDS.includes(k) ? moneyInput(v) : v]
  }))
}

// Valeurs prêtes à enregistrer (texte nettoyé, prix numériques, vide → null)
function cleanFields(f) {
  const text = v => (typeof v === 'string' ? v.trim() : v) || null
  return {
    client: text(f.client), tel: text(f.tel), type: f.type || null,
    ref_produit: text(f.ref_produit), produit: text(f.produit),
    fournisseur: text(f.fournisseur), refFournisseur: text(f.refFournisseur),
    dateReceptionPrevue: f.dateReceptionPrevue || null,
    prix: parseEuro(f.prix), fraisPort: parseEuro(f.fraisPort), acompte: parseEuro(f.acompte), createur: text(f.createur),
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Orders() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const { selectedId } = useMagasin()
  const isGlobal  = GLOBAL_ROLES.includes(profile?.role)
  const canDelete = CAN_DELETE_ROLES.includes(profile?.role)
  const canManage = ['directeurmag', 'directeurgen'].includes(profile?.role)
  const me = profile?.displayName || user?.email || '—'

  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const staff = useStaff(effectiveMagasinId, 'velo')

  const [orders, setOrders]               = useState([])
  const [magasins, setMagasins]           = useState({})
  const [tab, setTab]                     = useState('open')
  const [q, setQ]                         = useState('')
  const [filterStatut, setFilterStatut]   = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [showForm, setShowForm]           = useState(false)
  const [showAlerts, setShowAlerts]       = useState(false)
  const [showStats, setShowStats]         = useState(false)
  const [magasinNom, setMagasinNom]       = useState('')
  const [activeId, setActiveId]           = useState(null)
  const [toast, setToast]                 = useState(null)

  /* Chargement temps réel */
  useEffect(() => {
    if (!profile) return
    if (!isGlobal && !effectiveMagasinId) return
    const base = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const qRef = effectiveMagasinId ? query(base, where('magasinId', '==', effectiveMagasinId)) : base
    return onSnapshot(qRef, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [effectiveMagasinId, profile, isGlobal])

  /* Noms des magasins (colonne « Magasin » en vue tous magasins) */
  useEffect(() => {
    if (!isGlobal) return
    return onSnapshot(collection(db, 'magasins'), snap =>
      setMagasins(Object.fromEntries(snap.docs.map(d => [d.id, d.data().nom]))))
  }, [isGlobal])

  /* Nom du magasin (titres des panneaux statistiques et alertes) */
  useEffect(() => {
    if (!canManage || !effectiveMagasinId) { setMagasinNom(''); return }
    getDoc(doc(db, 'magasins', effectiveMagasinId))
      .then(snap => setMagasinNom(snap.exists() ? snap.data().nom : ''))
      .catch(() => setMagasinNom(''))
  }, [canManage, effectiveMagasinId])

  /* Filtre ouvert depuis la cloche : ?alerte=<clé> */
  const [searchParams, setSearchParams] = useSearchParams()
  const alertKey = searchParams.get('alerte')
  const alerts = useAlerts(s => s.alerts).filter(a => a.scope === 'orders')
  const alertFilter = alertKey ? alerts.find(a => a.key === alertKey) : null
  function clearAlertFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('alerte')
    setSearchParams(next, { replace: true })
  }
  useEffect(() => { if (alertKey) { setTab('open'); setFilterStatut('') } }, [alertKey])

  /* Filtres : les commandes terminées depuis plus de 14 jours ne sont plus listées
     (elles restent chargées pour les statistiques) */
  const visible = useMemo(() => orders.filter(o => isOrderListed(o)), [orders])
  const creators = useMemo(() => [...new Set(visible.map(o => o.createur).filter(Boolean))], [visible])
  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER_STATUSES.map(s => [s, 0]))
    for (const o of visible) c[orderStatus(o)]++
    return c
  }, [visible])
  const openCount = visible.filter(isOrderOpen).length
  const doneCount = visible.length - openCount

  const filtered = useMemo(() => visible.filter(o => {
    const status = orderStatus(o)
    if (tab === 'open' ? !isOrderOpen(o) : isOrderOpen(o)) return false
    if (alertKey && !alertFilter?.itemIds.includes(o.id)) return false
    if (filterStatut && status !== filterStatut) return false
    if (filterCreator && o.createur !== filterCreator) return false
    return orderMatches(o, q)
  }), [visible, tab, alertKey, alertFilter, filterStatut, filterCreator, q])

  const hasFilters = q || filterStatut || filterCreator
  const activeOrder = orders.find(o => o.id === activeId) || null

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const historyEntry = (action, note) => ({ at: new Date().toISOString(), by: me, action, note })

  /* Création */
  async function createOrder(fields, statut, note) {
    const clean = cleanFields(fields)
    const numero = await getNextOrderNumber()
    await addDoc(collection(db, 'orders'), {
      numero, ...clean, statut,
      statutAt: serverTimestamp(),
      statusDates: { [statut]: serverTimestamp() },
      closedAt: null,
      notes: note ? [{ at: new Date().toISOString(), author: clean.createur || me, text: note }] : [],
      history: [historyEntry('create', `Commande créée · ${ORDER_STATUS_META[statut].label}`)],
      magasinId: effectiveMagasinId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
    })
    setShowForm(false)
    // La nouvelle commande doit être visible : retour sur « En cours », sans filtre
    if (alertKey) clearAlertFilter()
    setTab('open'); setFilterStatut(''); setFilterCreator(''); setQ('')
    showToast(`Commande ${numero} créée`)
  }

  /* Changement de statut */
  async function changeStatut(order, statut) {
    if (statut === orderStatus(order)) return
    if (statut === 'annulee' && !confirm(`Annuler la commande ${formatOrderNumber(order.numero)} ? Les données du client seront effacées 14 jours plus tard.`)) return
    await updateDoc(doc(db, 'orders', order.id), {
      statut,
      statutAt: serverTimestamp(),
      // Date de chaque étape : sert aux délais des statistiques (lib/orderStats.js)
      [`statusDates.${statut}`]: serverTimestamp(),
      // Date de clôture : point de départ du délai d'anonymisation RGPD (lib/cleanup.js)
      closedAt: ORDER_CLOSED_STATUTS.includes(statut) ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
      history: arrayUnion(historyEntry('status', `Statut → ${ORDER_STATUS_META[statut].label}`)),
    })
  }

  /* Modification des champs */
  async function saveFields(order, fields) {
    const before = cleanFields(fieldsOf(order))
    const after = cleanFields(fields)
    const changed = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    if (!changed.length) return
    await updateDoc(doc(db, 'orders', order.id), {
      ...Object.fromEntries(changed.map(k => [k, after[k]])),
      updatedAt: serverTimestamp(),
      history: arrayUnion(historyEntry('edit', `Champs modifiés : ${changed.map(k => FIELD_LABELS[k]).join(', ')}`)),
    })
    showToast('Commande mise à jour')
  }

  /* Note avec auteur (le texte n'est pas recopié dans l'historique : RGPD) */
  async function addNote(order, author, text) {
    await updateDoc(doc(db, 'orders', order.id), {
      notes: arrayUnion({ at: new Date().toISOString(), author, text }),
      updatedAt: serverTimestamp(),
      history: arrayUnion(historyEntry('note', `Note ajoutée par ${author}`)),
    })
  }

  /* Suppression (directeurs et acheteurs) */
  async function remove(order) {
    if (!canDelete) return
    if (!confirm(`Supprimer définitivement la commande ${formatOrderNumber(order.numero)} ?`)) return
    await deleteDoc(doc(db, 'orders', order.id))
    if (activeId === order.id) setActiveId(null)
  }

  const statusCards = tab === 'open' ? ORDER_OPEN_STATUSES : ['retiree', 'annulee']

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 p-4 sm:p-5">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Commandes clients</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Vélos, pièces et accessoires commandés pour un client</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <button
                  onClick={() => setShowStats(true)}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold transition-colors
                             text-gray-700 border-gray-200 hover:bg-gray-50
                             dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Statistiques
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setShowAlerts(true)}
                  disabled={!effectiveMagasinId}
                  title={effectiveMagasinId ? 'Seuils d\'alerte des commandes' : 'Sélectionne un magasin pour régler ses alertes'}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50
                             text-gray-700 border-gray-200 hover:bg-gray-50
                             dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Alertes
                  {profile?.role === 'directeurmag' && alerts.length > 0 && (
                    <span className="ml-1.5 inline-grid place-items-center min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
                      {alerts.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => setShowForm(true)}
                disabled={!effectiveMagasinId}
                title={effectiveMagasinId ? '' : 'Sélectionne un magasin pour créer une commande'}
                className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 max-sm:flex-1
                           bg-gray-900 text-white hover:bg-gray-700
                           dark:bg-white dark:text-black dark:hover:bg-gray-100"
              >
                + Nouvelle commande
              </button>
            </div>
          </div>

          {/* Onglets */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
            {[['open', 'En cours', openCount], ['done', 'Terminées', doneCount]].map(([k, label, n]) => (
              <button key={k}
                onClick={() => { setTab(k); setFilterStatut('') }}
                className={`h-9 px-3 -mb-px border-b-2 text-xs font-semibold transition-colors ${tab === k
                  ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-300'}`}>
                {label} <span className="ml-1 font-medium text-gray-400 dark:text-neutral-500">{n}</span>
              </button>
            ))}
          </div>

          {tab === 'done' && (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">
              Les commandes terminées restent affichées {ORDER_VISIBLE_DAYS} jours. Ensuite, les données du client sont effacées (RGPD)
              et la commande ne sert plus qu'aux statistiques.
            </p>
          )}

          {/* Compteurs cliquables = filtres */}
          <div className={`grid gap-2 sm:gap-3 ${tab === 'open' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
            {statusCards.map(s => (
              <StatCard key={s} status={s} value={counts[s]} active={filterStatut === s}
                onClick={() => setFilterStatut(v => v === s ? '' : s)} />
            ))}
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="Input h-8 sm:!w-72 text-xs"
              placeholder="Rechercher : client, téléphone, n°, référence, fournisseur…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {creators.length > 0 && (
              <select className="Input h-8 text-xs flex-1 sm:flex-none sm:!w-44" value={filterCreator} onChange={e => setFilterCreator(e.target.value)}>
                <option value="">Tous les vendeurs</option>
                {creators.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {alertKey && (
              <button onClick={clearAlertFilter} title="Retirer le filtre"
                className="h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors
                           text-red-700 border-red-200 bg-red-50 hover:bg-red-100
                           dark:text-red-300 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/20">
                ⚠ {alertFilter ? alertFilter.label : 'Alerte résolue'} ✕
              </button>
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

          {/* Téléphone : une carte par commande */}
          <div className="md:hidden space-y-2">
            {filtered.map(o => (
              <OrderCard key={o.id} order={o} magasin={isGlobal && !effectiveMagasinId ? magasins[o.magasinId] : null}
                onOpen={() => setActiveId(o.id)} onChangeStatut={s => changeStatut(o, s)} />
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-400 dark:text-neutral-500">
                Aucune commande{hasFilters || alertKey ? ' pour ces filtres' : tab === 'open' ? ' en cours' : ' terminée'}.
              </p>
            )}
          </div>

          {/* Ordinateur : tableau */}
          <div className="hidden md:block rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-800 text-left">
                    <Th>N° commande</Th>
                    <Th>Client</Th>
                    <Th>Produit</Th>
                    <Th>Fournisseur</Th>
                    <Th right>Total TTC / reste</Th>
                    <Th>Statut</Th>
                    <Th>Vendeur</Th>
                    {isGlobal && !effectiveMagasinId && <Th>Magasin</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const status = orderStatus(o)
                    const late = isLateDelivery(o)
                    const reste = remainingToPay(o)
                    return (
                      <tr key={o.id} onClick={() => setActiveId(o.id)}
                        className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors align-top">
                        <td className="px-3 py-2.5 font-mono text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                          {formatOrderNumber(o.numero)}
                          <p className="font-sans text-[11px] text-gray-400 dark:text-neutral-500">{fmtDate(o.createdAt)}</p>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <p className="font-medium text-gray-900 dark:text-white">{o.client || (o.anonymizedAt ? 'Client anonymisé' : '—')}</p>
                          <p className="text-gray-500 dark:text-neutral-400">{o.tel || ''}</p>
                        </td>
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <p className="text-gray-800 dark:text-neutral-200 truncate">
                            {o.type && <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">{ORDER_TYPES[o.type]}</span>}
                            {o.produit || '—'}
                          </p>
                          {o.ref_produit && <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400 truncate">{o.ref_produit}</p>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <p className="text-gray-700 dark:text-neutral-300">{o.fournisseur || '—'}</p>
                          {o.refFournisseur && <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-400">{o.refFournisseur}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          <p className="text-gray-700 dark:text-neutral-300">{formatEuro(orderTotal(o))}</p>
                          {parseEuro(o.fraisPort) > 0 && (
                            <p className="text-[11px] text-gray-500 dark:text-neutral-400">dont port {formatEuro(parseEuro(o.fraisPort))}</p>
                          )}
                          {parseEuro(o.acompte) > 0 && (
                            <p className="text-[11px] text-gray-500 dark:text-neutral-400">acompte {formatEuro(parseEuro(o.acompte))} · reste {formatEuro(reste)}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <StatusSelect value={status} onChange={s => changeStatut(o, s)} />
                          <p className={`mt-0.5 text-[11px] ${late ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-neutral-500'}`}>
                            {late ? `⚠ réception prévue le ${fmtYmd(o.dateReceptionPrevue)}` : sinceLabel(orderStatusSince(o))}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{o.createur || '—'}</td>
                        {isGlobal && !effectiveMagasinId && (
                          <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{magasins[o.magasinId] || '—'}</td>
                        )}
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-400 dark:text-neutral-500">
                        Aucune commande{hasFilters || alertKey ? ' pour ces filtres' : tab === 'open' ? ' en cours' : ' terminée'}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {activeOrder && (
        <OrderModal
          order={activeOrder}
          staff={staff}
          canDelete={canDelete}
          onClose={() => setActiveId(null)}
          onChangeStatut={s => changeStatut(activeOrder, s)}
          onSaveFields={f => saveFields(activeOrder, f)}
          onAddNote={(author, text) => addNote(activeOrder, author, text)}
          onDelete={() => remove(activeOrder)}
          onCopy={showToast}
        />
      )}

      {showForm && (
        <OrderForm staff={staff} onSubmit={createOrder} onClose={() => setShowForm(false)} />
      )}

      {showStats && (
        <OrderStatsModal orders={orders} magasinNom={magasinNom} onClose={() => setShowStats(false)} />
      )}

      {showAlerts && effectiveMagasinId && (
        <AlertSettingsModal ruleSet={ORDER_ALERTS} magasinId={effectiveMagasinId} magasinNom={magasinNom}
          items={orders} onClose={() => setShowAlerts(false)} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999]
                        flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border
                        bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium
                        dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}

/* ── Fiche commande ────────────────────────────────────────────────────────── */
function OrderModal({ order, staff, canDelete, onClose, onChangeStatut, onSaveFields, onAddNote, onDelete, onCopy }) {
  const overlayRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [fields, setFields]   = useState(() => fieldsOf(order))
  const [saving, setSaving]   = useState(false)
  const [tried, setTried]     = useState(false)
  const [noteAuthor, setNoteAuthor] = useState('')
  const [noteText, setNoteText]     = useState('')
  const [noteError, setNoteError]   = useState(false)

  const status = orderStatus(order)
  const meta = ORDER_STATUS_META[status]
  const next = NEXT_STEP[status]
  const total = orderTotal(order)
  const port = parseEuro(order.fraisPort)
  const reste = remainingToPay(order)
  const anonymized = !!order.anonymizedAt
  const errors = orderFormErrors(fields)

  useEffect(() => { if (!editing) setFields(fieldsOf(order)) }, [order, editing])
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  async function save() {
    setTried(true)
    if (Object.keys(errors).length) return
    setSaving(true)
    try { await onSaveFields(fields); setEditing(false); setTried(false) } finally { setSaving(false) }
  }

  function cancelEdit() { setFields(fieldsOf(order)); setEditing(false); setTried(false) }

  async function submitNote(e) {
    e.preventDefault()
    if (!noteText.trim()) return
    if (!noteAuthor) { setNoteError(true); return }
    await onAddNote(noteAuthor, noteText.trim())
    setNoteText('')
  }

  async function copyInfo() {
    const lines = [
      `Commande : ${formatOrderNumber(order.numero)}`,
      `Client : ${order.client || '—'}`,
      `Téléphone : ${order.tel || '—'}`,
      `Produit : ${[order.type && ORDER_TYPES[order.type], order.produit].filter(Boolean).join(' · ') || '—'}`,
      `Réf. produit : ${order.ref_produit || '—'}`,
      `Fournisseur : ${order.fournisseur || '—'}${order.refFournisseur ? ` (n° ${order.refFournisseur})` : ''}`,
      `Réception prévue : ${fmtYmd(order.dateReceptionPrevue)}`,
      `Prix de vente TTC : ${formatEuro(parseEuro(order.prix))}`,
      port ? `Frais de port : ${formatEuro(port)}` : null,
      port ? `Total TTC : ${formatEuro(total)}` : null,
      parseEuro(order.acompte) ? `Acompte : ${formatEuro(parseEuro(order.acompte))} · reste ${formatEuro(reste)}` : null,
      `Statut : ${meta.label}`,
      `Vendeur : ${order.createur || '—'}`,
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(lines)
    onCopy?.('Informations copiées dans le presse-papier')
  }

  const notes = (order.notes || []).slice().sort((a, b) => (a.at || '').localeCompare(b.at || ''))
  const history = (order.history || []).slice().reverse()

  return (
    <div ref={overlayRef} onClick={e => { if (e.target === overlayRef.current && !editing) onClose() }}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-3 sm:p-4 sm:pt-[5vh] overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">

        {/* Header : numéro et statut, client en dessous ; actions à droite */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400 dark:text-neutral-500">{formatOrderNumber(order.numero)}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
              </span>
            </div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white break-words">{order.client || (anonymized ? 'Client anonymisé' : '—')}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && !anonymized && <SmallBtn onClick={() => setEditing(true)}>Modifier</SmallBtn>}
            <IconBtn title="Copier les infos" onClick={copyInfo}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </IconBtn>
            {canDelete && (
              <IconBtn title="Supprimer" danger onClick={onDelete}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
              </IconBtn>
            )}
            <IconBtn title="Fermer" onClick={onClose}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </IconBtn>
          </div>
        </div>

        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">

          {/* Parcours de la commande */}
          {!editing && (
            <MCard title="Suivi">
              <div className="flex flex-wrap gap-1.5">
                {ORDER_STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => onChangeStatut(s)} disabled={s === status} title={ORDER_STATUS_META[s].hint}
                    className={`h-8 sm:h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors border ${s === status
                      ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800'}`}>
                    {ORDER_STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                <p className="text-xs text-gray-500 dark:text-neutral-400">
                  {meta.hint} · {sinceLabel(orderStatusSince(order))}
                  {isLateDelivery(order) && <span className="text-red-600 dark:text-red-400"> · ⚠ réception prévue le {fmtYmd(order.dateReceptionPrevue)}</span>}
                </p>
                {next && (
                  <button type="button" onClick={() => onChangeStatut(next.to)}
                    className="h-9 sm:h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                    {next.label} →
                  </button>
                )}
              </div>
            </MCard>
          )}

          {editing ? (
            <OrderFields fields={fields} setFields={setFields} staff={staff} errors={tried ? errors : {}} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <MCard title="Client">
                <MGrid>
                  <MField label="Nom"><MVal>{order.client}</MVal></MField>
                  <MField label="Téléphone">
                    {order.tel ? <a href={`tel:${order.tel.replace(/\s/g, '')}`} className="text-sm text-gray-900 dark:text-white underline underline-offset-2">{order.tel}</a> : <MVal />}
                  </MField>
                </MGrid>
              </MCard>
              <MCard title="Paiement">
                <MGrid>
                  <MField label="Prix de vente TTC"><MVal>{formatEuro(parseEuro(order.prix))}</MVal></MField>
                  <MField label="Frais de port"><MVal>{port ? formatEuro(port) : 'Aucun'}</MVal></MField>
                  <MField label="Total TTC"><p className="text-sm font-semibold text-gray-900 dark:text-white">{formatEuro(total)}</p></MField>
                  <MField label="Acompte"><MVal>{parseEuro(order.acompte) ? formatEuro(parseEuro(order.acompte)) : 'Aucun'}</MVal></MField>
                  <MField label="Reste à payer" span2><p className="text-sm font-semibold text-gray-900 dark:text-white">{formatEuro(reste)}</p></MField>
                </MGrid>
              </MCard>
              <MCard title="Produit">
                <MGrid>
                  <MField label="Type"><MVal>{ORDER_TYPES[order.type]}</MVal></MField>
                  <MField label="Référence"><MVal mono>{order.ref_produit}</MVal></MField>
                  <MField label="Désignation" span2><MVal>{order.produit}</MVal></MField>
                </MGrid>
              </MCard>
              <MCard title="Fournisseur">
                <MGrid>
                  <MField label="Fournisseur"><MVal>{order.fournisseur}</MVal></MField>
                  <MField label="N° de commande"><MVal mono>{order.refFournisseur}</MVal></MField>
                  <MField label="Réception prévue"><MVal>{order.dateReceptionPrevue ? fmtYmd(order.dateReceptionPrevue) : null}</MVal></MField>
                  <MField label="Vendeur"><MVal>{order.createur}</MVal></MField>
                </MGrid>
              </MCard>
            </div>
          )}

          {/* Notes */}
          {!editing && (
            <MCard title="Notes">
              <div className="space-y-2.5 mb-3 max-h-48 overflow-y-auto">
                {notes.length === 0 && !order.commentaire && <p className="text-xs text-gray-400 dark:text-neutral-500">Aucune note.</p>}
                {order.commentaire && (
                  <p className="text-sm text-gray-800 dark:text-neutral-200 whitespace-pre-wrap">{order.commentaire}</p>
                )}
                {notes.map((n, i) => (
                  <div key={i}>
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                      <span className="font-semibold text-gray-600 dark:text-neutral-300">{n.author}</span> · {fmtDate(n.at)}
                    </p>
                    <p className="text-sm text-gray-800 dark:text-neutral-200 whitespace-pre-wrap break-words">{n.text}</p>
                  </div>
                ))}
              </div>
              {!anonymized && (
                <form onSubmit={submitNote} className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={noteAuthor} onChange={e => { setNoteAuthor(e.target.value); setNoteError(false) }}
                      className={`Input h-9 sm:!w-36 text-xs shrink-0 ${noteError ? '!border-red-400' : ''}`}>
                      <option value="">— Auteur</option>
                      {staff.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                    </select>
                    <div className="flex gap-2 flex-1 min-w-0">
                      <input className="Input h-9 text-sm min-w-0" placeholder="Ajouter une note…" value={noteText} onChange={e => setNoteText(e.target.value)} />
                      <SmallBtn primary type="submit" disabled={!noteText.trim()}>Ajouter</SmallBtn>
                    </div>
                  </div>
                  {noteError && <p className="text-xs text-red-500 dark:text-red-400">Choisis le vendeur qui écrit la note.</p>}
                </form>
              )}
            </MCard>
          )}

          {/* Historique */}
          {!editing && (
            <MCard title="Historique">
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800 sm:divide-y-0">
                {history.length === 0 && <p className="text-xs text-gray-400 dark:text-neutral-500">Créée le {fmtDate(order.createdAt)}.</p>}
                {history.map((h, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:gap-2 text-xs py-1.5 sm:py-1">
                    <span className="text-gray-400 dark:text-neutral-500 shrink-0 sm:w-36">
                      {toDate(h.at)?.toLocaleString('fr-FR') || '—'}<span className="sm:hidden"> · {h.by}</span>
                    </span>
                    <span className="text-gray-700 dark:text-neutral-300">{h.note}</span>
                    <span className="hidden sm:block text-gray-400 dark:text-neutral-500 ml-auto shrink-0">{h.by}</span>
                  </div>
                ))}
              </div>
            </MCard>
          )}
        </div>

        {/* Modification : actions en bas, toujours visibles */}
        {editing && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t rounded-b-2xl border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {tried && Object.keys(errors).length > 0 && <p className="text-xs text-red-600 dark:text-red-400 mr-auto">Corrige les champs en rouge.</p>}
            <SmallBtn onClick={cancelEdit}>Annuler</SmallBtn>
            <SmallBtn primary onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</SmallBtn>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Formulaire de création ───────────────────────────────────────────────── */
function OrderForm({ staff, onSubmit, onClose }) {
  const [fields, setFields]   = useState(EMPTY_FIELDS)
  const [statut, setStatut]   = useState('a-commander')
  const [note, setNote]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tried, setTried]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const errors = orderFormErrors(fields, { requireCreateur: staff.length > 0 })
  const invalid = Object.keys(errors).length > 0

  async function submit(e) {
    e.preventDefault()
    setTried(true)
    if (invalid) return
    setSubmitting(true); setError('')
    try { await onSubmit(fields, statut, note.trim()) }
    catch (err) { setError(err.message || 'Création impossible') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-3 sm:p-4 sm:pt-[5vh] overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Nouvelle commande client</h2>
          <IconBtn title="Fermer" onClick={onClose}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></IconBtn>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
            <OrderFields fields={fields} setFields={setFields} staff={staff} errors={tried ? errors : {}} autoFocus />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <MCard title="Où en est la commande ?">
                <div className="flex flex-col gap-2">
                  {['a-commander', 'commandee'].map(s => (
                    <label key={s} className="flex items-start gap-2 text-sm text-gray-800 dark:text-neutral-200 cursor-pointer">
                      <input type="radio" name="statut" className="mt-1" checked={statut === s} onChange={() => setStatut(s)} />
                      <span>{ORDER_STATUS_META[s].label}<span className="block text-xs text-gray-500 dark:text-neutral-400">{ORDER_STATUS_META[s].hint}</span></span>
                    </label>
                  ))}
                </div>
              </MCard>
              <MCard title="Note (facultative)">
                <textarea rows={3} className="Input text-sm" placeholder="Taille, couleur, précisions…" value={note} onChange={e => setNote(e.target.value)} />
              </MCard>
            </div>
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t rounded-b-2xl border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {error && <p className="text-xs text-red-600 dark:text-red-400 w-full sm:w-auto sm:mr-auto">{error}</p>}
            {!error && (
              <p className={`text-xs w-full sm:w-auto sm:mr-auto ${tried && invalid ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-neutral-500'}`}>
                {tried && invalid ? 'Corrige les champs en rouge.' : 'Client, désignation, prix de vente et vendeur sont obligatoires.'}
              </p>
            )}
            <SmallBtn onClick={onClose}>Annuler</SmallBtn>
            <SmallBtn primary type="submit" disabled={submitting}>{submitting ? 'Création…' : 'Créer la commande'}</SmallBtn>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Champs d'une commande (création et modification) ─────────────────────── */
function OrderFields({ fields, setFields, staff, errors = {}, autoFocus = false }) {
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }))
  const total = orderTotal(fields)
  const reste = remainingToPay(fields)
  const port = parseEuro(fields.fraisPort)
  const bad = k => (errors[k] ? INVALID : '')
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <MCard title="Client">
        <MGrid>
          <FField label="Nom du client" required wide error={errors.client}>
            <input className={`Input ${bad('client')}`} value={fields.client} onChange={e => set('client', e.target.value)} autoFocus={autoFocus} autoComplete="off" />
          </FField>
          <FField label="Téléphone" wide>
            <input className="Input" type="tel" inputMode="tel" value={fields.tel} onChange={e => set('tel', e.target.value)} autoComplete="off" />
          </FField>
        </MGrid>
      </MCard>

      <MCard title="Paiement">
        <MGrid>
          <FField label="Prix de vente TTC (€)" required error={errors.prix}>
            <input className={`Input ${bad('prix')}`} inputMode="decimal" placeholder="0,00" value={fields.prix ?? ''} onChange={e => set('prix', e.target.value)} />
          </FField>
          <FField label="Frais de port (€)" error={errors.fraisPort}>
            <input className={`Input ${bad('fraisPort')}`} inputMode="decimal" placeholder="Aucun" value={fields.fraisPort ?? ''} onChange={e => set('fraisPort', e.target.value)} />
          </FField>
          <FField label="Acompte versé (€)" error={errors.acompte}>
            <input className={`Input ${bad('acompte')}`} inputMode="decimal" placeholder="Aucun" value={fields.acompte ?? ''} onChange={e => set('acompte', e.target.value)} />
          </FField>
          {/* Calculé automatiquement */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Total TTC</span>
            <p className="h-[42px] flex items-center px-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
              {total != null ? formatEuro(total) : '—'}
            </p>
          </div>
          <p className="col-span-full text-xs text-gray-500 dark:text-neutral-400">
            {total == null
              ? 'Renseigne le prix de vente : le total et le reste à payer se calculent tout seuls.'
              : <>
                  {port ? `${formatEuro(parseEuro(fields.prix))} + ${formatEuro(port)} de port · ` : ''}
                  Reste à payer : <span className="font-semibold text-gray-900 dark:text-white">{formatEuro(reste)}</span>
                </>}
          </p>
        </MGrid>
      </MCard>

      <MCard title="Produit">
        <MGrid>
          <FField label="Type">
            <select className="Input" value={fields.type || ''} onChange={e => set('type', e.target.value)}>
              {Object.entries(ORDER_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </FField>
          <FField label="Référence">
            <input className="Input font-mono" value={fields.ref_produit} onChange={e => set('ref_produit', e.target.value)} />
          </FField>
          <FField label="Désignation" required span2 error={errors.produit}>
            <input className={`Input ${bad('produit')}`} placeholder="Nom complet du produit" value={fields.produit} onChange={e => set('produit', e.target.value)} />
          </FField>
        </MGrid>
      </MCard>

      <MCard title="Fournisseur">
        <MGrid>
          <FField label="Fournisseur" wide>
            <input className="Input" value={fields.fournisseur} onChange={e => set('fournisseur', e.target.value)} />
          </FField>
          <FField label="N° de commande fournisseur" wide>
            <input className="Input font-mono" value={fields.refFournisseur} onChange={e => set('refFournisseur', e.target.value)} />
          </FField>
          <FField label="Réception prévue" wide>
            <input type="date" className="Input" value={fields.dateReceptionPrevue || ''} onChange={e => set('dateReceptionPrevue', e.target.value)} />
          </FField>
          <FField label="Vendeur" required={staff.length > 0} wide error={errors.createur}>
            {staff.length > 0 ? (
              <select className={`Input ${bad('createur')}`} value={fields.createur || ''} onChange={e => set('createur', e.target.value)}>
                <option value="">— Sélectionner</option>
                {staff.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}
                {fields.createur && !staff.some(u => u.nom === fields.createur) && <option value={fields.createur}>{fields.createur}</option>}
              </select>
            ) : (
              <input className="Input" value={fields.createur || ''} onChange={e => set('createur', e.target.value)} />
            )}
          </FField>
        </MGrid>
      </MCard>
    </div>
  )
}

/* ── Composants UI ────────────────────────────────────────────────────────── */
const INVALID = '!border-red-400 dark:!border-red-500/70'

// Téléphone : carte d'une commande (le statut se change directement)
function OrderCard({ order: o, magasin, onOpen, onChangeStatut }) {
  const late = isLateDelivery(o)
  const total = orderTotal(o)
  const reste = remainingToPay(o)
  const acompte = parseEuro(o.acompte)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 space-y-2 cursor-pointer active:bg-gray-50 dark:active:bg-neutral-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{o.client || (o.anonymizedAt ? 'Client anonymisé' : '—')}</p>
          <p className="text-[11px] text-gray-400 dark:text-neutral-500">
            <span className="font-mono">{formatOrderNumber(o.numero)}</span> · {fmtDate(o.createdAt)}{o.createur ? ` · ${o.createur}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{formatEuro(total)}</p>
          {acompte > 0 && <p className="text-[11px] text-gray-500 dark:text-neutral-400">reste {formatEuro(reste)}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-700 dark:text-neutral-300 line-clamp-2 break-words">
        {o.type && <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">{ORDER_TYPES[o.type]}</span>}
        {o.produit || '—'}
        {o.fournisseur && <span className="text-gray-400 dark:text-neutral-500"> · {o.fournisseur}</span>}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1" onClick={e => e.stopPropagation()}>
        <StatusSelect value={orderStatus(o)} onChange={onChangeStatut} />
        <span className={`text-[11px] text-right ${late ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-neutral-500'}`}>
          {late ? `⚠ réception prévue le ${fmtYmd(o.dateReceptionPrevue)}` : sinceLabel(orderStatusSince(o))}
          {magasin && <span className="block">{magasin}</span>}
        </span>
      </div>
    </div>
  )
}

function StatCard({ status, value, active, onClick }) {
  const meta = ORDER_STATUS_META[status]
  return (
    <button onClick={onClick} title={active ? 'Retirer le filtre' : `Afficher : ${meta.label}`}
      className={`text-left rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors min-w-0 ${active
        ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white'
        : 'border-gray-200 hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700'} bg-white dark:bg-neutral-900`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide truncate">{meta.label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      <p className="hidden sm:block text-[11px] text-gray-400 dark:text-neutral-500 truncate">{meta.hint}</p>
    </button>
  )
}

function StatusSelect({ value, onChange }) {
  const meta = ORDER_STATUS_META[value]
  return (
    <select value={value} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()}
      className={`rounded-lg border text-xs font-medium px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 ${meta.badge}`}>
      {ORDER_STATUSES.map(s => (
        <option key={s} value={s} className="bg-white dark:bg-neutral-900 text-gray-900 dark:text-white">{ORDER_STATUS_META[s].label}</option>
      ))}
    </select>
  )
}

function SmallBtn({ children, primary = false, type = 'button', ...props }) {
  return (
    <button type={type} {...props}
      className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 ${primary
        ? 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100'
        : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
      {children}
    </button>
  )
}

function IconBtn({ children, title, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={`h-8 w-8 grid place-items-center rounded-lg text-gray-400 transition-colors ${danger
        ? 'hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10'
        : 'hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800'}`}>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{children}</svg>
    </button>
  )
}

function Th({ children, right = false }) {
  return (
    <th className={`px-3 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function MCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  )
}

function MGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-3 sm:gap-x-5 gap-y-3">{children}</div>
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
  return <p className={`text-sm text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{children || '—'}</p>
}

// wide : pleine largeur sur téléphone, demi-largeur ensuite
function FField({ label, children, required = false, span2 = false, wide = false, error }) {
  return (
    <label className={`block space-y-1 min-w-0 ${span2 ? 'col-span-full' : wide ? 'col-span-full sm:col-span-1' : ''}`}>
      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {error && <span className="block text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </label>
  )
}
