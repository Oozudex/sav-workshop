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
  Timestamp, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')

let env

// Comptes de test
const USERS = {
  admin:      { role: 'admin' },
  dirgen:     { role: 'directeurgen' },
  dirgen2:    { role: 'directeurgen' },
  acheteur:   { role: 'acheteur', rayons: ['velo'] },
  acheteurCycle: { role: 'acheteur', univers: ['CYCLE'] },
  dirmagA:    { role: 'directeurmag', magasinId: 'A' },
  dirmagNew:  { role: 'directeurmag', magasinId: null },
  veloA:      { role: 'velo', magasinId: 'A' },
  chaussureA: { role: 'chaussure', magasinId: 'A' },
  veloB:      { role: 'velo', magasinId: 'B' },
  inactifA:   { role: 'velo', magasinId: 'A', isActive: false },
}

// Connexion il y a une minute (auth_time en secondes), sauf si précisé
const nowSec = () => Math.floor(Date.now() / 1000)
const as = (uid, authTime = nowSec() - 60) => env.authenticatedContext(uid, { auth_time: authTime }).firestore()

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
    await setDoc(doc(db, 'services', 'svc'), { label: 'Upway', credentialStoreIds: ['A', 'B'] })
    await setDoc(doc(db, 'services', 'svc', 'credentials', 'A'), { login: 'a@x.fr', password: 'pwdA' })
    await setDoc(doc(db, 'services', 'svc', 'credentials', 'B'), { login: 'b@x.fr', password: 'pwdB' })
    await setDoc(doc(db, 'counters', 'tickets'), { lastNumber: 10, year: 2026 })
    await setDoc(doc(db, 'calendar_events', 'evB'), { magasinId: 'B', date: '2026-01-01', createdBy: 'veloB' })
    await setDoc(doc(db, 'calendar_events', 'rdvA'), { magasinId: 'A', type: 'rdv_client', date: '2026-01-01', createdBy: 'dirmagA', title: 'Client' })
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
  it("seul un administrateur gère les comptes de direction", async () => {
    await assertFails(setDoc(doc(as('dirgen'), 'users', 'x'), { role: 'directeurgen' }))
    await assertFails(setDoc(doc(as('dirgen'), 'users', 'y'), { role: 'admin' }))
    await assertFails(updateDoc(doc(as('dirgen'), 'users', 'dirgen2'), { displayName: 'X' }))
    await assertFails(updateDoc(doc(as('dirgen'), 'users', 'veloA'), { role: 'admin' }))
    await assertFails(deleteDoc(doc(as('dirgen'), 'users', 'admin')))
    await assertSucceeds(setDoc(doc(as('admin'), 'users', 'x'), { role: 'directeurgen' }))
    await assertSucceeds(setDoc(doc(as('admin'), 'users', 'y'), { role: 'admin' }))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'users', 'dirgen2')))
  })
  it("un administrateur a les droits du directeur général", async () => {
    await assertSucceeds(getDoc(doc(as('admin'), 'tickets', 'tB')))
    await assertSucceeds(getDocs(collection(as('admin'), 'b2b_tools', 'tool', 'credentials')))
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
    await assertSucceeds(setDoc(doc(as('acheteur'), 'b2b_tools', 'tool', 'credentials', 'B'), { email: 'b@x.fr', password: 'neuf' }))
  })
  it("le directeur et les comptes rayon modifient les identifiants de leur magasin, pas ceux des autres", async () => {
    const creds = { email: 'a@x.fr', password: 'nouveau', updatedAt: serverTimestamp(), updatedBy: 'dirmagA', updatedByName: 'Directeur A' }
    await assertSucceeds(setDoc(doc(as('dirmagA'), 'b2b_tools', 'tool', 'credentials', 'A'), creds))
    await assertSucceeds(setDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A'), creds))
    await assertSucceeds(setDoc(doc(as('chaussureA'), 'b2b_tools', 'tool', 'credentials', 'A'), creds))
    await assertFails(setDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'B'), creds))
    await assertFails(setDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A'), { ...creds, autre: 'x' }))
    await assertFails(setDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A'), { email: 'a', password: 'x'.repeat(201) }))
    await assertSucceeds(deleteDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A')))
    await assertFails(deleteDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'B')))
    await assertFails(setDoc(doc(as('inactifA'), 'b2b_tools', 'tool', 'credentials', 'A'), creds))
  })
  it("un magasin ne change que sa présence dans credentialStoreIds", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'b2b_tools', 'tool'), { credentialStoreIds: ['B'] }))
    const db = as('veloA')
    await assertSucceeds(updateDoc(doc(db, 'b2b_tools', 'tool'), { credentialStoreIds: ['B', 'A'] }))
    await assertSucceeds(updateDoc(doc(db, 'b2b_tools', 'tool'), { credentialStoreIds: ['B'] }))
    await assertFails(updateDoc(doc(db, 'b2b_tools', 'tool'), { credentialStoreIds: [] }))
    await assertFails(updateDoc(doc(db, 'b2b_tools', 'tool'), { credentialStoreIds: ['B', 'A'], label: 'Pirate' }))
    await assertFails(updateDoc(doc(db, 'b2b_tools', 'tool'), { label: 'Pirate' }))
  })
  it("outil réservé à d'autres magasins : pas de saisie", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'b2b_tools', 'tool'), { storeIds: ['B'] }))
    await assertFails(setDoc(doc(as('veloA'), 'b2b_tools', 'tool', 'credentials', 'A'), { email: 'a', password: 'b' }))
    await assertFails(updateDoc(doc(as('veloA'), 'b2b_tools', 'tool'), { credentialStoreIds: ['A', 'B'] }))
  })
})

