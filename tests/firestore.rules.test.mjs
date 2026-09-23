/**
 * Tests des règles Firestore — lancés via `npm run test:rules`
 * (démarre l'émulateur Firestore, exécute ce fichier, puis l'arrête).
 */
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')

let env

// Comptes de test
const USERS = {
  dirgen:     { role: 'directeurgen' },
  acheteur:   { role: 'acheteur', rayons: ['velo'] },
  dirmagA:    { role: 'directeurmag', magasinId: 'A' },
  dirmagNew:  { role: 'directeurmag', magasinId: null },
  veloA:      { role: 'velo', magasinId: 'A' },
  chaussureA: { role: 'chaussure', magasinId: 'A' },
  veloB:      { role: 'velo', magasinId: 'B' },
  inactifA:   { role: 'velo', magasinId: 'A', isActive: false },
}

const as = uid => env.authenticatedContext(uid).firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sav-workshop',
    firestore: { host, port: Number(port), rules: readFileSync(process.env.RULES_FILE || 'firestore.rules', 'utf8') },
  })
})

after(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, 'users', uid), data)
    await setDoc(doc(db, 'magasins', 'A'), { nom: 'Magasin A' })
    await setDoc(doc(db, 'magasins', 'B'), { nom: 'Magasin B' })
    await setDoc(doc(db, 'magasins', 'A', 'rayons', 'r1', 'staff', 's1'), { nom: 'Alice', magasinId: 'A' })
    await setDoc(doc(db, 'magasins', 'B', 'rayons', 'r2', 'staff', 's2'), { nom: 'Bob', magasinId: 'B' })
    await setDoc(doc(db, 'tickets', 'tA'), { magasinId: 'A', status: 'New' })
    await setDoc(doc(db, 'tickets', 'tB'), { magasinId: 'B', status: 'New' })
    await setDoc(doc(db, 'tickets', 'tB', 'comments', 'c1'), { text: 'secret' })
    await setDoc(doc(db, 'b2b_tools', 'tool'), { label: 'Fournisseur', credentialStoreIds: ['A', 'B'] })
    await setDoc(doc(db, 'b2b_tools', 'tool', 'credentials', 'A'), { email: 'a@x.fr', password: 'pwdA' })
    await setDoc(doc(db, 'b2b_tools', 'tool', 'credentials', 'B'), { email: 'b@x.fr', password: 'pwdB' })
    await setDoc(doc(db, 'counters', 'tickets'), { lastNumber: 10, year: 2026 })
    await setDoc(doc(db, 'calendar_events', 'evB'), { magasinId: 'B', date: '2026-01-01', createdBy: 'veloB' })
    await setDoc(doc(db, 'flocage_stock', 'B'), { grande_lettre_blanc: { A: 3 } })
  })
})

describe('users', () => {
  it("un acheteur ne peut pas créer de directeur général", async () => {
    await assertFails(setDoc(doc(as('acheteur'), 'users', 'x'), { role: 'directeurgen' }))
  })
  it("un acheteur ne peut pas modifier son propre rôle", async () => {
    await assertFails(updateDoc(doc(as('acheteur'), 'users', 'acheteur'), { role: 'directeurgen' }))
  })
  it("un acheteur peut créer un compte rayon", async () => {
    await assertSucceeds(setDoc(doc(as('acheteur'), 'users', 'x'), { role: 'velo', magasinId: 'A' }))
  })
  it("le directeur général peut créer un acheteur", async () => {
    await assertSucceeds(setDoc(doc(as('dirgen'), 'users', 'x'), { role: 'acheteur' }))
  })
  it("un directeur de magasin crée un compte rayon dans son magasin uniquement", async () => {
    await assertSucceeds(setDoc(doc(as('dirmagA'), 'users', 'x'), { role: 'textile', magasinId: 'A' }))
    await assertFails(setDoc(doc(as('dirmagA'), 'users', 'y'), { role: 'textile', magasinId: 'B' }))
    await assertFails(setDoc(doc(as('dirmagA'), 'users', 'z'), { role: 'directeurmag', magasinId: 'A' }))
  })
  it("un directeur de magasin ne peut pas changer de magasin", async () => {
    await assertFails(updateDoc(doc(as('dirmagA'), 'users', 'dirmagA'), { magasinId: 'B' }))
  })
  it("un nouveau directeur se rattache uniquement au magasin qu'il a créé", async () => {
    const db = as('dirmagNew')
    await assertSucceeds(setDoc(doc(db, 'magasins', 'C'), { nom: 'C', createdBy: 'dirmagNew' }))
    await assertFails(updateDoc(doc(db, 'users', 'dirmagNew'), { magasinId: 'B' }))
    await assertSucceeds(updateDoc(doc(db, 'users', 'dirmagNew'), { magasinId: 'C' }))
  })
  it("un compte désactivé n'a plus accès aux données de son magasin", async () => {
    await assertFails(getDoc(doc(as('inactifA'), 'tickets', 'tA')))
  })
})

