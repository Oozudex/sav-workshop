#!/usr/bin/env node
/**
 * Seed de l'émulateur : magasins, rayons, personnel et un compte de test par rôle.
 * Usage : node scripts/seed-comptes.mjs  (émulateurs lancés via `npm run emulators`)
 * Relançable à volonté : les comptes et documents sont recréés à l'identique.
 */

// Émulateur uniquement : ces variables empêchent tout accès à la production
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({ projectId: 'sav-workshop' })
const auth = getAuth()
const db = getFirestore()

const PASSWORD = 'Test1234!'

const MAGASINS = [
  { id: 'mag-1-nord', nom: 'Magasin Nord' },
  { id: 'mag-2-sud', nom: 'Magasin Sud' },
]
const RAYONS = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse']
const RAYON_NOMS = { velo: 'Vélo', chaussure: 'Chaussure', textile: 'Textile', randonnee: 'Randonnée', caisse: 'Caisse' }
// Prénoms distincts par rayon pour vérifier facilement les filtres des dropdowns
const VENDEURS = {
  velo: [['Thomas', 'vendeur'], ['Julie', 'vendeur'], ['Karim', 'responsable']],
  chaussure: [['Léa', 'vendeur'], ['Hugo', 'responsable']],
  textile: [['Chloé', 'vendeur'], ['Nathan', 'responsable']],
  randonnee: [['Inès', 'vendeur'], ['Louis', 'responsable']],
  caisse: [['Sarah', 'vendeur'], ['Mehdi', 'responsable']],
}

// Comptes globaux et directeurs ; les comptes rayon sont générés plus bas
const COMPTES = [
  { uid: 'directeurgen', email: 'directeurgen@sav.test', displayName: 'Directeur Général', role: 'directeurgen' },
  { uid: 'acheteur', email: 'acheteur@sav.test', displayName: 'Acheteur Tous rayons', role: 'acheteur', rayons: RAYONS },
  { uid: 'acheteur-velo', email: 'acheteur-velo@sav.test', displayName: 'Acheteur Vélo', role: 'acheteur', rayons: ['velo'] },
  { uid: 'dirmag-nord', email: 'dirmag-nord@sav.test', displayName: 'Directeur Nord', role: 'directeurmag', magasinId: 'mag-1-nord' },
  { uid: 'dirmag-sud', email: 'dirmag-sud@sav.test', displayName: 'Directeur Sud', role: 'directeurmag', magasinId: 'mag-2-sud' },
  { uid: 'dirmag-nouveau', email: 'dirmag-nouveau@sav.test', displayName: 'Directeur sans magasin', role: 'directeurmag', magasinId: null },
]

async function upsertUser({ uid, email, displayName, ...profile }) {
  try { await auth.deleteUser(uid) } catch { /* n'existait pas */ }
  await auth.createUser({ uid, email, displayName, password: PASSWORD })
  await db.doc(`users/${uid}`).set({
    displayName, email, magasinId: null, isActive: true,
    createdAt: FieldValue.serverTimestamp(), createdBy: 'seed',
    ...profile,
  })
}

for (const compte of COMPTES) await upsertUser(compte)

for (const [index, mag] of MAGASINS.entries()) {
  await db.doc(`magasins/${mag.id}`).set({ nom: mag.nom, createdAt: FieldValue.serverTimestamp(), createdBy: 'seed' })

  for (const type of RAYONS) {
    const suffix = mag.id.split('-').at(-1)
    const uid = `${type}-${suffix}`
    const email = `${uid}@sav.test`
    const nom = `Rayon ${RAYON_NOMS[type]} ${suffix[0].toUpperCase()}${suffix.slice(1)}`
    const rayonId = `rayon-${type}`

    await db.doc(`magasins/${mag.id}/rayons/${rayonId}`).set({
      nom, type, email, uid, createdAt: FieldValue.serverTimestamp(), createdBy: 'seed',
    })
    await upsertUser({ uid, email, displayName: nom, role: type, magasinId: mag.id, rayonId })

    for (const [prenom, poste] of VENDEURS[type]) {
      await db.doc(`magasins/${mag.id}/rayons/${rayonId}/staff/${type}-${prenom.toLowerCase()}`).set({
        nom: `${prenom} ${index === 0 ? 'N.' : 'S.'}`, poste, actif: true, magasinId: mag.id, rayonId,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }
}

// Un outil B2B avec des identifiants par magasin (nouveau format sécurisé)
await db.doc('b2b_tools/fournisseur-demo').set({
  label: 'Fournisseur démo', description: 'Portail B2B de test', url: 'https://example.com',
  color: 'blue', featured: true, order: 0, credentialStoreIds: MAGASINS.map(m => m.id),
  createdAt: FieldValue.serverTimestamp(),
})
for (const mag of MAGASINS) {
  await db.doc(`b2b_tools/fournisseur-demo/credentials/${mag.id}`).set({
    email: `${mag.id}@fournisseur.test`, password: `mdp-${mag.id}`, updatedAt: FieldValue.serverTimestamp(),
  })
}

console.log(`✓ ${MAGASINS.length} magasins, ${COMPTES.length + MAGASINS.length * RAYONS.length} comptes (mot de passe : ${PASSWORD})`)
