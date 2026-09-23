import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import { computeAlerts } from '../lib/alerts'
import { ORDER_CLOSED_STATUTS } from '../lib/constants'
import { ORDER_ALERTS } from '../lib/orders'
import { TICKET_ALERTS } from '../lib/ticketStats'
import { useAuth } from '../store/useAuth'
import { useAlerts } from '../store/useAlerts'

// Recalcul périodique : les seuils de durée évoluent avec le temps, même sans modification
const REFRESH_MS = 5 * 60 * 1000

// Réglages d'un jeu de règles (magasins/{id}/alert_settings/{settingsId}) en temps réel
function useAlertSettings(active, magasinId, settingsId) {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    if (!active) { setSettings(null); return }
    return onSnapshot(doc(db, 'magasins', magasinId, 'alert_settings', settingsId),
      snap => setSettings(snap.exists() ? snap.data().rules || {} : {}),
      () => setSettings({}))
  }, [active, magasinId, settingsId])
  return settings
}

// Documents en cours d'une collection du magasin, en temps réel
function useOpenDocs(active, magasinId, collectionName, statusField, closedValues) {
  const [docs, setDocs] = useState([])
  useEffect(() => {
    if (!active) { setDocs([]); return }
    const q = query(collection(db, collectionName), where('magasinId', '==', magasinId), where(statusField, 'not-in', closedValues))
    return onSnapshot(q, snap => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setDocs([]))
    // closedValues est une constante
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, magasinId, collectionName, statusField])
  return docs
}

/**
 * Surveille en continu les tickets et commandes en cours du magasin du directeur
 * et les compare à ses seuils d'alerte. Monté une seule fois dans App (pas de rendu visible).
 */
export default function AlertsWatcher() {
  const { role, magasinId } = useAuth(useShallow(s => ({ role: s.profile?.role, magasinId: s.profile?.magasinId })))
  const setAlerts = useAlerts(s => s.setAlerts)
  const active = role === 'directeurmag' && !!magasinId

  const ticketSettings = useAlertSettings(active, magasinId, TICKET_ALERTS.settingsId)
  const orderSettings = useAlertSettings(active, magasinId, ORDER_ALERTS.settingsId)
  const openTickets = useOpenDocs(active, magasinId, 'tickets', 'status', ['Closed'])
  const openOrders = useOpenDocs(active, magasinId, 'orders', 'statut', ORDER_CLOSED_STATUTS)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(id)
  }, [active])

  useEffect(() => {
    if (!active) { setAlerts([]); return }
    setAlerts([
      ...(ticketSettings ? computeAlerts(openTickets, ticketSettings, TICKET_ALERTS, now) : []),
      ...(orderSettings ? computeAlerts(openOrders, orderSettings, ORDER_ALERTS, now) : []),
    ])
  }, [active, ticketSettings, orderSettings, openTickets, openOrders, now, setAlerts])

  return null
}
