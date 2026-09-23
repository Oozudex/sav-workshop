/**
 * Seed de dossiers SAV fictifs dans l'émulateur Firestore.
 * Utilise l'API REST directement avec le token "owner" qui bypass les règles de sécurité.
 */

const BASE = 'http://localhost:8080/v1/projects/sav-workshop/databases/(default)/documents'
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer owner',  // bypass sécurité dans l'émulateur
}
const YEAR = 2026
const pad = (n, l = 4) => String(n).padStart(l, '0')

// ── Helpers Firestore REST format ──────────────────────────────────────────
function str(v)  { return v != null ? { stringValue: v }                            : { nullValue: null } }
function bool(v) { return { booleanValue: v } }
function ts(d)   { return { timestampValue: new Date(d).toISOString() } }

function toFirestore(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined)       fields[k] = { nullValue: null }
    else if (typeof v === 'boolean')         fields[k] = bool(v)
    else if (v instanceof Date)              fields[k] = ts(v)
    else if (typeof v === 'number')          fields[k] = { integerValue: String(v) }
    else if (Array.isArray(v))               fields[k] = { arrayValue: { values: v.map(item => toFirestoreValue(item)) } }
    else if (typeof v === 'string')          fields[k] = str(v)
    else if (typeof v === 'object')          fields[k] = { mapValue: { fields: toFirestore(v) } }
  }
  return fields
}

function toFirestoreValue(v) {
  if (v === null || v === undefined)       return { nullValue: null }
  if (typeof v === 'boolean')              return bool(v)
  if (v instanceof Date)                   return ts(v)
  if (typeof v === 'number')               return { integerValue: String(v) }
  if (typeof v === 'string')               return str(v)
  if (typeof v === 'object')               return { mapValue: { fields: toFirestore(v) } }
  return { nullValue: null }
}

// ── REST helpers ──────────────────────────────────────────────────────────
async function listDocs(col, limit = 5) {
  const url = `${BASE}/${col}?pageSize=${limit}`
  const res = await fetch(url, { headers: HEADERS })
  const json = await res.json()
  if (!res.ok) throw new Error(`Firestore list ${col}: ${JSON.stringify(json)}`)
  return json.documents || []
}

