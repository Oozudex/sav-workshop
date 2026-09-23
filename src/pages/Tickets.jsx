import { useEffect, useState } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import KanbanBoard from '../components/KanbanBoard'
import TicketForm from '../components/TicketForm'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import { getNextTicketNumber } from '../lib/counters'
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, where, doc, getDoc, updateDoc, arrayUnion
} from 'firebase/firestore'
import { DragDropContext } from '@hello-pangea/dnd'
import TicketModal from '../components/TicketModal'
import TicketStatsModal from '../components/TicketStatsModal'
import AlertSettingsModal from '../components/AlertSettingsModal'
import { TICKET_ALERTS, closedDateOf } from '../lib/ticketStats'
import { useAlerts } from '../store/useAlerts'
import { STATUSES, GLOBAL_ROLES } from '../lib/constants'
import { useStaff } from '../lib/useStaff'
import { useMagasin } from '../store/useMagasin'

function EasterEgg({ onClose }) {
  const hearts = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3}s`,
    duration: `${3 + Math.random() * 3}s`,
    size: `${1.2 + Math.random() * 2.5}rem`,
  }))

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #ff6b9d 0%, #ff8fab 40%, #ffb3c6 100%)' }}
    >
      {/* Cœurs flottants */}
      {hearts.map(h => (
        <span
          key={h.id}
          className="absolute select-none pointer-events-none"
          style={{
            left: h.left,
            bottom: '-2rem',
            fontSize: h.size,
            animation: `floatUp ${h.duration} ${h.delay} ease-in infinite`,
          }}
        >
          ❤️
        </span>
      ))}

      {/* Message */}
      <div className="relative z-10 text-center px-8 select-none" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
        <p className="text-white/80 text-lg font-semibold mb-2 tracking-widest uppercase">Un petit message pour toi 🚲</p>
        <h1 className="text-white font-black tracking-tight drop-shadow-lg"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)', textShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          Je t'aime Thomas
        </h1>
        <p className="text-white/60 text-sm mt-6 font-medium">Clique n'importe où pour fermer 🤫</p>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) rotate(-10deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { transform: translateY(-110vh) rotate(10deg); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.04); }
        }
      `}</style>
    </div>
  )
}