describe('sessions', () => {
  it("une session de plus de 24 h est refusée", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'tickets', 'tA')))
    await assertFails(getDoc(doc(as('veloA', nowSec() - 25 * 3600), 'tickets', 'tA')))
  })
  it("une session ouverte avant la coupure (minuit, mot de passe du rayon changé) est refusée", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'veloA'), { sessionsRevokedAt: Timestamp.fromMillis(Date.now() - 30 * 60000) }))
    await assertFails(getDoc(doc(as('veloA', nowSec() - 3600), 'tickets', 'tA')))
    await assertSucceeds(getDoc(doc(as('veloA', nowSec() - 60), 'tickets', 'tA')))
  })
})

describe('mot de passe temporaire', () => {
  it("le rayon lève lui-même l'obligation de changer de mot de passe, sans toucher au reste de son profil", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'veloA'), { motDePasseTemporaire: true }))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'users', 'veloA'), { motDePasseTemporaire: false }))
    await assertFails(updateDoc(doc(as('veloA'), 'users', 'veloA'), { motDePasseTemporaire: true }))
    await assertFails(updateDoc(doc(as('veloA'), 'users', 'veloA'), { role: 'directeurmag' }))
    await assertFails(updateDoc(doc(as('veloB'), 'users', 'veloA'), { motDePasseTemporaire: false }))
  })
})

describe('todo list', () => {
  it("un rayon gère sa liste, pas celle des autres rayons ni des autres magasins", async () => {
    const t = { magasinId: 'A', rayon: 'velo', titre: 'Ranger la réserve', fait: false }
    await assertSucceeds(setDoc(doc(as('veloA'), 'todos', 't1'), t))
    await assertSucceeds(getDoc(doc(as('veloA'), 'todos', 't1')))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'todos', 't1'), { fait: true }))
    await assertFails(getDoc(doc(as('chaussureA'), 'todos', 't1')))
    await assertFails(getDoc(doc(as('veloB'), 'todos', 't1')))
    await assertFails(setDoc(doc(as('chaussureA'), 'todos', 't2'), t))
    await assertFails(updateDoc(doc(as('veloA'), 'todos', 't1'), { rayon: 'chaussure' }))
  })
  it("le directeur gère toutes les listes de son magasin", async () => {
    await assertSucceeds(setDoc(doc(as('dirmagA'), 'todos', 't3'), { magasinId: 'A', rayon: 'chaussure', titre: 'X' }))
    await assertSucceeds(getDoc(doc(as('dirmagA'), 'todos', 't3')))
    await assertFails(setDoc(doc(as('dirmagA'), 'todos', 't4'), { magasinId: 'B', rayon: 'velo', titre: 'X' }))
  })
  it("une tâche automatique pas encore créée peut être lue (création unique)", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'todos', 'op_debut_x_A_velo')))
  })
  it("requête de la liste d'un rayon", async () => {
    await assertSucceeds(getDocs(query(collection(as('veloA'), 'todos'), where('magasinId', '==', 'A'), where('rayon', '==', 'velo'))))
    await assertFails(getDocs(query(collection(as('veloA'), 'todos'), where('magasinId', '==', 'A'))))
    await assertSucceeds(getDocs(query(collection(as('dirmagA'), 'todos'), where('magasinId', '==', 'A'))))
  })
  it("mot du soir du rayon", async () => {
    const m = { magasinId: 'A', rayon: 'velo', texte: 'Livraison demain 9 h', auteur: 'Thomas' }
    await assertSucceeds(setDoc(doc(as('veloA'), 'mots_du_soir', 'A_velo'), m))
    await assertSucceeds(getDoc(doc(as('veloA'), 'mots_du_soir', 'A_velo')))
    await assertFails(getDoc(doc(as('chaussureA'), 'mots_du_soir', 'A_velo')))
    await assertFails(setDoc(doc(as('chaussureA'), 'mots_du_soir', 'A_velo'), { ...m, rayon: 'chaussure' }))
  })
})

