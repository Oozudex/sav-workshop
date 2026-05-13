#!/usr/bin/env node
// Usage: node scripts/seedTransferts.js
// Requiert que l'émulateur Firebase soit lancé (port 8080)

const BASE = 'http://127.0.0.1:8080/v1/projects/sav-workshop/databases/(default)/documents'
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer owner',
}

const MODELES = [
  'SUMMIT 700', 'ROCKRIDER ST 100', 'ROCKRIDER 520 S', 'ROCKRIDER E-ST 500',
  'TRIBAN RC 120', 'TRIBAN RC 500', 'VAN RYSEL EDR CF',
  'ELOPS 120', 'ELOPS 900 E', 'SPEED 500 E', 'BTWIN TREKKING 100',
  'RIVERSIDE 100', 'RIVERSIDE 500', 'RIVERSIDE 900',
  'BTWIN CITY BIKE 500', 'CYCLE BOOST 500 E', 'CROSSRIDER 500',
  'ULTRA 920', 'GRAVEL 520', 'DIRT ROAD 700',
]
const TAILLES  = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '26"', '27.5"', '29"', '700c', '46 cm', '50 cm', '54 cm', '58 cm']
const COULEURS = ['Noir / Rouge', 'Bleu / Gris', 'Vert / Noir', 'Blanc / Bleu', 'Orange / Noir', 'Gris / Anthracite', 'Rouge / Blanc', 'Noir', 'Gris / Noir', 'Jaune / Noir', 'Bleu Marine']
const COMMENTAIRES = ['Client en attente — urgent', 'Modèle vendu ici, rupture stock', 'Transfert demandé par le client directement', 'Prêt pour le week-end', null, null, null, null]
const REPONSES    = ['Vélo disponible, envoi lundi', 'Prêt à être envoyé demain matin', 'Disponible en stock, emballage en cours', 'Ok, expédition ce soir', null, null]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randDate(s, e) { return new Date(s.getTime() + Math.random() * (e.getTime() - s.getTime())) }

function ts(date)  { return { timestampValue: date.toISOString() } }
function str(v)    { return { stringValue: String(v) } }
function int(v)    { return { integerValue: String(Math.floor(v)) } }
function bool(v)   { return { booleanValue: Boolean(v) } }
function nul()     { return { nullValue: 'NULL_VALUE' } }
function maybeStr(v) { return v != null ? str(v) : nul() }

async function apiFetch(path, opts = {}) {
  const resp = await fetch(`${BASE}/${path}`, { headers: HEADERS, ...opts })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`${opts.method || 'GET'} ${path} → ${resp.status}: ${body}`)
  }
  return resp.json()
}

async function getMagasins() {
  const data = await apiFetch('magasins')
  if (!data.documents?.length) throw new Error('Aucun magasin trouvé. Créez des magasins d\'abord.')
  return data.documents.map(doc => ({
    id: doc.name.split('/').pop(),
    nom: doc.fields?.nom?.stringValue || '?',
  }))
}

