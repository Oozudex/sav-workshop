import { collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Supprime des références par lots (un batch Firestore est limité à 500 écritures)
async function deleteInBatches(refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref))
    await batch.commit()
  }
}

/**
 * Supprime :
 * - les tickets Clôturés depuis plus de 2 semaines
 * - les RDV Client du calendrier datant de plus de 1 mois
 * - les infos importantes créées depuis plus de 48h
 *
 * Seul le directeur général a les droits de suppression sur l'ensemble des magasins :
 * pour les autres rôles, les règles Firestore refuseraient ces requêtes.
 * Limité à 1 exécution par jour via localStorage.
 *
 * TODO : à terme, remplacer par une Cloud Function planifiée (onSchedule).
 */
export async function runCleanup(role) {
  if (role !== 'directeurgen') return

  const THROTTLE_KEY = 'lastCleanup'
  const lastRun = localStorage.getItem(THROTTLE_KEY)
  if (lastRun && Date.now() - parseInt(lastRun) < 24 * 60 * 60 * 1000) return
  localStorage.setItem(THROTTLE_KEY, String(Date.now()))

  const toDelete = []

  // ── 1. Tickets Closed depuis > 2 semaines ───────────────────────────────
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const ticketsSnap = await getDocs(
    query(collection(db, 'tickets'), where('status', '==', 'Closed'))
  )
  ticketsSnap.forEach(d => {
    const updatedAt = d.data().updatedAt?.toDate?.()
    if (updatedAt && updatedAt <= twoWeeksAgo) toDelete.push(d.ref)
  })

  // ── 2. RDV Client du calendrier datant de > 1 mois ──────────────────────
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  // On filtre par date uniquement pour éviter un index composite,
  // puis on vérifie le type côté client
  const eventsSnap = await getDocs(
    query(collection(db, 'calendar_events'), where('date', '<', toDateStr(oneMonthAgo)))
  )
  eventsSnap.forEach(d => {
    if (d.data().type === 'rdv_client') toDelete.push(d.ref)
  })

  // ── 3. Infos importantes créées depuis > 48h ────────────────────────────
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const infosSnap = await getDocs(
    query(collection(db, 'infos_importantes'), where('createdAt', '<', Timestamp.fromDate(fortyEightHoursAgo)))
  )
  infosSnap.forEach(d => toDelete.push(d.ref))

  await deleteInBatches(toDelete)
}