describe('réglages de l\'application', () => {
  it("tout le monde lit le lien de la procédure SAV, seuls les administrateurs le modifient", async () => {
    await assertSucceeds(setDoc(doc(as('admin'), 'app_settings', 'sav'), { procedureUrl: 'https://drive.google.com/x' }))
    await assertSucceeds(getDoc(doc(as('veloA'), 'app_settings', 'sav')))
    await assertSucceeds(setDoc(doc(as('admin'), 'app_settings', 'commandes'), { procedureUrl: 'https://drive.google.com/y' }))
    await assertSucceeds(getDoc(doc(as('veloA'), 'app_settings', 'commandes')))
    await assertFails(setDoc(doc(as('dirgen'), 'app_settings', 'sav'), { procedureUrl: 'https://autre' }))
    await assertFails(setDoc(doc(as('veloA'), 'app_settings', 'sav'), { procedureUrl: 'https://autre' }))
    await assertFails(setDoc(doc(as('admin'), 'app_settings', 'sav'), { procedureUrl: 'https://x', autre: true }))
  })
})

describe('services', () => {
  it("seuls les administrateurs gèrent les services", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'services', 'svc')))
    await assertFails(updateDoc(doc(as('acheteur'), 'services', 'svc'), { label: 'X' }))
    await assertFails(updateDoc(doc(as('dirgen'), 'services', 'svc'), { label: 'X' }))
    await assertSucceeds(updateDoc(doc(as('admin'), 'services', 'svc'), { label: 'X' }))
    await assertSucceeds(setDoc(doc(as('admin'), 'services', 'nouveau'), { label: 'Nouveau' }))
  })
  it("un magasin ne lit que ses propres identifiants", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'services', 'svc', 'credentials', 'A')))
    await assertFails(getDoc(doc(as('veloA'), 'services', 'svc', 'credentials', 'B')))
    await assertFails(getDocs(collection(as('veloA'), 'services', 'svc', 'credentials')))
  })
  it("les globaux lisent tout, seuls les administrateurs écrivent", async () => {
    await assertSucceeds(getDocs(collection(as('acheteur'), 'services', 'svc', 'credentials')))
    await assertFails(setDoc(doc(as('acheteur'), 'services', 'svc', 'credentials', 'A'), { password: 'x' }))
    await assertFails(setDoc(doc(as('dirmagA'), 'services', 'svc', 'credentials', 'A'), { password: 'x' }))
    await assertSucceeds(setDoc(doc(as('admin'), 'services', 'svc', 'credentials', 'A'), { password: 'x' }))
  })
})