describe('tickets', () => {
  it("un vendeur lit les tickets de son magasin (requête filtrée)", async () => {
    await assertSucceeds(getDocs(query(collection(as('veloA'), 'tickets'), where('magasinId', '==', 'A'))))
  })
  it("un vendeur ne peut pas lister tous les tickets", async () => {
    await assertFails(getDocs(collection(as('veloA'), 'tickets')))
  })
  it("un vendeur ne lit pas un ticket d'un autre magasin", async () => {
    await assertFails(getDoc(doc(as('veloA'), 'tickets', 'tB')))
    await assertFails(getDocs(collection(as('veloA'), 'tickets', 'tB', 'comments')))
  })
  it("un vendeur modifie et supprime les commentaires des tickets de son magasin uniquement", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'tickets', 'tA', 'comments', 'cA'), { text: 'à corriger' })
    })
    await assertSucceeds(updateDoc(doc(as('veloA'), 'tickets', 'tA', 'comments', 'cA'), { text: 'corrigé' }))
    await assertSucceeds(deleteDoc(doc(as('veloA'), 'tickets', 'tA', 'comments', 'cA')))
    await assertFails(updateDoc(doc(as('veloA'), 'tickets', 'tB', 'comments', 'c1'), { text: 'x' }))
    await assertFails(deleteDoc(doc(as('veloA'), 'tickets', 'tB', 'comments', 'c1')))
  })
  it("un vendeur ne peut pas déplacer un ticket vers un autre magasin", async () => {
    await assertFails(updateDoc(doc(as('veloA'), 'tickets', 'tA'), { magasinId: 'B' }))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'tickets', 'tA'), { status: 'InProgress' }))
  })
  it("un compte sans profil ne peut pas créer de ticket", async () => {
    await assertFails(setDoc(doc(as('inconnu'), 'tickets', 'x'), { magasinId: null }))
  })
  it("les globaux voient tout", async () => {
    await assertSucceeds(getDocs(collection(as('acheteur'), 'tickets')))
  })
})

describe('staff', () => {
  it("un vendeur ne peut pas modifier le staff d'un autre magasin", async () => {
    await assertFails(updateDoc(doc(as('veloA'), 'magasins', 'B', 'rayons', 'r2', 'staff', 's2'), { nom: 'X' }))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'magasins', 'A', 'rayons', 'r1', 'staff', 's1'), { nom: 'X' }))
  })
  it("la recherche collectionGroup reste possible", async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as('veloA'), 'staff'), where('magasinId', '==', 'A'))))
  })
})

describe('b2b_tools', () => {
  it("un magasin ne lit que ses propres identifiants", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A')))
    await assertFails(getDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'B')))
    await assertFails(getDocs(collection(as('veloA'), 'b2b_tools', 'tool', 'credentials')))
  })
  it("les globaux gèrent tous les identifiants", async () => {
    await assertSucceeds(getDocs(collection(as('acheteur'), 'b2b_tools', 'tool', 'credentials')))
    await assertFails(setDoc(doc(as('dirmagA'), 'b2b_tools', 'tool', 'credentials', 'A'), { password: 'x' }))
  })
})

