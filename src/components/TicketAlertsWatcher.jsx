import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import { computeAlerts } from '../lib/ticketStats'
import { useAuth } from '../store/useAuth'
import { useTicketAlerts } from '../store/useTicketAlerts'

// Recalcul périodique : les seuils de durée évoluent avec le temps, même sans modification
const REFRESH_MS = 5 * 60 * 1000

/**
 * Surveille en continu les tickets en cours du magasin du directeur et les compare
 * à ses seuils d'alerte. Monté une seule fois dans App (pas de rendu visible).
 */
export default function TicketAlertsWatcher() {
  const { role, magasinId } = useAuth(useShallow(s => ({ role: s.profile?.role, magasinId: s.profile?.magasinId })))
  const setAlerts = useTicketAlerts(s => s.setAlerts)
  const active = role === 'directeurmag' && !!magasinId

  const [settings, setSettings] = useState(null)
  const [openTickets, setOpenTickets] = useState([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!active) { setSettings(null); return }
    return onSnapshot(doc(db, 'magasins', magasinId, 'alert_settings', 'tickets'),
      snap => setSettings(snap.exists() ? snap.data().rules || {} : {}),
      () => setSettings({}))
  }, [active, magasinId])

  useEffect(() => {
    if (!active) { setOpenTickets([]); return }
    const q = query(collection(db, 'tickets'), where('magasinId', '==', magasinId), where('status', '!=', 'Closed'))
    return onSnapshot(q, snap => setOpenTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setOpenTickets([]))
  }, [active, magasinId])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(id)
  }, [active])

  useEffect(() => {
    setAlerts(active && settings ? computeAlerts(openTickets, settings, now) : [])
  }, [active, settings, openTickets, now, setAlerts])

  return null
}