describe('obut_catalogue', () => {
  it("seuls les globaux modifient le catalogue", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'obut_catalogue', 'atx')))
    await assertFails(setDoc(doc(as('veloA'), 'obut_catalogue', 'atx'), { label: 'ATX', prix: 1 }))
    await assertFails(setDoc(doc(as('dirmagA'), 'obut_catalogue', 'atx'), { label: 'ATX', prix: 1 }))
    await assertSucceeds(setDoc(doc(as('acheteur'), 'obut_catalogue', 'atx'), { label: 'ATX', prix: 320 }))
    await assertSucceeds(deleteDoc(doc(as('acheteur'), 'obut_catalogue', 'atx')))
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
  it("un rayon pointe un RDV client de son magasin, sans rien modifier d'autre", async () => {
    await assertSucceeds(updateDoc(doc(as('veloA'), 'calendar_events', 'rdvA'), { presence: 'absent', presenceAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as('veloA'), 'calendar_events', 'rdvA'), { presence: 'venu', title: 'Autre' }))
    await assertFails(updateDoc(doc(as('veloB'), 'calendar_events', 'rdvA'), { presence: 'venu' }))
    await assertFails(updateDoc(doc(as('chaussureA'), 'calendar_events', 'evB'), { presence: 'venu' }))
  })
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

describe('opérations commerciales', () => {
  it('les vendeurs lisent les OP et les prix bon plan sans pouvoir les modifier', async () => {
    const db = as('veloA')
    await assertSucceeds(getDocs(collection(db, 'prix_bon_plan')))
    await assertSucceeds(getDocs(collection(db, 'op_commerciales', 'op1', 'produits')))
    await assertFails(setDoc(doc(db, 'prix_bon_plan', '0-123'), { prixBonPlan: 1 }))
    await assertFails(setDoc(doc(db, 'op_commerciales', 'op1', 'produits', 'p1'), { prixOp: 1 }))
  })
  it("l'acheteur gère les OP et les prix bon plan", async () => {
    const db = as('acheteur')
    await assertSucceeds(setDoc(doc(db, 'prix_bon_plan', '0-123'), { prixBonPlan: 1 }))
    await assertSucceeds(setDoc(doc(db, 'op_commerciales', 'op1', 'produits', 'p1'), { prixOp: 1 }))
  })
  it("l'ancienne collection prix_exclu_team n'est plus accessible", async () => {
    await assertFails(getDocs(collection(as('acheteur'), 'prix_exclu_team')))
  })
})

describe("historique d'impression des ILV", () => {
  const envoi = uid => ({ uid, magasinId: 'A', source: { chrono: '0-1', nom: 'X' }, type: 'normal', duree: 1, oney: null, packChoisi: null, france: true, envoyeAt: serverTimestamp(), imprimeAt: null })
  it("chaque compte crée, lit, marque et supprime seulement ses propres envois", async () => {
    await assertSucceeds(setDoc(doc(as('veloA'), 'ilv_impressions', 'i1'), envoi('veloA')))
    await assertFails(setDoc(doc(as('veloA'), 'ilv_impressions', 'i2'), envoi('chaussureA')))
    await assertSucceeds(getDocs(query(collection(as('veloA'), 'ilv_impressions'), where('uid', '==', 'veloA'))))
    await assertFails(getDocs(query(collection(as('chaussureA'), 'ilv_impressions'), where('uid', '==', 'veloA'))))
    await assertFails(getDoc(doc(as('dirmagA'), 'ilv_impressions', 'i1')))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'ilv_impressions', 'i1'), { imprimeAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as('veloA'), 'ilv_impressions', 'i1'), { type: 'promo' }))
    await assertFails(deleteDoc(doc(as('chaussureA'), 'ilv_impressions', 'i1')))
    await assertSucceeds(deleteDoc(doc(as('veloA'), 'ilv_impressions', 'i1')))
  })
  it("pas de champ inconnu ni d'envoi déjà marqué imprimé", async () => {
    await assertFails(setDoc(doc(as('veloA'), 'ilv_impressions', 'i3'), { ...envoi('veloA'), uid2: 'x' }))
    await assertFails(setDoc(doc(as('veloA'), 'ilv_impressions', 'i4'), { ...envoi('veloA'), imprimeAt: serverTimestamp() }))
  })
})

describe('collections supprimées', () => {
  it("purchase_requests et notifications ne sont plus accessibles", async () => {
    await assertFails(getDocs(collection(as('veloA'), 'notifications')))
    await assertFails(setDoc(doc(as('veloA'), 'purchase_requests', 'x'), { a: 1 }))
  })
})

