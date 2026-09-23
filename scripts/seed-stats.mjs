#!/usr/bin/env node
/**
 * Seed de l'émulateur : 2 ans d'historique de tickets SAV par magasin, pour les statistiques.
 * Usage : node scripts/seed-stats.mjs  (après seed-comptes.mjs ; relançable, remplace son propre jeu)
 *
 * Les tickets suivent un parcours réaliste (attente de pièces, attente client…) ;
 * ceux clôturés depuis plus de 14 jours sont anonymisés comme en production.
 */

// Émulateur uniquement : jamais la production
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

initializeApp({ projectId: 'sav-workshop' })
const db = getFirestore()

const DAY = 86400000
const NOW = Date.now()
const MAGASINS = ['mag-1-nord', 'mag-2-sud']
const TYPES = ['VTT', 'Route', 'Gravel', 'Urbain', 'Enfant', 'Électrique']
const BRANDS = ['Trek', 'Specialized', 'Giant', 'Btwin', 'Rockrider', 'Orbea', 'Cannondale', 'Scott', 'Moustache']
const VENDEURS = ['Thomas', 'Julie', 'Karim']
const PRENOMS = ['Marie', 'Lucas', 'Emma', 'Hugo', 'Léa', 'Louis', 'Chloé', 'Gabriel', 'Manon', 'Arthur']
const NOMS = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefebvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia']
const PROBLEMES = ['Crevaison', 'Freins à régler', 'Révision annuelle', 'Chaîne qui saute', 'Rayon cassé',
  'Batterie qui ne charge plus', 'Dérailleur à régler', 'Jeu de direction', 'Pneus usés', 'Bruit au pédalage']

const rand = arr => arr[Math.floor(Math.random() * arr.length)]
const between = (min, max) => min + Math.random() * (max - min)
const ymd = t => new Date(t).toISOString().slice(0, 10)

// Plus de réparations au printemps et en été ; activité en hausse de ~15 % sur un an
function dailyRate(t) {
  const month = new Date(t).getMonth()
  const season = [0.5, 0.55, 0.8, 1.1, 1.3, 1.4, 1.3, 1.1, 1.0, 0.8, 0.6, 0.5][month]
  const growth = 0.85 + 0.15 * (1 - (NOW - t) / (730 * DAY))
  return 0.9 * season * growth
}

function buildTicket(magasinId, createdAt, n) {
  const history = [{ at: new Date(createdAt).toISOString(), by: 'seed', action: 'create', note: 'Ticket créé' }]
  let t = createdAt
  let status = 'New'
  const step = (next, delayDays) => {
    const at = t + delayDays * DAY
    if (at > NOW) return false
    t = at; status = next
    history.push({ at: new Date(at).toISOString(), by: 'seed', action: 'status', note: `Statut → ${next}` })
    return true
  }

  // Parcours : New → InProgress → (pièces) → (client) → Ready → Closed
  let ok = step('InProgress', between(0.2, 3))
  if (ok && Math.random() < 0.3) ok = step('WaitingParts', between(0.5, 2)) && step('InProgress', between(3, 16))
  if (ok && Math.random() < 0.15) ok = step('WaitingCustomer', between(0.5, 2)) && step('InProgress', between(1, 6))
  if (ok) ok = step('Ready', between(0.5, 4))
  if (ok) step('Closed', between(0.2, 9))

  const closedAt = status === 'Closed' ? t : null
  const prenom = rand(PRENOMS), nom = rand(NOMS)
  const ticket = {
    seed: 'stats',
    ticketNumber: `SAV-${new Date(createdAt).getFullYear()}-${String(5000 + n).padStart(4, '0')}`,
    magasinId, status,
    customerName: `${prenom} ${nom}`,
    customerPhone: `06 ${String(Math.floor(between(10, 99)))} ${String(Math.floor(between(10, 99)))} ${String(Math.floor(between(10, 99)))} ${String(Math.floor(between(10, 99)))}`,
    customerEmail: `${prenom.toLowerCase()}.${nom.toLowerCase()}@exemple.fr`,
    preferredContact: rand(['Téléphone', 'Email']),
    bikeType: rand(TYPES), bikeBrand: rand(BRANDS), bikeModel: null,
    serialNumber: `SN${Math.floor(between(100000, 999999))}`,
    underWarranty: Math.random() < 0.35,
    issueDescription: rand(PROBLEMES), accessoriesLeft: null,
    priority: Math.random() < 0.12 ? 'Urgent' : 'Normal',
    dueDate: ymd(createdAt + Math.round(between(4, 10)) * DAY),
    createdByName: rand(VENDEURS),
    createdAt: Timestamp.fromMillis(createdAt),
    updatedAt: Timestamp.fromMillis(t),
    closedAt: closedAt ? Timestamp.fromMillis(closedAt) : null,
    history,
  }

  // Anonymisation RGPD, comme lib/cleanup.js
  if (closedAt && NOW - closedAt > 14 * DAY) {
    Object.assign(ticket, {
      customerName: null, customerPhone: null, customerEmail: null, serialNumber: null, trackingNumber: null,
      history: history.filter(h => ['create', 'status'].includes(h.action)),
      anonymizedAt: Timestamp.fromMillis(closedAt + 14 * DAY),
    })
  }
  return ticket
}

// Remplace le jeu précédent
const previous = await db.collection('tickets').where('seed', '==', 'stats').get()
for (let i = 0; i < previous.docs.length; i += 450) {
  const batch = db.batch()
  previous.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref))
  await batch.commit()
}

const tickets = []
let n = 0
for (const magasinId of MAGASINS) {
  for (let day = 730; day >= 1; day--) {
    const dayStart = NOW - day * DAY
    const count = Math.round(dailyRate(dayStart) + between(-0.6, 0.6))
    for (let i = 0; i < count; i++) tickets.push(buildTicket(magasinId, dayStart + between(0.35, 0.8) * DAY, n++))
  }
}

for (let i = 0; i < tickets.length; i += 450) {
  const batch = db.batch()
  tickets.slice(i, i + 450).forEach(t => batch.set(db.collection('tickets').doc(), t))
  await batch.commit()
}

const open = tickets.filter(t => t.status !== 'Closed').length
console.log(`✓ ${tickets.length} tickets sur 2 ans (${open} en cours, ${tickets.filter(t => t.anonymizedAt).length} anonymisés)`)
