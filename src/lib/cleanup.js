import { collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Supprime :
 * - les tickets Clôturés depuis plus de 2 semaines
 * - les RDV Client du calendrier datant de plus de 1 mois
 *
 * Limité à 1 exécution par jour via localStorage.
 */
export async function runCleanup() {
  const THROTTLE_KEY = 'lastCleanup'
  const lastRun = localStorage.getItem(THROTTLE_KEY)
  if (lastRun && Date.now() - parseInt(lastRun) < 24 * 60 * 60 * 1000) return
  localStorage.setItem(THROTTLE_KEY, String(Date.now()))

  const batch = writeBatch(db)
  let count = 0

  // ── 1. Tickets Closed depuis > 2 semaines ───────────────────────────────
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const ticketsSnap = await getDocs(
    query(collection(db, 'tickets'), where('status', '==', 'Closed'))
  )
  ticketsSnap.forEach(d => {
    const updatedAt = d.data().updatedAt?.toDate?.()
    if (updatedAt && updatedAt <= twoWeeksAgo) {
      batch.delete(d.ref)
      count++
    }
  })

  // ── 2. RDV Client du calendrier datant de > 1 mois ──────────────────────
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const oneMonthAgoStr = toDateStr(oneMonthAgo)

  // On filtre par date uniquement pour éviter un index composite,
  // puis on vérifie le type côté client
  const eventsSnap = await getDocs(
    query(collection(db, 'calendar_events'), where('date', '<', oneMonthAgoStr))
  )
  eventsSnap.forEach(d => {
    if (d.data().type === 'rdv_client') {
      batch.delete(d.ref)
      count++
    }
  })

  // ── 3. Infos importantes créées depuis > 48h ────────────────────────────
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const infosSnap = await getDocs(
    query(collection(db, 'infos_importantes'), where('createdAt', '<', Timestamp.fromDate(fortyEightHoursAgo)))
  )
  infosSnap.forEach(d => {
    batch.delete(d.ref)
    count++
  })

  if (count > 0) await batch.commit()
}