describe('comptes hors de l’outil', () => {
  it("un compte sans profil (inscription directe) ne lit rien, pas même les OP ni l'annuaire", async () => {
    const db = as('intrus')
    await assertFails(getDocs(collection(db, 'users')))
    await assertFails(getDoc(doc(db, 'users', 'veloA')))
    await assertFails(getDoc(doc(db, 'magasins', 'A')))
    await assertFails(getDocs(collectionGroup(db, 'staff')))
    await assertFails(getDoc(doc(db, 'b2b_tools', 'tool')))
    await assertFails(getDocs(collection(db, 'op_commerciales')))
    await assertFails(getDocs(collection(db, 'catalogue_produits')))
    await assertFails(setDoc(doc(db, 'users', 'intrus'), { role: 'admin' }))
  })
  it("un compte désactivé ne lit plus que sa propre fiche", async () => {
    await assertSucceeds(getDoc(doc(as('inactifA'), 'users', 'inactifA')))
    await assertFails(getDoc(doc(as('inactifA'), 'users', 'veloA')))
    await assertFails(getDoc(doc(as('inactifA'), 'magasins', 'A')))
    await assertFails(getDocs(collection(as('inactifA'), 'op_commerciales')))
  })
  it("un compte actif garde ses accès", async () => {
    await assertSucceeds(getDoc(doc(as('veloA'), 'magasins', 'A')))
    await assertSucceeds(getDocs(collection(as('veloA'), 'op_commerciales')))
    await assertSucceeds(getDoc(doc(as('veloA'), 'users', 'chaussureA')))
  })
})

describe('accès anonyme', () => {
  it("un visiteur non connecté ne lit rien", async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'magasins', 'A')))
    await assertFails(getDoc(doc(db, 'users', 'veloA')))
  })
})