async function createDoc(col, data) {
  const url = `${BASE}/${col}`
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestore(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Firestore create ${col}: ${JSON.stringify(json)}`)
  return json
}

async function setDoc(col, docId, data) {
  const url = `${BASE}/${col}/${docId}?currentDocument.exists=false`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestore(data) }),
  })
  const json = await res.json()
  if (!res.ok) {
    // Essaie sans la contrainte exists si le doc existe déjà
    const url2 = `${BASE}/${col}/${docId}`
    const res2 = await fetch(url2, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ fields: toFirestore(data) }),
    })
    const json2 = await res2.json()
    if (!res2.ok) throw new Error(`Firestore set ${col}/${docId}: ${JSON.stringify(json2)}`)
    return json2
  }
  return json
}

// ── Data ─────────────────────────────────────────────────────────────────
const TICKETS = [
  {
    customerName: 'Martin Lefebvre',
    customerPhone: '06 12 34 56 78',
    customerEmail: null,
    preferredContact: 'Téléphone',
    bikeType: 'VTT',
    bikeBrand: 'Trek',
    bikeModel: 'Marlin 7',
    serialNumber: 'WTU6E2126A',
    purchaseDate: '2024-03-15',
    underWarranty: true,
    issueDescription: 'Dérailleur arrière qui saute de la 3e à la 5e vitesse. Câble potentiellement détendu.',
    accessoriesLeft: 'Antivol U, sacoche de cadre',
    priority: 'Normal',
    dueDate: '2026-06-20',
    createdByName: 'Thomas',
    status: 'New',
    createdAt: new Date('2026-06-15T09:14:00'),
  },
  {
    customerName: 'Sophie Durand',
    customerPhone: '07 56 78 90 12',
    customerEmail: 'sophie.durand@gmail.com',
    preferredContact: 'Email',
    bikeType: 'Électrique',
    bikeBrand: 'Specialized',
    bikeModel: 'Turbo Vado SL',
    serialNumber: 'SPEC2025SL88',
    purchaseDate: '2025-01-20',
    underWarranty: true,
    issueDescription: 'Assistance électrique qui coupe brusquement à partir de 15 km/h. Batterie chargée à 100 %.',
    accessoriesLeft: null,
    priority: 'Urgent',
    dueDate: '2026-06-19',
    createdByName: 'Thomas',
    status: 'New',
    createdAt: new Date('2026-06-16T10:30:00'),
  },
  {
    customerName: 'Rémi Garnier',
    customerPhone: '06 98 76 54 32',
    customerEmail: null,
    preferredContact: 'Téléphone',
    bikeType: 'Route',
    bikeBrand: 'Orbea',
    bikeModel: 'Orca M30',
    serialNumber: null,
    purchaseDate: '2023-07-10',
    underWarranty: false,
    issueDescription: 'Frein avant à disque qui grince fortement. Plaquettes à remplacer, disque à inspecter.',
    accessoriesLeft: 'Pompe à main',
    priority: 'Normal',
    dueDate: '2026-06-22',
    createdByName: 'Julie',
    status: 'InProgress',
    createdAt: new Date('2026-06-13T14:00:00'),
  },
  {
    customerName: 'Claire Bernard',
    customerPhone: '06 11 22 33 44',
    customerEmail: 'claire.b@hotmail.fr',
    preferredContact: 'Indifférent',
    bikeType: 'Urbain',
    bikeBrand: 'Btwin',
    bikeModel: 'Elops 920',
    serialNumber: 'BT9204567F',
    purchaseDate: '2024-09-01',
    underWarranty: true,
    issueDescription: 'Roue arrière voilée suite à une chute. 2 rayons cassés. Jante à vérifier.',
    accessoriesLeft: 'Porte-bagages avec tendeur',
    priority: 'Normal',
    dueDate: '2026-06-24',
    createdByName: 'Thomas',
    status: 'InProgress',
    createdAt: new Date('2026-06-14T11:45:00'),
  },
  {
    customerName: 'Antoine Morel',
    customerPhone: '07 33 44 55 66',
    customerEmail: null,
    preferredContact: 'Téléphone',
    bikeType: 'Gravel',
    bikeBrand: 'Cannondale',
    bikeModel: 'Topstone 4',
    serialNumber: 'CND2024GR01',
    purchaseDate: '2024-05-18',
    underWarranty: false,
    issueDescription: 'Boîtier de pédalier qui craque lors des sorties longues. Roulement à changer.',
    accessoriesLeft: null,
    priority: 'Normal',
    dueDate: '2026-06-28',
    createdByName: 'Julie',
    status: 'WaitingParts',
    createdAt: new Date('2026-06-10T09:00:00'),
  },
  {
    customerName: 'Pauline Rousseau',
    customerPhone: '06 77 88 99 00',
    customerEmail: 'p.rousseau@outlook.com',
    preferredContact: 'Email',
    bikeType: 'Enfant',
    bikeBrand: 'Decathlon',
    bikeModel: 'Rockrider ST 500',
    serialNumber: null,
    purchaseDate: '2025-04-12',
    underWarranty: true,
    issueDescription: 'Frein arrière V-brake inefficace. Câble et gaine à remplacer. Leviers à régler.',
    accessoriesLeft: null,
    priority: 'Urgent',
    dueDate: '2026-06-18',
    createdByName: 'Thomas',
    status: 'WaitingCustomer',
    createdAt: new Date('2026-06-09T16:20:00'),
  },
  {
    customerName: 'Marc Petit',
    customerPhone: '06 55 44 33 22',
    customerEmail: null,
    preferredContact: 'Téléphone',
    bikeType: 'Électrique',
    bikeBrand: 'Gazelle',
    bikeModel: 'Ultimate C380+',
    serialNumber: 'GZL2023C380',
    purchaseDate: '2023-11-05',
    underWarranty: false,
    issueDescription: "Afficheur LCD ne s'allume plus. Connexion vérifiée. Afficheur remplacé sous devis accepté.",
    accessoriesLeft: 'Chargeur batterie',
    priority: 'Normal',
    dueDate: '2026-06-17',
    createdByName: 'Julie',
    status: 'Ready',
    createdAt: new Date('2026-06-06T10:00:00'),
  },
  {
    customerName: 'Isabelle Thomas',
    customerPhone: '07 00 11 22 33',
    customerEmail: 'i.thomas@free.fr',
    preferredContact: 'Email',
    bikeType: 'Route',
    bikeBrand: 'Giant',
    bikeModel: 'Contend AR 4',
    serialNumber: 'GT2024AR456',
    purchaseDate: '2024-02-28',
    underWarranty: false,
    issueDescription: 'Révision complète demandée. Chaîne, cassette et câbles changés. Freins réglés.',
    accessoriesLeft: null,
    priority: 'Normal',
    dueDate: '2026-06-10',
    createdByName: 'Thomas',
    status: 'Closed',
    createdAt: new Date('2026-06-03T08:30:00'),
  },
]

// ── Main ──────────────────────────────────────────────────────────────────
async function seed() {
  // 1. Récupère le magasin
  const magDocs = await listDocs('magasins', 1)
  if (!magDocs.length) {
    console.error('Aucun magasin trouvé. Lance d\'abord un seed magasin.')
    process.exit(1)
  }
  const magasinId = magDocs[0].name.split('/').at(-1)
  const magasinNom = magDocs[0].fields?.nom?.stringValue || magasinId
  console.log(`Magasin cible : ${magasinNom} (${magasinId})\n`)

  // 2. Récupère le compteur actuel
  let startNum = 1
  try {
    const counterDocs = await listDocs('counters', 10)
    const counterDoc = counterDocs.find(d => d.name.endsWith('/tickets'))
    if (counterDoc) {
      const lastNumber = parseInt(counterDoc.fields?.lastNumber?.integerValue || '0', 10)
      const year = parseInt(counterDoc.fields?.year?.integerValue || '0', 10)
      startNum = (year === YEAR ? lastNumber : 0) + 1
    }
  } catch { /* pas de compteur, on commence à 1 */ }

  console.log(`Numérotation à partir de SAV-${YEAR}-${pad(startNum)}\n`)

  // 3. Crée les tickets
  for (let i = 0; i < TICKETS.length; i++) {
    const t = TICKETS[i]
    const num = startNum + i
    const ticketNumber = `SAV-${YEAR}-${pad(num)}`
    const history = [
      { at: t.createdAt.toISOString(), by: 'seed', action: 'create', note: 'Ticket créé' },
    ]
    if (t.status !== 'New') {
      history.push({
        at: new Date(t.createdAt.getTime() + 3_600_000).toISOString(),
        by: 'seed', action: 'status', note: `Statut → ${t.status}`,
      })
    }

    await createDoc('tickets', {
      customerName:     t.customerName,
      customerPhone:    t.customerPhone,
      customerEmail:    t.customerEmail,
      preferredContact: t.preferredContact,
      bikeType:         t.bikeType,
      bikeBrand:        t.bikeBrand,
      bikeModel:        t.bikeModel,
      serialNumber:     t.serialNumber,
      purchaseDate:     t.purchaseDate,
      underWarranty:    t.underWarranty,
      issueDescription: t.issueDescription,
      accessoriesLeft:  t.accessoriesLeft,
      priority:         t.priority,
      dueDate:          t.dueDate,
      createdByName:    t.createdByName,
      magasinId,
      status:           t.status,
      createdAt:        t.createdAt,
      updatedAt:        t.createdAt,
      createdBy:        'seed',
      ticketNumber,
      history,
    })

    const label = t.priority === 'Urgent' ? '⚡' : '  '
    console.log(`  ${ticketNumber}  ${label} ${t.status.padEnd(16)}  ${t.customerName}`)
  }

  // 4. Met à jour le compteur
  await setDoc('counters', 'tickets', {
    lastNumber: startNum + TICKETS.length - 1,
    year: YEAR,
    updatedAt: new Date(),
  })

  console.log(`\n✅ ${TICKETS.length} tickets SAV créés dans l'émulateur.`)
}

seed().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