export default function Tickets() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const { selectedId } = useMagasin()

  const isGlobal  = GLOBAL_ROLES.includes(profile?.role)

  // Magasin effectif : vendeur/directeurmag → leur magasin ; acheteur/directeurgen → sélecteur
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const staff = useStaff(effectiveMagasinId, 'velo')

  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Statistiques et seuils d'alerte : réservés aux directeurs
  const canManage = ['directeurmag', 'directeurgen'].includes(profile?.role)
  const [showStats, setShowStats]   = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [magasinNom, setMagasinNom] = useState('')

  useEffect(() => {
    if (!canManage || !effectiveMagasinId) { setMagasinNom(''); return }
    getDoc(doc(db, 'magasins', effectiveMagasinId))
      .then(snap => setMagasinNom(snap.exists() ? snap.data().nom : ''))
      .catch(() => setMagasinNom(''))
  }, [canManage, effectiveMagasinId])

  // Filtre ouvert depuis la cloche : ?alerte=<clé> n'affiche que les tickets concernés
  const alerts = useAlerts(s => s.alerts).filter(a => a.scope === 'tickets')
  const alertKey = searchParams.get('alerte')
  const alertFilter = alertKey ? alerts.find(a => a.key === alertKey) : null
  function clearAlertFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('alerte')
    setSearchParams(next, { replace: true })
  }

  const [showForm, setShowForm]             = useState(!!location.state?.openForm)
  const [formInitialValues] = useState(location.state?.initialValues || {})
  const [tickets, setTickets]               = useState([])
  const [activeTicket, setActiveTicket]     = useState(null)
  const [error, setError]                   = useState('')
  const [q, setQ]                           = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')

  const needle = q.trim().toLowerCase()
  const compactNeedle = needle.replace(/\s+/g, '')

  useEffect(() => {
    // Attendre que le profil soit chargé
    if (!profile) return
    // Pour vendeur/directeurmag, attendre que le magasinId soit disponible
    if (!isGlobal && !effectiveMagasinId) return

    const base = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'))
    const qRef = effectiveMagasinId
      ? query(base, where('magasinId', '==', effectiveMagasinId))
      : base
    const unsub = onSnapshot(qRef, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTickets(list)
      const openId = searchParams.get('open')
      if (openId) {
        const target = list.find(t => t.id === openId)
        if (target) setActiveTicket(target)
      }
    }, err => setError(err.message))
    return () => unsub()
  }, [effectiveMagasinId, profile, isGlobal])

  async function createTicket(payload) {
    setShowForm(false)
    const nextNumber = await getNextTicketNumber()
    await addDoc(collection(db, 'tickets'), {
      ...payload,
      magasinId: effectiveMagasinId || null,
      status: 'New',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      ticketNumber: nextNumber,
      history: [{ at: new Date().toISOString(), by: user.uid, action: 'create', note: 'Ticket créé' }]
    })
  }

  async function moveTo(ticket, nextStatus) {
    if (!ticket || !STATUSES.includes(nextStatus)) return
    await updateDoc(doc(db, 'tickets', ticket.id), {
      status: nextStatus,
      // Date de clôture : point de départ du délai d'anonymisation RGPD (lib/cleanup.js)
      closedAt: nextStatus === 'Closed' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
      // arrayUnion : n'écrase pas les entrées ajoutées entre-temps (commentaires, suivi…)
      history: arrayUnion({
        at: new Date().toISOString(), by: user.uid, action: 'status', note: `Statut → ${nextStatus}`
      })
    })
  }


  async function handleDragEnd(result) {
    const { source, destination, draggableId } = result
    if (!destination || source.droppableId === destination.droppableId) return
    const ticket = tickets.find(t => t.id === draggableId)
    if (!ticket) return
    try { await moveTo(ticket, destination.droppableId) }
    catch (e) { console.error('Drag error', e) }
  }

  const filtered = tickets.filter(t => {
    // Clôturés depuis plus de 14 jours : réservés aux statistiques (comme après anonymisation)
    if (t.anonymizedAt || (t.status === 'Closed' && Date.now() - (closedDateOf(t)?.getTime() ?? Date.now()) > 14 * 86400000)) return false
    if (alertKey && !alertFilter?.itemIds.includes(t.id)) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssigned && t.assignedTo !== filterAssigned) return false
    if (!needle) return true
    const hay = [t.ticketNumber, t.trackingNumber, t.customerName, t.customerPhone, t.customerEmail, t.bikeType, t.bikeBrand, t.bikeModel, t.issueDescription]
      .filter(Boolean).join(' ').toLowerCase()
    // Les n° de suivi sont souvent recopiés avec ou sans espaces : on compare aussi sans
    return hay.includes(needle) || (compactNeedle.length > 0 && hay.replace(/\s+/g, '').includes(compactNeedle))
  })

  const assignedOptions = [...new Set(tickets.map(t => t.assignedTo).filter(Boolean))]
  const hasFilters = q || filterPriority || filterAssigned

  const easterEgg = q.trim().toLowerCase() === 'ah bah'

  if (easterEgg) return <EasterEgg onClose={() => setQ('')} />

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Toolbar ── */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-neutral-800
                        bg-white/80 dark:bg-neutral-900/80 backdrop-blur">
          <div className="flex items-center gap-3">

            {/* Title */}
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">Tickets</h1>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full
                             bg-gray-100 text-gray-500
                             dark:bg-neutral-800 dark:text-neutral-400">
              {tickets.filter(t => t.status !== 'Closed').length}
            </span>

            <div className="w-px h-4 bg-gray-200 dark:bg-neutral-700 mx-1" />

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-neutral-500 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Rechercher, n° de suivi…"
                className="h-8 pl-8 pr-3 w-60 rounded-lg border text-sm
                           bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400
                           focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-gray-400
                           dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500
                           dark:focus:ring-white/20 dark:focus:border-neutral-500"
              />
            </div>

            {/* Priority segmented */}
            <div className="flex items-center h-8 rounded-lg border divide-x overflow-hidden
                            border-gray-200 divide-gray-200
                            dark:border-neutral-700 dark:divide-neutral-700">
              {[['', 'Tout'], ['Urgent', '⚡ Urgent'], ['Normal', 'Normal']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterPriority(v => v === val ? '' : val)}
                  className={`h-full px-3 text-xs font-medium transition-colors
                    ${filterPriority === val
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Assigned filter */}
            {assignedOptions.length > 0 && (
              <select
                value={filterAssigned}
                onChange={e => setFilterAssigned(e.target.value)}
                className="h-8 px-3 rounded-lg border text-sm
                           bg-white border-gray-200 text-gray-700
                           focus:outline-none focus:ring-2 focus:ring-black/20
                           dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300"
              >
                <option value="">Tous assignés</option>
                {assignedOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={() => { setQ(''); setFilterPriority(''); setFilterAssigned('') }}
                className="h-8 px-2.5 rounded-lg text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100
                           dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                ✕ Effacer
              </button>
            )}

            {/* Filtre d'alerte (depuis la cloche) */}
            {alertKey && (
              <button
                onClick={clearAlertFilter}
                title="Retirer le filtre"
                className="h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors
                           text-red-700 border-red-200 bg-red-50 hover:bg-red-100
                           dark:text-red-300 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/20"
              >
                ⚠ {alertFilter ? alertFilter.label : 'Alerte résolue'} ✕
              </button>
            )}

            <div className="flex-1" />

            {/* Directeurs : statistiques et seuils d'alerte */}
            {canManage && (
              <>
                <button
                  onClick={() => setShowStats(true)}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold transition-colors
                             text-gray-700 border-gray-200 hover:bg-gray-50
                             dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Statistiques
                </button>
                <button
                  onClick={() => setShowAlerts(true)}
                  disabled={!effectiveMagasinId}
                  title={effectiveMagasinId ? "Seuils d'alerte de l'atelier" : 'Sélectionne un magasin pour régler ses alertes'}
                  className="relative h-8 px-3 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50
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
              </>
            )}

            {/* New */}
            <button
              onClick={() => setShowForm(true)}
              className="h-8 px-4 rounded-lg bg-gray-900 text-white text-xs font-semibold
                         hover:bg-gray-700 transition-colors
                         dark:bg-white dark:text-black dark:hover:bg-gray-100"
            >
              + Nouveau ticket
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 text-sm px-3 py-2 rounded-lg border text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">
            {error}
          </div>
        )}

        {/* ── Board ── */}
        <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
          <DragDropContext onDragEnd={handleDragEnd}>
            <KanbanBoard tickets={filtered} onOpen={setActiveTicket} />
          </DragDropContext>
        </div>
      </div>

      {showForm && (
        <TicketForm onSubmit={createTicket} onClose={() => setShowForm(false)} users={staff} initialValues={formInitialValues} />
      )}

      {showStats && (
        <TicketStatsModal tickets={tickets} magasinNom={magasinNom} onClose={() => setShowStats(false)} />
      )}

      {showAlerts && effectiveMagasinId && (
        <AlertSettingsModal ruleSet={TICKET_ALERTS} magasinId={effectiveMagasinId} magasinNom={magasinNom} items={tickets} onClose={() => setShowAlerts(false)} />
      )}

      {activeTicket && (
        <TicketModal
          ticket={tickets.find(t => t.id === activeTicket.id) || activeTicket}
          role={profile?.role}
          onClose={() => setActiveTicket(null)}
          onDelete={() => setActiveTicket(null)}
          onMoveTo={(status) => moveTo(activeTicket, status)}
        />
      )}
    </div>
  )
}
