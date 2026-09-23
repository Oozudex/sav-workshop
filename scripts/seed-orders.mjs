#!/usr/bin/env node
/**
 * Seed de l'émulateur : commandes clients à toutes les étapes, dont quelques-unes
 * à l'ancien format (statuts « en-attente / livree », numéros sans année),
 * plus 2 ans d'historique terminé (anonymisé comme en production) pour les statistiques.
 * Usage : node scripts/seed-orders.mjs  (après seed-comptes.mjs ; relançable, remplace son propre jeu)
 */

// Émulateur uniquement : jamais la production
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

initializeApp({ projectId: 'sav-workshop' })
const db = getFirestore()

const DAY = 86400000
const NOW = Date.now()
const ago = d => Timestamp.fromMillis(NOW - d * DAY)
const ymd = offsetDays => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10)

const PRODUITS = [
  ['velo', 'Vélo gravel GRVL 520 taille M', 'GRVL520-M', 1299],
  ['velo', 'VTT électrique E-ST 900 taille L', 'EST900-L', 2499],
  ['piece', 'Dérailleur arrière Shimano Deore 12v', 'RD-M6100', 69.9],
  ['piece', 'Cassette 11-51 12 vitesses', 'CS-M6100', 89],
  ['piece', 'Plaquettes de frein organiques (x2)', 'BP-2201', 19.9],
  ['accessoire', 'Casque route taille M noir', 'HLM-RC500-M', 79],
  ['accessoire', 'Antivol U haute sécurité', 'ULOCK-900', 49.9],
]
const FOURNISSEURS = ['Shimano France', 'Decathlon Pro', 'Cyclelab', 'Trek Bicycle']
const CLIENTS = [['Jean Martin', '06 12 34 56 78'], ['Sophie Leroy', '07 98 76 54 32'], ['Karim Benali', '06 55 44 33 22'],
  ['Lucie Petit', '06 01 02 03 04'], ['Paul Garnier', '07 11 22 33 44']]
const VENDEURS = ['Thomas', 'Julie', 'Karim']

// [statut, jours depuis la création, jours dans le statut, réception prévue (décalage en jours)]
const SCENARIOS = [
  ['a-commander', 1, 1, null],
  ['a-commander', 4, 4, null],           // oubli : alerte « pas encore passée »
  ['commandee', 6, 5, 3],
  ['commandee', 12, 11, -5],             // en retard chez le fournisseur
  ['recue', 9, 0.3, null],
  ['recue', 10, 3, null],                // client pas encore appelé
  ['client-prevenu', 15, 2, null],
  ['client-prevenu', 30, 16, null],      // produit pas retiré
  ['retiree', 40, 20, null],
  ['annulee', 25, 10, null],
]

const previous = await db.collection('orders').where('seed', '==', 'orders').get()
for (let i = 0; i < previous.docs.length; i += 450) {
  const batch = db.batch()
  previous.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref))
  await batch.commit()
}

let n = 900
for (const magasinId of ['mag-1-nord', 'mag-2-sud']) {
  for (const [i, [statut, age, inStatus, reception]] of SCENARIOS.entries()) {
    const [type, produit, ref, prix] = PRODUITS[i % PRODUITS.length]
    const [client, tel] = CLIENTS[i % CLIENTS.length]
    const closed = ['retiree', 'annulee'].includes(statut)
    await db.collection('orders').add({
      seed: 'orders', magasinId,
      numero: `CMD-${new Date().getFullYear()}-${String(++n).padStart(4, '0')}`,
      client, tel, type, produit, ref_produit: ref, prix,
      acompte: type === 'velo' ? Math.round(prix * 0.3) : null,
      fournisseur: FOURNISSEURS[i % FOURNISSEURS.length],
      refFournisseur: statut === 'a-commander' ? null : `FRN-${80000 + n}`,
      dateReceptionPrevue: reception == null ? null : ymd(reception),
      createur: VENDEURS[i % VENDEURS.length],
      statut, statutAt: ago(inStatus), closedAt: closed ? ago(inStatus) : null,
      notes: i % 3 === 0 ? [{ at: new Date(NOW - age * DAY).toISOString(), author: VENDEURS[i % 3], text: 'Taille à confirmer avec le client' }] : [],
      history: [{ at: new Date(NOW - age * DAY).toISOString(), by: 'seed', action: 'create', note: 'Commande créée' }],
      createdAt: ago(age), updatedAt: ago(inStatus), createdBy: 'seed',
    })
  }
}

