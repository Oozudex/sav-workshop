import { initializeApp } from 'firebase/app'
import {
  getFirestore, connectFirestoreEmulator,
  collection, getDocs, writeBatch, doc,
} from 'firebase/firestore'

const app = initializeApp({
  apiKey:            'AIzaSyBfBCUIVMMS2xvL5gBV9D33y-3R7QOn3hY',
  authDomain:        'sav-workshop.firebaseapp.com',
  projectId:         'sav-workshop',
  storageBucket:     'sav-workshop.firebasestorage.app',
  messagingSenderId: '45270989042',
  appId:             '1:45270989042:web:65cbabb25d56063e41f86b',
})
const db = getFirestore(app)
connectFirestoreEmulator(db, 'localhost', 8080)

const MODELES = ['CX COU', "TON'R", 'SOLEIL', 'ATX', 'RCC', 'MATCH', 'MATCH IT', 'MATCH +', 'SUPERINOX', 'RCX']
const PRIX = {
  'CX COU': 220, "TON'R": 140, 'SOLEIL': 195, 'ATX': 320,
  'RCC': 220, 'MATCH': 93, 'MATCH IT': 150, 'MATCH +': 180,
  'SUPERINOX': 215, 'RCX': 240,
}
const MARQUAGE = [
  { type: null,        prix: null },
  { type: 'classique', prix: 15 },
  { type: 'classique', prix: 15 },
  { type: 'stylisee',  prix: 19 },
]
const LIVRAISON = 7.10
const NOMS    = ['Martin', 'Bernard', 'Dupont', 'Durand', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'Petit', 'Robert', 'Richard', 'Thomas', 'Leroy']
const PRENOMS = ['Jean', 'Pierre', 'Marie', 'Sophie', 'Luc', 'Emma', 'Paul', 'Claire', 'Marc', 'Julie', 'Nicolas', 'Laura', 'Antoine', 'Camille', 'Julien']
const TEXTES  = ['Famille Martin', 'J.L.', 'Team 34', 'N°7', 'Les Bourdons', 'Club Pétanque 13', 'M.D.', 'R.B.']

// Répartition : 2024 léger, 2025 plus dense, 2026 en cours
const ANNEES_POOL = [
  ...Array(14).fill(2024),
  ...Array(22).fill(2025),
  ...Array(14).fill(2026),
]

const rand    = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pad     = (n) => String(n).padStart(2, '0')

async function seed() {
  const snap = await getDocs(collection(db, 'magasins'))
  const magasins = snap.docs.map(d => ({ id: d.id, nom: d.data().nom }))
  if (!magasins.length) { console.error('Aucun magasin trouvé dans l\'émulateur.'); process.exit(1) }
  console.log(`Magasins : ${magasins.map(m => m.nom).join(', ')}`)

  const records = []

  for (let i = 0; i < 90; i++) {
    const year     = rand(ANNEES_POOL)
    const maxMonth = year === 2026 ? 5 : 12
    const month    = randInt(1, maxMonth)
    const day      = randInt(1, 28)
    const modele   = rand(MODELES)
    const prix     = PRIX[modele]
    const mq       = rand(MARQUAGE)
    const totalTTC = prix + (mq.prix || 0) + LIVRAISON
    const acompte  = Math.random() > 0.35 ? Math.round(totalTTC * 0.3 * 100) / 100 : null

    // Années passées = surtout archivé, 2026 = mix actif
    const statutPool2024 = ['livre', 'livre', 'livre', 'livre', 'annule']
    const statutPool2025 = ['livre', 'livre', 'livre', 'annule']
    const statutPool2026 = ['en_attente', 'commande', 'recu', 'livre', 'livre']
    const pool = year === 2024 ? statutPool2024 : year === 2025 ? statutPool2025 : statutPool2026
    const statut  = rand(pool)
    const archive = statut === 'livre'

    records.push({
      magasinId:    rand(magasins).id,
      clientNom:    archive ? null : rand(NOMS),
      clientPrenom: archive ? null : rand(PRENOMS),
      clientTel:    archive ? null : `06 ${pad(randInt(10,99))} ${pad(randInt(10,99))} ${pad(randInt(10,99))} ${pad(randInt(10,99))}`,
      dateCommande: `${year}-${pad(month)}-${pad(day)}`,
      modele,
      diametre:     `${randInt(70, 74)}.${randInt(0, 9)} mm`,
      strie:        rand(['0', '1', '2', '3']),
      poids:        `${randInt(650, 730)} g`,
      marquageType: mq.type,
      marquage:     mq.type ? rand(TEXTES) : null,
      prixModele:   prix,
      prixMarquage: mq.prix,
      prixLivraison: LIVRAISON,
      totalTTC,
      acompte,
      resteARegler: acompte != null ? Math.round((totalTTC - acompte) * 100) / 100 : null,
      statut,
      etabliePar:   rand(['Rayon Vélo', 'Équipe Vélo']),
      createdBy:    'seed',
      createdAt:    new Date(`${year}-${pad(month)}-${pad(day)}`),
    })
  }

  for (let i = 0; i < records.length; i += 400) {
    const batch = writeBatch(db)
    records.slice(i, i + 400).forEach(r => batch.set(doc(collection(db, 'obut_commandes')), r))
    await batch.commit()
    console.log(`  Batch écrit : ${Math.min(i + 400, records.length)} / ${records.length}`)
  }

  console.log(`\n✅ ${records.length} commandes OBUT créées dans l'émulateur.`)
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