async function createDoc(col, fields) {
  return apiFetch(col, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
}

async function main() {
  console.log('🚲 Seed transferts — émulateur Firestore')
  console.log('Connexion à http://127.0.0.1:8080...\n')

  const magasins = await getMagasins()
  if (magasins.length < 2) { console.error('❌ Il faut au moins 2 magasins.'); process.exit(1) }
  console.log(`✓ ${magasins.length} magasins : ${magasins.map(m => m.nom).join(', ')}\n`)

  const now = new Date()
  const thisYear = now.getFullYear()
  let count = 0

  function pair() {
    const from = pick(magasins)
    const to   = pick(magasins.filter(m => m.id !== from.id))
    return { from, to }
  }

  // ── Transferts réalisés (2 ans d'historique) ──────────────────────────────
  for (let year = thisYear - 1; year <= thisYear; year++) {
    const maxMonth = year === thisYear ? now.getMonth() : 11
    for (let month = 0; month <= maxMonth; month++) {
      const n = 5 + Math.floor(Math.random() * 11)
      for (let i = 0; i < n; i++) {
        const { from, to } = pair()
        const start = new Date(year, month, 1)
        const end   = new Date(year, month + 1, 0, 23, 59, 59)
        const createdAt   = randDate(start, end)
        const completedAt = new Date(createdAt.getTime() + (1 + Math.random() * 6) * 86400000)
        const respondedAt = new Date(createdAt.getTime() + Math.random() * 86400000)
        const commentaire = pick(COMMENTAIRES)
        const reponse     = pick(REPONSES)
        await createDoc('transferts', {
          modele:             str(pick(MODELES)),
          taille:             str(pick(TAILLES)),
          couleur:            str(pick(COULEURS)),
          codeChrono:         str(`0-${Math.floor(100000 + Math.random() * 900000)}`),
          quantite:           int(Math.random() < 0.85 ? 1 : 2),
          fromMagasinId:      str(from.id),
          fromMagasinNom:     str(from.nom),
          toMagasinId:        str(to.id),
          toMagasinNom:       str(to.nom),
          status:             str('completed'),
          type:               str('velo'),
          createdBy:          str('seed'),
          createdAt:          ts(createdAt),
          completedAt:        ts(completedAt),
          respondedAt:        ts(respondedAt),
          updatedAt:          ts(completedAt),
          readByFrom:         bool(true),
          readByTo:           bool(true),
          commentaire:        maybeStr(commentaire),
          reponseCommentaire: maybeStr(reponse),
          createdByAcheteur:  bool(Math.random() < 0.25),
        })
        count++
        if (count % 30 === 0) process.stdout.write(`  ${count} créés...\r`)
      }
    }
  }
  console.log(`✓ ${count} transferts réalisés créés          `)

  // ── Transferts en attente ────────────────────────────────────────────────
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  for (let i = 0; i < 8; i++) {
    const { from, to } = pair()
    const createdAt = randDate(weekAgo, now)
    const commentaire = pick(COMMENTAIRES)
    await createDoc('transferts', {
      modele:             str(pick(MODELES)),
      taille:             str(pick(TAILLES)),
      couleur:            str(pick(COULEURS)),
      codeChrono:         str(`0-${Math.floor(100000 + Math.random() * 900000)}`),
      quantite:           int(1),
      fromMagasinId:      str(from.id),
      fromMagasinNom:     str(from.nom),
      toMagasinId:        str(to.id),
      toMagasinNom:       str(to.nom),
      status:             str('pending'),
      type:               str('velo'),
      createdBy:          str('seed'),
      createdAt:          ts(createdAt),
      updatedAt:          ts(createdAt),
      readByFrom:         bool(true),
      readByTo:           bool(false),
      commentaire:        maybeStr(commentaire),
      reponseCommentaire: nul(),
      createdByAcheteur:  bool(Math.random() < 0.3),
    })
    count++
  }
  console.log('✓ 8 transferts en attente créés')

  // ── Transferts acceptés (en transit) ─────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const { from, to } = pair()
    const createdAt   = randDate(new Date(now.getTime() - 5 * 86400000), now)
    const respondedAt = new Date(createdAt.getTime() + 12 * 3600000)
    await createDoc('transferts', {
      modele:             str(pick(MODELES)),
      taille:             str(pick(TAILLES)),
      couleur:            str(pick(COULEURS)),
      codeChrono:         str(`0-${Math.floor(100000 + Math.random() * 900000)}`),
      quantite:           int(1),
      fromMagasinId:      str(from.id),
      fromMagasinNom:     str(from.nom),
      toMagasinId:        str(to.id),
      toMagasinNom:       str(to.nom),
      status:             str('accepted'),
      type:               str('velo'),
      createdBy:          str('seed'),
      createdAt:          ts(createdAt),
      respondedAt:        ts(respondedAt),
      updatedAt:          ts(respondedAt),
      readByFrom:         bool(false),
      readByTo:           bool(true),
      commentaire:        nul(),
      reponseCommentaire: str('Vélo prêt, expédition demain matin'),
      createdByAcheteur:  bool(false),
    })
    count++
  }
  console.log('✓ 5 transferts acceptés créés')

  // ── Transferts refusés ────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const { from, to } = pair()
    const createdAt = randDate(new Date(now.getTime() - 10 * 86400000), new Date(now.getTime() - 2 * 86400000))
    await createDoc('transferts', {
      modele:             str(pick(MODELES)),
      taille:             str(pick(TAILLES)),
      couleur:            str(pick(COULEURS)),
      codeChrono:         str(`0-${Math.floor(100000 + Math.random() * 900000)}`),
      quantite:           int(1),
      fromMagasinId:      str(from.id),
      fromMagasinNom:     str(from.nom),
      toMagasinId:        str(to.id),
      toMagasinNom:       str(to.nom),
      status:             str('refused'),
      type:               str('velo'),
      createdBy:          str('seed'),
      createdAt:          ts(createdAt),
      updatedAt:          ts(new Date(createdAt.getTime() + 86400000)),
      readByFrom:         bool(false),
      readByTo:           bool(true),
      commentaire:        nul(),
      reponseCommentaire: str('Stock indisponible actuellement'),
      createdByAcheteur:  bool(false),
    })
    count++
  }
  console.log('✓ 4 transferts refusés créés')
  console.log(`\n🎉 Total : ${count} transferts dans l'émulateur`)
}

main().catch(err => { console.error('❌ Erreur :', err.message); process.exit(1) })