describe('counters', () => {
  it("n'accepte qu'un incrément de 1", async () => {
    const ref = doc(as('veloA'), 'counters', 'tickets')
    await assertFails(updateDoc(ref, { lastNumber: 1 }))
    await assertFails(updateDoc(ref, { lastNumber: 11, pirate: true }))
    await assertSucceeds(updateDoc(ref, { lastNumber: 11, year: 2026, updatedAt: serverTimestamp() }))
  })
  it("refuse les compteurs inconnus", async () => {
    await assertFails(setDoc(doc(as('veloA'), 'counters', 'autre'), { lastNumber: 1, year: 2026 }))
  })
})

describe('calendar_events', () => {
  it("un vendeur ne liste pas le calendrier d'un autre magasin", async () => {
    await assertFails(getDocs(query(collection(as('veloA'), 'calendar_events'), where('magasinId', '==', 'B'))))
    await assertSucceeds(getDocs(query(collection(as('veloA'), 'calendar_events'), where('magasinId', '==', 'A'))))
  })
  it("un directeur ne modifie pas un événement d'un autre magasin", async () => {
    await assertFails(updateDoc(doc(as('dirmagA'), 'calendar_events', 'evB'), { title: 'X' }))
  })
  it("un global crée un événement personnel", async () => {
    await assertSucceeds(setDoc(doc(as('acheteur'), 'calendar_events', 'perso'), {
      magasinId: null, createdBy: 'acheteur', date: '2026-01-02',
    }))
  })
  it("impossible de créer un événement au nom de quelqu'un d'autre", async () => {
    await assertFails(setDoc(doc(as('veloA'), 'calendar_events', 'x'), { magasinId: 'A', createdBy: 'veloB' }))
  })
})

describe("seuils d'alerte", () => {
  const settings = { rules: { maxOpen: { enabled: true, threshold: 10 } } }
  it('le directeur règle les seuils de son magasin uniquement', async () => {
    await assertSucceeds(setDoc(doc(as('dirmagA'), 'magasins', 'A', 'alert_settings', 'tickets'), settings))
    await assertFails(setDoc(doc(as('dirmagA'), 'magasins', 'B', 'alert_settings', 'tickets'), settings))
  })
  it('un compte rayon peut lire mais pas modifier', async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'magasins', 'A', 'alert_settings', 'tickets')))
    await assertFails(setDoc(doc(as('veloA'), 'magasins', 'A', 'alert_settings', 'tickets'), settings))
    await assertFails(getDoc(doc(as('veloB'), 'magasins', 'A', 'alert_settings', 'tickets')))
  })
})

describe('flocage / transferts', () => {
  it("le stock flocage d'un autre magasin est protégé", async () => {
    await assertFails(getDoc(doc(as('chaussureA'), 'flocage_stock', 'B')))
    await assertSucceeds(setDoc(doc(as('chaussureA'), 'flocage_stock', 'A'), { x: 1 }))
  })
  it("un vendeur vélo ne crée un transfert que depuis son magasin", async () => {
    const db = as('veloA')
    await assertSucceeds(setDoc(doc(db, 'transferts', 't1'), { fromMagasinId: 'A', toMagasinId: 'B', createdBy: 'veloA' }))
    await assertFails(setDoc(doc(db, 'transferts', 't2'), { fromMagasinId: 'B', toMagasinId: 'A', createdBy: 'veloA' }))
  })
})

describe('collections supprimées', () => {
  it("purchase_requests et notifications ne sont plus accessibles", async () => {
    await assertFails(getDocs(collection(as('veloA'), 'notifications')))
    await assertFails(setDoc(doc(as('veloA'), 'purchase_requests', 'x'), { a: 1 }))
  })
})

describe('accès anonyme', () => {
  it("un visiteur non connecté ne lit rien", async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'magasins', 'A')))
    await assertFails(getDoc(doc(db, 'users', 'veloA')))
  })
})
