import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import KanbanBoard from '../components/KanbanBoard'
import TicketForm from '../components/TicketForm'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import { getNextTicketNumber } from '../lib/getNextTicketNumber'
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, where, doc, updateDoc, deleteDoc
} from 'firebase/firestore'
import { DragDropContext } from '@hello-pangea/dnd'
import TicketModal from '../components/TicketModal'
import { STATUSES, GLOBAL_ROLES, CAN_DELETE_ROLES } from '../lib/constants'
import { useStaff } from '../lib/useStaff'
import { useMagasin } from '../store/useMagasin'

export default function Tickets() {
  const { user, profile } = useAuth((s) => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()

  const isGlobal  = GLOBAL_ROLES.includes(profile?.role)
  const canDelete = CAN_DELETE_ROLES.includes(profile?.role)

  // Magasin effectif : vendeur/directeurmag → leur magasin ; acheteur/directeurgen → sélecteur
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const staff = useStaff(effectiveMagasinId)

  const [showForm, setShowForm]             = useState(false)
  const [tickets, setTickets]               = useState([])
  const [activeTicket, setActiveTicket]     = useState(null)
  const [error, setError]                   = useState('')
  const [q, setQ]                           = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')

  const needle = q.trim().toLowerCase()

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
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })))
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
      updatedAt: serverTimestamp(),
      history: [...(ticket.history || []), {
        at: new Date().toISOString(), by: user.uid, action: 'status', note: `Statut → ${nextStatus}`
      }]
    })
  }

  async function removeTicket() {
    if (!activeTicket || !canDelete) return
    const ok = window.confirm(`Supprimer définitivement le ticket #${activeTicket.ticketNumber || activeTicket.id} ?`)
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'tickets', activeTicket.id))
      setActiveTicket(null)
    } catch (e) {
      console.error('DELETE ERROR', e)
      setError(e.message || 'Suppression impossible')
    }
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
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssigned && t.assignedTo !== filterAssigned) return false
    if (!needle) return true
    const hay = [t.ticketNumber, t.customerName, t.customerPhone, t.customerEmail, t.bikeType, t.bikeBrand, t.bikeModel, t.issueDescription]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(needle)
  })

  const assignedOptions = [...new Set(tickets.map(t => t.assignedTo).filter(Boolean))]
  const hasFilters = q || filterPriority || filterAssigned

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
              {filtered.length}
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
                placeholder="Rechercher…"
                className="h-8 pl-8 pr-3 w-52 rounded-lg border text-sm
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

            <div className="flex-1" />

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
        <TicketForm onSubmit={createTicket} onClose={() => setShowForm(false)} users={staff} />
      )}

      {activeTicket && (
        <TicketModal
          ticket={activeTicket}
          role={profile?.role}
          onClose={() => setActiveTicket(null)}
          onDelete={removeTicket}
          onMoveTo={(status) => moveTo(activeTicket, status)}
          users={staff}
        />
      )}
    </div>
  )
}
