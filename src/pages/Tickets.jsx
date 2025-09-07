import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import KanbanBoard from '../components/KanbanBoard'
import TicketForm from '../components/TicketForm'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import { getNextTicketNumber } from '../lib/getNextTicketNumber'
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc
} from 'firebase/firestore'
import { DragDropContext } from '@hello-pangea/dnd'
import TicketModal from '../components/TicketModal'

const STATUSES = ['New', 'Diagnostic', 'WaitingParts', 'WaitingCustomer', 'InProgress', 'Ready', 'Closed']


export default function Tickets() {
  const { logout, user, profile } = useAuth((s) => ({ logout: s.logout, user: s.user, profile: s.profile }))
  const [showForm, setShowForm] = useState(false)
  const [tickets, setTickets] = useState([])
  const [activeTicket, setActiveTicket] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase();

  useEffect(() => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTickets(list)
    }, err => setError(err.message))
    return () => unsub()
  }, [])

  async function createTicket(payload) {
    setShowForm(false)
    const nextNumber = await getNextTicketNumber()
    const ticket = {
      ...payload,
      status: 'New',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      assignedTo: null,
      ticketNumber: nextNumber,
      history: [{
        at: new Date().toISOString(),
        by: user.uid,
        action: 'create',
        note: 'Ticket créé'
      }]
    }
    await addDoc(collection(db, 'tickets'), ticket)
  }

  async function moveTo(ticket, nextStatus) {
    if (!ticket) return
    if (!STATUSES.includes(nextStatus)) return
    const ref = doc(db, 'tickets', ticket.id)
    await updateDoc(ref, {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      history: [...(ticket.history || []), {
        at: new Date().toISOString(),
        by: user.uid,
        action: 'status',
        note: `Statut → ${nextStatus}`
      }]
    })
  }

  async function removeTicket() {
    if (!activeTicket) return
    if (profile?.role !== 'admin') return
    const ok = window.confirm(`Supprimer définitivement le ticket #${activeTicket.ticketNumber || activeTicket.id} ?`)
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'tickets', activeTicket.id))
      setActiveTicket(null)
    } catch (e) {
      console.error('DELETE ERROR', e)               // <- visible dans la console navigateur
      setError(e.message || 'Suppression impossible')
      setError(e.message || 'Suppression impossible')
    }
  }

  async function handleDragEnd(result) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId) return
    const ticket = tickets.find(t => t.id === draggableId)
    if (!ticket) return
    try {
      await moveTo(ticket, destination.droppableId)
    } catch (e) {
      console.error('Drag update error', e)
      alert('Impossible de changer le statut (permissions ?)')
    }
  }

  const filtered = tickets.filter((t) => {
    if (!needle) return true; // si la barre est vide, on affiche tout

    const hay = [
      t.ticketNumber,
      t.customerName,
      t.customerPhone,
      t.customerEmail,
      t.bikeType,
      t.bikeBrand,
      t.bikeModel,
      t.issueDescription,
    ]
      .filter(Boolean) // enlève null/undefined
      .join(' ')       // <-- CONCATS PROPREMENT
      .toLowerCase();

    return hay.includes(needle);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onLogout={logout} />
      {/* Zone centrale plein écran */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-lg font-semibold">Tickets</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Rechercher (client, vélo, n°, …)"
              className="Input w-full sm:w-72"
            />
            <button className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black"
              onClick={() => setShowForm(true)}>
              Nouveau
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DragDropContext onDragEnd={handleDragEnd}>
            <KanbanBoard tickets={filtered} onOpen={setActiveTicket} />
          </DragDropContext>

        </div>

        {showForm && (
          <TicketForm
            onSubmit={createTicket}
            onClose={() => setShowForm(false)}
          />
        )}

        {activeTicket && (
          <TicketModal
            ticket={activeTicket}
            role={profile?.role}
            onClose={() => setActiveTicket(null)}
            onDelete={removeTicket}
            onMoveTo={(status) => moveTo(activeTicket, status)}  // <- ton moveTo refactor
          />
        )}
      </div>
    </div>
  )
}