describe('budgets acheteurs', () => {
  const marque = (univers, extra = {}) => ({ univers, segId: 's', nom: 'NIKE', saisie: {}, ...extra })

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users', 'acheteurCycle'), { role: 'acheteur', univers: ['CYCLE'] })
      await setDoc(doc(db, 'budgets', 'b'), { nom: 'BUDGET AH27' })
      await setDoc(doc(db, 'budgets', 'b', 'marques', 'cycle'), marque('CYCLE'))
      await setDoc(doc(db, 'budgets', 'b', 'marques', 'golf'), marque('GOLF'))
    })
  })

  it("acheteurs et direction gèrent les budgets, les univers et les magasins", async () => {
    for (const uid of ['acheteur', 'dirgen', 'admin']) {
      const db = as(uid)
      await assertSucceeds(setDoc(doc(db, 'budget_univers', uid), { nom: 'CYCLE', ordre: 1 }))
      await assertSucceeds(setDoc(doc(db, 'budget_magasins', uid), { nom: 'LAVAL', code: 'LVL2 551/0' }))
      await assertSucceeds(setDoc(doc(db, 'budgets', uid), { nom: 'BUDGET AH27', saison: 'AH', annee: 2027 }))
      await assertSucceeds(updateDoc(doc(db, 'budgets', 'b'), { base: { s: { a: 1 } } }))
      await assertSucceeds(getDocs(collection(db, 'budgets', 'b', 'marques')))
    }
  })
  it("la direction modifie les marques de tous les univers", async () => {
    for (const uid of ['dirgen', 'admin']) {
      const db = as(uid)
      await assertSucceeds(setDoc(doc(db, 'budgets', 'b', 'marques', uid), marque('GOLF')))
      await assertSucceeds(updateDoc(doc(db, 'budgets', 'b', 'marques', 'golf'), { 'saisie.a': 10 }))
      await assertSucceeds(deleteDoc(doc(db, 'budgets', 'b', 'marques', uid)))
    }
  })
  it("un acheteur ne modifie que les marques de ses univers attitrés", async () => {
    const db = as('acheteurCycle')
    await assertSucceeds(setDoc(doc(db, 'budgets', 'b', 'marques', 'n'), marque('CYCLE')))
    await assertSucceeds(updateDoc(doc(db, 'budgets', 'b', 'marques', 'cycle'), { 'saisie.a': 10, nom: 'NIKE Q3' }))
    await assertSucceeds(deleteDoc(doc(db, 'budgets', 'b', 'marques', 'n')))
    await assertFails(setDoc(doc(db, 'budgets', 'b', 'marques', 'x'), marque('GOLF')))
    await assertFails(updateDoc(doc(db, 'budgets', 'b', 'marques', 'golf'), { 'saisie.a': 10 }))
    await assertFails(deleteDoc(doc(db, 'budgets', 'b', 'marques', 'golf')))
    // Déplacer une marque vers un univers non attribué est refusé
    await assertFails(updateDoc(doc(db, 'budgets', 'b', 'marques', 'cycle'), { univers: 'GOLF' }))
    // Sans univers attribué : lecture seule
    await assertFails(updateDoc(doc(as('acheteur'), 'budgets', 'b', 'marques', 'cycle'), { 'saisie.a': 1 }))
  })
  it("la liste des marques : un acheteur gère celles de ses univers, la direction toutes", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'budget_marques', 'golf'), marque('GOLF'))
    })
    const db = as('acheteurCycle')
    await assertSucceeds(getDocs(collection(db, 'budget_marques')))
    await assertSucceeds(setDoc(doc(db, 'budget_marques', 'n'), marque('CYCLE')))
    await assertSucceeds(updateDoc(doc(db, 'budget_marques', 'n'), { nom: 'SHIMANO' }))
    await assertFails(updateDoc(doc(db, 'budget_marques', 'n'), { univers: 'GOLF' }))
    await assertSucceeds(deleteDoc(doc(db, 'budget_marques', 'n')))
    await assertFails(setDoc(doc(db, 'budget_marques', 'x'), marque('GOLF')))
    await assertFails(updateDoc(doc(db, 'budget_marques', 'golf'), { nom: 'PING' }))
    await assertFails(deleteDoc(doc(db, 'budget_marques', 'golf')))
    await assertSucceeds(updateDoc(doc(as('dirgen'), 'budget_marques', 'golf'), { nom: 'PING' }))
    await assertFails(getDocs(collection(as('veloA'), 'budget_marques')))
  })
  it("un acheteur ne peut pas s'attribuer d'univers", async () => {
    await assertFails(updateDoc(doc(as('acheteurCycle'), 'users', 'acheteurCycle'), { univers: ['CYCLE', 'GOLF'] }))
  })
  it("seule la direction supprime un budget", async () => {
    await assertFails(deleteDoc(doc(as('acheteurCycle'), 'budgets', 'b')))
    await assertSucceeds(deleteDoc(doc(as('dirgen'), 'budgets', 'b')))
  })
  it("les magasins et les rayons n'y ont pas accès", async () => {
    for (const uid of ['dirmagA', 'veloA']) {
      const db = as(uid)
      await assertFails(getDoc(doc(db, 'budgets', 'b')))
      await assertFails(getDocs(collection(db, 'budgets', 'b', 'marques')))
      await assertFails(getDocs(collection(db, 'budget_univers')))
      await assertFails(getDocs(collection(db, 'budget_magasins')))
      await assertFails(setDoc(doc(db, 'budgets', 'x'), { nom: 'BUDGET PE27' }))
      await assertFails(updateDoc(doc(db, 'budgets', 'b', 'marques', 'cycle'), { 'saisie.a': 1 }))
    }
  })
})

