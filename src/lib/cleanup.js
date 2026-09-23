import { collection, query, where, getDocs, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { ORDER_CLOSED_STATUTS } from './constants'

// RGPD : délai après clôture au-delà duquel les données client sont effacées.
// Le magasin conserve le dossier complet dans son outil principal.
const ANONYMIZE_AFTER_DAYS = 14

// Données personnelles effacées ; le reste (vélo, dates, statuts, description) sert aux statistiques
const TICKET_PERSONAL_FIELDS = ['customerName', 'customerPhone', 'customerEmail', 'serialNumber', 'trackingNumber']
const ORDER_PERSONAL_FIELDS = ['client', 'tel', 'notes', 'commentaire']

// Entrées d'historique conservées : les autres (commentaires, modifications, suivi)
// peuvent contenir des données personnelles dans leur texte
const TICKET_HISTORY_KEPT = ['create', 'status']

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

// Date de clôture ; les documents clôturés avant l'ajout de closedAt retombent sur updatedAt
function closedDate(data) {
  return (data.closedAt ?? data.updatedAt)?.toDate?.()
}

function shouldAnonymize(data, cutoff) {
  const closed = closedDate(data)
  return !data.anonymizedAt && closed && closed <= cutoff
}

// Exécute des écritures par lots (un batch Firestore est limité à 500 écritures)
async function commitInBatches(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db)
    ops.slice(i, i + 450).forEach(op =>
      op.data ? batch.update(op.ref, op.data) : batch.delete(op.ref)
    )
    await batch.commit()
  }
}

function blankFields(fields) {
  return Object.fromEntries(fields.map(f => [f, null]))
}

/**
 * - anonymise les tickets SAV clôturés depuis plus de 14 jours (et supprime leurs commentaires)
 * - anonymise les commandes clients retirées ou annulées depuis plus de 14 jours (nom, téléphone, notes)
 * - supprime les RDV Client du calendrier datant de plus de 1 mois
 * - supprime les infos importantes créées depuis plus de 48h
 *
 * Seul le directeur général a les droits nécessaires sur l'ensemble des magasins :
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

  const ops = []
  const cutoff = daysAgo(ANONYMIZE_AFTER_DAYS)

  // ── 1. Tickets clôturés depuis > 14 jours : anonymisation ───────────────
  const ticketsSnap = await getDocs(
    query(collection(db, 'tickets'), where('status', '==', 'Closed'))
  )
  for (const d of ticketsSnap.docs) {
    const data = d.data()
    if (!shouldAnonymize(data, cutoff)) continue

    const comments = await getDocs(collection(d.ref, 'comments'))
    comments.forEach(c => ops.push({ ref: c.ref }))

    ops.push({
      ref: d.ref,
      data: {
        ...blankFields(TICKET_PERSONAL_FIELDS),
        history: (data.history || []).filter(h => TICKET_HISTORY_KEPT.includes(h.action)),
        anonymizedAt: serverTimestamp(),
      },
    })
  }

  // ── 2. Commandes retirées / annulées depuis > 14 jours : anonymisation ──
  const ordersSnap = await getDocs(
    query(collection(db, 'orders'), where('statut', 'in', ORDER_CLOSED_STATUTS))
  )
  ordersSnap.forEach(d => {
    if (!shouldAnonymize(d.data(), cutoff)) return
    ops.push({ ref: d.ref, data: { ...blankFields(ORDER_PERSONAL_FIELDS), anonymizedAt: serverTimestamp() } })
  })

  // ── 3. RDV Client du calendrier datant de > 1 mois ──────────────────────
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  // On filtre par date uniquement pour éviter un index composite,
  // puis on vérifie le type côté client
  const eventsSnap = await getDocs(
    query(collection(db, 'calendar_events'), where('date', '<', toDateStr(oneMonthAgo)))
  )
  eventsSnap.forEach(d => {
    if (d.data().type === 'rdv_client') ops.push({ ref: d.ref })
  })

  // ── 4. Infos importantes créées depuis > 48h ────────────────────────────
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const infosSnap = await getDocs(
    query(collection(db, 'infos_importantes'), where('createdAt', '<', Timestamp.fromDate(fortyEightHoursAgo)))
  )
  infosSnap.forEach(d => ops.push({ ref: d.ref }))

  await commitInBatches(ops)
}