// Ancien format (avant la refonte des commandes) : doit rester lisible
for (const [statut, numero, age] of [['en-attente', '0007', 3], ['en-cours', '0008', 8], ['livree', '0005', 20]]) {
  await db.collection('orders').add({
    seed: 'orders', magasinId: 'mag-1-nord', numero, client: 'Ancien Client', tel: '0600000000',
    ref_produit: 'OLD-1', produit: 'Pneu 29 x 2.4', prix: 45, date: ymd(-age), statut, createur: 'Thomas',
    commentaire: 'Commande saisie avant la refonte', createdAt: ago(age), updatedAt: ago(age), createdBy: 'seed',
    closedAt: statut === 'livree' ? ago(age) : null,
  })
}

// ── 2 ans d'historique terminé, pour les statistiques ──────────────────────
const between = (min, max) => min + Math.random() * (max - min)
const rand = arr => arr[Math.floor(Math.random() * arr.length)]
const history = []
for (const magasinId of ['mag-1-nord', 'mag-2-sud']) {
  for (let day = 730; day >= 20; day--) {
    const season = [0.5, 0.6, 0.9, 1.2, 1.4, 1.4, 1.3, 1.1, 1.0, 0.8, 0.6, 0.7][new Date(NOW - day * DAY).getMonth()]
    if (Math.random() > 0.35 * season) continue
    const [type, produit, ref, prix] = rand(PRODUITS)
    const created = NOW - day * DAY
    const steps = { commandee: created + between(0.1, 2) * DAY }
    steps.recue = steps.commandee + between(2, type === 'velo' ? 20 : 9) * DAY
    steps['client-prevenu'] = steps.recue + between(0.1, 2) * DAY
    const cancelled = Math.random() < 0.08
    const end = cancelled ? steps.commandee + between(1, 5) * DAY : steps['client-prevenu'] + between(0.5, 12) * DAY
    const statusDates = cancelled
      ? { commandee: Timestamp.fromMillis(steps.commandee), annulee: Timestamp.fromMillis(end) }
      : { ...Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, Timestamp.fromMillis(v)])), retiree: Timestamp.fromMillis(end) }
    const anonymized = NOW - end > 14 * DAY
    history.push({
      seed: 'orders', magasinId, numero: `CMD-${new Date(created).getFullYear()}-${String(++n).padStart(4, '0')}`,
      client: anonymized ? null : rand(CLIENTS)[0], tel: anonymized ? null : rand(CLIENTS)[1],
      type, produit, ref_produit: ref, prix: Math.round(prix * between(0.9, 1.1) * 100) / 100,
      acompte: type === 'velo' && Math.random() < 0.7 ? Math.round(prix * 0.3) : null,
      fournisseur: rand(FOURNISSEURS), refFournisseur: `FRN-${80000 + n}`, createur: rand(VENDEURS),
      statut: cancelled ? 'annulee' : 'retiree', statusDates,
      statutAt: Timestamp.fromMillis(end), closedAt: Timestamp.fromMillis(end), notes: anonymized ? null : [],
      createdAt: Timestamp.fromMillis(created), updatedAt: Timestamp.fromMillis(end), createdBy: 'seed',
      ...(anonymized ? { anonymizedAt: Timestamp.fromMillis(end + 14 * DAY) } : {}),
    })
  }
}
for (let i = 0; i < history.length; i += 450) {
  const batch = db.batch()
  history.slice(i, i + 450).forEach(o => batch.set(db.collection('orders').doc(), o))
  await batch.commit()
}

console.log(`✓ ${SCENARIOS.length * 2 + 3} commandes à toutes les étapes (dont 3 à l'ancien format) + ${history.length} commandes d'historique`)