describe('balises de diagnostic', () => {
  const seed = async (demande = null) => env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'balises', 'b1'), { type: 'Bosch', nom: 'Bosch n° 1', magasinId: 'A', magasinNom: 'Magasin A' })
    if (demande) await setDoc(doc(db, 'balise_transferts', 'd1'), { baliseId: 'b1', fromMagasinId: 'A', toMagasinId: 'B', createdBy: 'veloB', status: demande })
  })
  const nouvelle = (uid, over = {}) => ({ baliseId: 'b1', fromMagasinId: 'A', toMagasinId: 'B', createdBy: uid, status: 'pending', ...over })

  it("l'acheteur cycle et l'admin gèrent les fiches, pas les autres acheteurs ni les magasins", async () => {
    const fiche = { type: 'Shimano', nom: 'E-Tube', magasinId: 'B' }
    await assertSucceeds(setDoc(doc(as('acheteurCycle'), 'balises', 'x'), fiche))
    await assertSucceeds(setDoc(doc(as('admin'), 'balises', 'y'), fiche))
    // Acheteur sans l'univers CYCLE, directeur général (non administrateur) : non
    await assertFails(setDoc(doc(as('acheteur'), 'balises', 'z'), fiche))
    await assertFails(setDoc(doc(as('dirgen'), 'balises', 'z'), fiche))
    await assertFails(deleteDoc(doc(as('acheteur'), 'balises', 'x')))
    await assertSucceeds(deleteDoc(doc(as('acheteurCycle'), 'balises', 'x')))
    await assertFails(setDoc(doc(as('dirmagA'), 'balises', 'z'), fiche))
    await assertFails(setDoc(doc(as('veloA'), 'balises', 'z'), fiche))
  })
  it("un magasin ne modifie pas une fiche ni ne déplace une balise sans demande", async () => {
    await seed()
    await assertFails(updateDoc(doc(as('veloA'), 'balises', 'b1'), { note: 'écran cassé' }))
    await assertFails(updateDoc(doc(as('veloA'), 'balises', 'b1'), { magasinId: 'B' }))
    await assertFails(updateDoc(doc(as('veloB'), 'balises', 'b1'), { magasinId: 'B' }))
    await assertFails(updateDoc(doc(as('acheteur'), 'balises', 'b1'), { note: 'câbles fournis' }))
    await assertSucceeds(updateDoc(doc(as('acheteurCycle'), 'balises', 'b1'), { note: 'câbles fournis' }))
  })
  it("un magasin demande la balise d'un autre, pour lui-même seulement", async () => {
    await seed()
    await assertSucceeds(setDoc(doc(as('veloB'), 'balise_transferts', 'n1'), nouvelle('veloB')))
    await assertFails(setDoc(doc(as('veloA'), 'balise_transferts', 'n2'), nouvelle('veloA')))
    await assertFails(setDoc(doc(as('veloB'), 'balise_transferts', 'n3'), nouvelle('veloB', { fromMagasinId: 'C' })))
    await assertFails(setDoc(doc(as('veloB'), 'balise_transferts', 'n4'), nouvelle('veloB', { status: 'shipped' })))
  })
  it("chacun son étape : A accepte et envoie, B annule ou reçoit", async () => {
    await seed('pending')
    await assertFails(updateDoc(doc(as('veloB'), 'balise_transferts', 'd1'), { status: 'accepted' }))
    await assertFails(updateDoc(doc(as('veloA'), 'balise_transferts', 'd1'), { status: 'shipped' }))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'balise_transferts', 'd1'), { status: 'accepted' }))
    await assertFails(updateDoc(doc(as('veloA'), 'balise_transferts', 'd1'), { status: 'shipped', toMagasinId: 'A' }))
    await assertSucceeds(updateDoc(doc(as('veloA'), 'balise_transferts', 'd1'), { status: 'shipped' }))
    await assertFails(updateDoc(doc(as('veloA'), 'balise_transferts', 'd1'), { status: 'completed' }))
  })
  it("à la réception, B passe la balise chez lui ; sans demande en route, impossible", async () => {
    await seed('shipped')
    const reception = { magasinId: 'B', magasinNom: 'Magasin B', dernierTransfertId: 'd1' }
    await assertFails(updateDoc(doc(as('chaussureA'), 'balises', 'b1'), { ...reception, magasinId: 'A' }))
    await assertSucceeds(updateDoc(doc(as('veloB'), 'balises', 'b1'), reception))
    await assertSucceeds(updateDoc(doc(as('veloB'), 'balise_transferts', 'd1'), { status: 'completed' }))
  })
  it("réception en une seule écriture groupée (balise + demande)", async () => {
    await seed('shipped')
    const db = as('veloB')
    const batch = writeBatch(db)
    batch.update(doc(db, 'balises', 'b1'), { magasinId: 'B', magasinNom: 'Magasin B', dernierTransfertId: 'd1' })
    batch.update(doc(db, 'balise_transferts', 'd1'), { status: 'completed' })
    await assertSucceeds(batch.commit())
  })
  it("demande pas encore envoyée : B ne peut pas prendre la balise", async () => {
    await seed('accepted')
    await assertFails(updateDoc(doc(as('veloB'), 'balises', 'b1'), { magasinId: 'B', dernierTransfertId: 'd1' }))
  })
})
