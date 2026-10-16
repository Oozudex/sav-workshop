// Budgets acheteurs (AH / PE) : listes par défaut, lecture de la base budget et du budget N-1
// (fichiers Excel), rapprochement des magasins et totaux. Fonctions pures (tests/unit/budgets.test.mjs).
import { cleanText, parsePrice } from './opImport.js'

// ── Saisons ─────────────────────────────────────────────────────────────────────

export const SAISONS = { AH: 'Automne-Hiver', PE: 'Printemps-Été' }

// AH, 2027 → « AH27 »
export function seasonCode(saison, annee) {
  return `${saison}${String(annee).slice(-2)}`
}

export function budgetName(saison, annee) {
  return `BUDGET ${seasonCode(saison, annee)}`
}

// Le N-1 d'un budget : même saison, année précédente (AH27 → AH26)
export function previousSeason({ saison, annee }) {
  return { saison, annee: annee - 1 }
}

// ── Conservation ────────────────────────────────────────────────────────────────
// Un budget est gardé 5 ans après sa saison : BUDGET AH27 jusqu'au 31/12/2032. À partir du 1er octobre de
// cette dernière année, les acheteurs ont une tâche « Exporter » dans leur todo, jusqu'à ce qu'un export
// Excel du budget soit fait (budgets/{id}.export, daté de ce rappel ou après).
export const CONSERVATION_ANS = 5

export function budgetEcheance({ annee }) {
  return `${annee + CONSERVATION_ANS}-12-31`
}

export function rappelExportDebut({ annee }) {
  return `${annee + CONSERVATION_ANS}-10-01`
}

// exportAt : date de l'export ('YYYY-MM-DD'), null si jamais exporté
export function exportAFaire(budget, exportAt, today) {
  const debut = rappelExportDebut(budget)
  return today >= debut && !(exportAt && exportAt >= debut)
}

// ── Listes par défaut (proposées tant que les listes sont vides) ────────────────

export const DEFAULT_UNIVERS = [
  'ACCESSOIRE TEXTILE', 'ALPINISME ET ESCALADE', 'AUTRES SPORTS COLLECTIFS', 'AUTRES SPORTS DE RAQUETTES',
  'BAGAGERIE', 'BASKETBALL', 'CHASSE', 'CHAUSSURES LOISIRS', 'CYCLE', 'DANSE ET GYMNASTIQUE',
  'ELECTRONIQUE DU SPORTIF', 'EQUIPEMENT CLUBS ET COLLECTIVITES', 'EQUITATION', 'FOOTBALL', 'GLISSE URBAINE',
  'GOLF', 'HANDBALL', 'JEUX ET LOISIRS', 'MUSCULATION ET CARDIO FITNESS', 'NATATION',
  'NUTRITION ET BIEN ETRE DU SPORTIF', 'OPTIQUE', 'PECHE', 'PLAGE', 'RANDONNEE', 'RUGBY', 'RUNNING',
  'SKI ET SNOW HABILLEMENT', 'SKI ET SNOW MATERIEL', 'SPORTS DE COMBAT', 'SPORTS DE GLACE', "SPORTS D'EAU",
  'TENNIS', 'TEXTILE FEMME', 'TEXTILE FILLE BEBE', 'TEXTILE FILLE JUNIOR', 'TEXTILE GARCON BEBE',
  'TEXTILE GARCON JUNIOR', 'TEXTILE HOMME', 'TRAINING', 'VOLLEYBALL',
]

// code : libellé du magasin dans la base budget ; alias : autres écritures (budgets N-1…)
export const DEFAULT_MAGASINS = [
  { nom: 'CHATEAU GONTIER', code: 'CHT 274/0', alias: [] },
  { nom: 'ST BERTHEVIN', code: 'SB 414/0', alias: ['SAINT BERTHEVIN'] },
  { nom: 'LA FERTE', code: 'LF 458/0', alias: ['LA FERTE BERNARD'] },
  { nom: 'NOGENT', code: 'NGT 641/0', alias: ['NOGENT LE ROTROU'] },
  { nom: 'SARAN', code: 'SAR 650/0', alias: [] },
  { nom: 'VITRE', code: 'VIT 893/0', alias: [] },
  { nom: 'CHECY', code: 'CHY 227/0', alias: [] },
  { nom: 'LAVAL', code: 'LVL2 551/0', alias: [] },
  { nom: 'ST JEAN DE LA RUELLE', code: 'SJDLR 4927/0', alias: ['SAINT JEAN DE LA RUELLE'] },
  { nom: 'MONTVAL', code: 'VOUV 4515/0', alias: ['VOUVRAY'] },
]

// ── Droits ──────────────────────────────────────────────────────────────────────
// La direction (administrateurs compris) modifie tous les univers ; un acheteur, ses univers attitrés
// (users/{uid}.univers). Les règles Firestore appliquent la même règle aux lignes par marque.

export function canEditUnivers(user, univers) {
  if (user?.role === 'directeurgen') return true
  return user?.role === 'acheteur' && (user.univers || []).includes(univers)
}

// ── Filtre par acheteur ─────────────────────────────────────────────────────────
// '' : tout ; 'a:<uid>' : les univers attribués à cet acheteur ; FILTRE_SANS_ACHETEUR : les univers
// que personne n'a en charge.

export const FILTRE_SANS_ACHETEUR = '!sans'
export const filtreAcheteur = uid => `a:${uid}`

// Un acheteur qui a des univers voit d'abord les siens
export function defaultBuyerFilter(user) {
  return user?.role === 'acheteur' && user.univers?.length ? filtreAcheteur(user.uid) : ''
}

// Univers retenus par le filtre : fonction (univers → booléen)
export function buyerFilterTest(filtre, acheteurs) {
  if (!filtre) return () => true
  if (filtre === FILTRE_SANS_ACHETEUR) {
    const pris = new Set(acheteurs.flatMap(a => a.univers || []))
    return u => !pris.has(u)
  }
  const a = acheteurs.find(x => filtreAcheteur(x.id) === filtre)
  const siens = new Set(a?.univers || [])
  return u => siens.has(u)
}

// ── Noms et identifiants ────────────────────────────────────────────────────────

// Comparaison des libellés : sans accents, majuscules, espaces réduits
export function normLabel(v) {
  return cleanText(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

// Identifiant stable d'un segment (« ACCESSOIRE TEXTILE », « CEINTURE » → « accessoire-textile__ceinture »).
// Segment vide : les marques sont rattachées directement à l'univers (univers sans segment).
export function segmentId(univers, segment = '') {
  const slug = v => normLabel(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug(univers)}__${slug(segment)}`
}

export function marqueKey(segId, nom) {
  return `${segId}|${normLabel(nom)}`
}

// Nom d'une marque : une ligne, espaces superflus retirés (« PUMA  » → « PUMA »)
export function cleanMarque(v) {
  return cleanText(v)
}

// Fonction (libellé de magasin → id du magasin ou null) : nom, code base ou un des alias
export function magasinMatcher(magasins) {
  const index = new Map()
  for (const m of magasins) {
    for (const label of [m.nom, m.code, ...(m.alias || [])]) {
      const k = normLabel(label)
      if (k && !index.has(k)) index.set(k, m.id)
    }
  }
  return label => index.get(normLabel(label)) ?? null
}

// Fonction (libellé → nom de l'univers tel qu'enregistré, ou null)
export function universMatcher(univers) {
  const index = new Map(univers.map(u => [normLabel(u), u]))
  return label => index.get(normLabel(label)) ?? null
}

export function toAmount(v) {
  return parsePrice(v)
}

// ── Base budget (« BASE BUDGET AH27 ») ──────────────────────────────────────────
// Colonnes Univers, Magasin, Budget détail marques. Une ligne non décalée dont le nom est un univers
// enregistré ouvre cet univers ; les lignes suivantes sont ses segments jusqu'au prochain univers.
// Un univers sans segment garde son propre budget (segment vide).

export const BASE_BUDGET_COLUMN = 'BUDGET DETAIL MARQUES'
const BASE_BUDGET_FALLBACK = 26 // colonne AA

export function parseBaseSheet(rows, { univers, matchMagasin }) {
  const matchUnivers = universMatcher(univers)
  const h = rows.findIndex(r => r.some(c => normLabel(c) === 'UNIVERS') && r.some(c => normLabel(c) === 'MAGASIN'))
  if (h < 0) return { error: 'Colonnes « Univers » et « Magasin » introuvables : est-ce bien le fichier de base ?' }
  const header = rows[h].map(normLabel)
  const colU = header.indexOf('UNIVERS')
  const colM = header.indexOf('MAGASIN')
  let colB = header.indexOf(BASE_BUDGET_COLUMN)
  if (colB < 0) colB = BASE_BUDGET_FALLBACK

  const universOrder = []
  const universRows = new Map()   // univers → { magId: montant } (ligne de l'univers)
  const segments = new Map()      // segId → { id, univers, nom }
  const base = {}
  const unknownMagasins = new Set()
  let current = null, orphans = 0, lines = 0

  const add = (segId, magId, amount) => {
    base[segId] ??= {}
    base[segId][magId] = Math.round(((base[segId][magId] || 0) + amount) * 100) / 100
  }

  for (const row of rows.slice(h + 1)) {
    const raw = String(row[colU] ?? '')
    const name = cleanText(raw)
    if (!name) continue
    const indented = /^\s/.test(raw)
    const u = indented ? null : matchUnivers(name)
    if (u) {
      current = u
      if (!universRows.has(u)) { universRows.set(u, {}); universOrder.push(u) }
    } else if (!current) { orphans++; continue }

    const magLabel = cleanText(row[colM])
    const magId = matchMagasin(magLabel)
    if (!magId) { if (magLabel) unknownMagasins.add(magLabel); continue }
    const amount = toAmount(row[colB]) || 0
    lines++

    if (u) {
      const r = universRows.get(u)
      r[magId] = (r[magId] || 0) + amount
    } else {
      const id = segmentId(current, name)
      if (!segments.has(id)) segments.set(id, { id, univers: current, nom: name })
      add(id, magId, amount)
    }
  }

  // Univers sans segment : son budget devient celui du « segment » univers entier
  const ordered = []
  for (const u of universOrder) {
    const segs = [...segments.values()].filter(s => s.univers === u)
    if (segs.length) { ordered.push(...segs); continue }
    const id = segmentId(u)
    ordered.push({ id, univers: u, nom: '' })
    for (const [magId, amount] of Object.entries(universRows.get(u))) add(id, magId, amount)
  }

  return {
    segments: ordered,
    base,
    stats: { univers: universOrder.length, segments: ordered.filter(s => s.nom).length, lignes: lines },
    unknownMagasins: [...unknownMagasins],
    orphans,
  }
}

// Segments après un import : ceux du fichier (dans son ordre), puis les autres déjà présents
// (créés par le N-1) qui ne sont pas dans le fichier
export function mergeSegments(existing = [], incoming = []) {
  const ids = new Set(incoming.map(s => s.id))
  return [...incoming, ...existing.filter(s => !ids.has(s.id))]
}

// ── Budget N-1 par marque (onglet « BUDGET PAR MARQUES ») ───────────────────────
// Ligne d'en-tête : Univers | … | Segment | Marques | magasin 1 | | magasin 2 | | …
// Ligne suivante : « BUDGET AH25 », « BUDGET AH26 »… sous chaque magasin.

export function findN1Sheet(sheetNames) {
  return sheetNames.find(n => normLabel(n) === 'BUDGET PAR MARQUES')
    ?? sheetNames.find(n => normLabel(n).includes('BUDGET PAR MARQUE'))
    ?? null
}

function n1Layout(rows, matchMagasin) {
  const h = rows.findIndex(r => r.some(c => normLabel(c).startsWith('UNIVERS')) && r.some(c => normLabel(c).startsWith('MARQUE')))
  if (h < 0) return null
  const header = rows[h].map(normLabel)
  const sub = (rows[h + 1] || []).map(normLabel)
  const colUnivers = header.findIndex(c => c.startsWith('UNIVERS'))
  let colSegment = header.indexOf('SEGMENT')
  if (colSegment < 0) colSegment = header.findIndex(c => c.startsWith('SEGMENT'))
  const colMarque = header.findIndex(c => c.startsWith('MARQUE'))
  const colComment = header.findIndex(c => c.startsWith('COMMENTAIRE'))

  // Groupes de colonnes : un libellé d'en-tête et les colonnes vides qui le suivent
  const groups = []
  for (let j = colMarque + 1; j < Math.max(header.length, sub.length); j++) {
    if (header[j]) groups.push({ label: cleanText(rows[h][j]), cols: [j] })
    else if (groups.length) groups.at(-1).cols.push(j)
  }
  const stores = groups.map(g => ({ ...g, magId: matchMagasin(g.label) }))
  const columns = [...new Set(stores.filter(s => s.magId).flatMap(s => s.cols.map(j => sub[j]).filter(Boolean)))]
  return { h, sub, colUnivers, colSegment, colMarque, colComment, stores, columns }
}

// Colonnes proposées (« BUDGET AH25 », « BUDGET AH26 »…) sous les magasins reconnus
export function n1Columns(rows, matchMagasin) {
  return n1Layout(rows, matchMagasin)?.columns ?? []
}

export function parseN1Sheet(rows, { univers, matchMagasin, column }) {
  const layout = n1Layout(rows, matchMagasin)
  if (!layout || layout.colMarque < 0) return { error: 'Colonnes « Univers » et « Marques » introuvables dans cet onglet.' }
  const { h, sub, colUnivers, colSegment, colMarque, colComment, stores } = layout
  const wanted = normLabel(column)
  const storeCols = []
  const unknownMagasins = []
  for (const s of stores) {
    const j = s.cols.find(c => sub[c] === wanted)
    if (j == null) continue
    if (s.magId) storeCols.push({ magId: s.magId, j })
    else unknownMagasins.push(s.label)
  }
  if (!storeCols.length) return { error: `Aucun magasin reconnu avec la colonne « ${column} ».` }

  const matchUnivers = universMatcher(univers)
  const unknownUnivers = new Set()
  const lines = new Map()
  for (const row of rows.slice(h + 2)) {
    const marque = cleanMarque(row[colMarque])
    const m = normLabel(marque)
    if (!m || m === 'TOTAL' || m.startsWith('BUDGET PAR SEGMENT')) continue
    const uLabel = cleanText(row[colUnivers])
    if (!uLabel) continue
    const u = matchUnivers(uLabel)
    if (!u) { unknownUnivers.add(uLabel); continue }
    let segment = colSegment >= 0 ? cleanText(row[colSegment]) : ''
    if (normLabel(segment) === normLabel(u)) segment = ''
    const segId = segmentId(u, segment)
    const key = marqueKey(segId, marque)
    const line = lines.get(key) ?? { segId, univers: u, segment, nom: marque, n1: {}, commentaire: '' }
    for (const { magId, j } of storeCols) {
      const v = toAmount(row[j])
      if (v == null) continue
      line.n1[magId] = Math.round(((line.n1[magId] || 0) + v) * 100) / 100
    }
    const c = colComment >= 0 ? cleanText(row[colComment]) : ''
    if (c) line.commentaire = line.commentaire ? `${line.commentaire} / ${c}` : c
    lines.set(key, line)
  }

  return {
    lines: [...lines.values()],
    magasins: storeCols.length,
    unknownMagasins,
    unknownUnivers: [...unknownUnivers],
  }
}

// ── Commandes fournisseur (export MesAchats « CDE ENERGETICS AH27 ») ────────────
// Une ligne par modèle × couleur : Univers, Segment, Famille, SousFamille, Marque, Gamme, PAJA (prix d'achat),
// % Remise, PA net saisi, Total, puis une colonne de pièces par magasin (« SB 414/0 » : code du magasin dans
// Budgets › Magasins). Montant = pièces × PA net (PA net saisi s'il est rempli, sinon PAJA moins la remise).
// Les lignes sont regroupées par segment, marque et contexte (famille, sous-famille, gamme, nom du fichier) :
// le contexte choisit la déclinaison de la marque dans le budget (« ENERGETICS FEMME », « NIKE Q3 »…).

const STORE_CODE = /\d+\s*\/\s*\d+$/

// « 10 » ou 10 % (0,1 dans Excel) → 0,1
function remiseRate(v) {
  const r = toAmount(v)
  if (!r || r < 0) return 0
  return r >= 1 ? r / 100 : r
}

const mots = v => normLabel(v).split(/[^A-Z0-9]+/).filter(Boolean)

// fichier : nom du fichier, ajouté au contexte (« CDE NIKE Q3 AH27 » → déclinaison « NIKE Q3 »)
export function parseCommandeSheet(rows, { univers, matchMagasin, fichier = '' }) {
  const h = rows.findIndex(r => {
    const c = r.map(normLabel)
    return c.includes('UNIVERS') && c.includes('MARQUE') && c.some(x => x === 'PAJA' || x.startsWith('PA NET'))
  })
  if (h < 0) return { error: 'Colonnes « Univers », « Marque » et « PAJA » introuvables : est-ce bien un fichier de commande ?' }
  const header = rows[h].map(normLabel)
  const col = name => header.indexOf(name)
  const colUnivers = col('UNIVERS'), colSegment = col('SEGMENT'), colMarque = col('MARQUE'), colPaja = col('PAJA')
  const colRemise = header.findIndex(c => c.includes('REMISE')), colPaNet = header.findIndex(c => c.startsWith('PA NET'))
  const colTotal = col('TOTAL'), colModele = header.findIndex(c => c.startsWith('LIBELLE MODELE'))
  const colCouleur = header.findIndex(c => c.startsWith('LIBELLE COULEUR'))
  const colFamille = col('FAMILLE'), colSousFamille = header.findIndex(c => c.replace(/[\s-]/g, '') === 'SOUSFAMILLE')
  const colGamme = col('GAMME')
  const known = new Set([colUnivers, colSegment, colMarque, colPaja, colRemise, colPaNet, colTotal, colFamille, colSousFamille, colGamme])

  const storeCols = [], unknownMagasins = []
  rows[h].forEach((label, j) => {
    if (known.has(j) || !cleanText(label)) return
    const magId = matchMagasin(label)
    if (magId) storeCols.push({ magId, j })
    else if (STORE_CODE.test(cleanText(label))) unknownMagasins.push(cleanText(label))
  })
  if (!storeCols.length) return { error: 'Aucune colonne magasin reconnue (« SB 414/0 »…) : vérifie les codes dans l’onglet Magasins des budgets.' }

  const matchUnivers = universMatcher(univers)
  const cell = (row, j) => (j >= 0 ? cleanText(row[j]) : '')
  const unknownUnivers = new Set(), ecartsTotal = [], sansPrix = []
  const lines = new Map()
  let lignes = 0
  for (const row of rows.slice(h + 1)) {
    const marque = cleanMarque(row[colMarque]).toUpperCase()
    const uLabel = cleanText(row[colUnivers])
    if (!marque || !uLabel) continue // ligne vide ou total
    const u = matchUnivers(uLabel)
    if (!u) { unknownUnivers.add(uLabel); continue }
    lignes++
    let segment = cell(row, colSegment)
    if (normLabel(segment) === normLabel(u)) segment = ''
    const segId = segmentId(u, segment)
    const famille = cell(row, colFamille), sousFamille = cell(row, colSousFamille), gamme = cell(row, colGamme)
    const contexte = [...new Set([famille, sousFamille, gamme, fichier].flatMap(mots))].join(' ')
    const key = `${marqueKey(segId, marque)}|${contexte}`
    const line = lines.get(key) ?? { key, segId, univers: u, segment, nom: marque, famille, contexte, saisie: {}, quantite: {}, lignes: 0 }
    line.lignes++
    lines.set(key, line)

    const paNet = colPaNet >= 0 ? toAmount(row[colPaNet]) : null
    const prix = paNet > 0 ? paNet : (toAmount(row[colPaja]) || 0) * (1 - remiseRate(row[colRemise]))
    const article = [row[colModele], row[colCouleur]].map(cleanText).filter(Boolean).join(' ') || marque
    let pieces = 0
    for (const { magId, j } of storeCols) {
      const q = toAmount(row[j])
      if (!q) continue
      pieces += q
      line.quantite[magId] = (line.quantite[magId] || 0) + q
      line.saisie[magId] = Math.round(((line.saisie[magId] || 0) + q * prix) * 100) / 100
    }
    const total = colTotal >= 0 ? toAmount(row[colTotal]) : null
    if (total != null && Math.abs(total - pieces) > 0.001) ecartsTotal.push(`${article} (Total ${total}, magasins ${pieces})`)
    if (pieces > 0 && !(prix > 0)) sansPrix.push(article)
  }

  return {
    lines: [...lines.values()], lignes, magIds: [...new Set(storeCols.map(s => s.magId))],
    unknownMagasins, unknownUnivers: [...unknownUnivers], ecartsTotal, sansPrix,
  }
}

const addValues = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = Math.round(((a[k] || 0) + v) * 100) / 100 }

// Plusieurs fichiers de commande lus ensemble : un même groupe (segment, marque, contexte) s'additionne
export function mergeCommandes(results) {
  const lines = new Map()
  for (const r of results) {
    for (const l of r.lines) {
      const cur = lines.get(l.key)
      if (!cur) { lines.set(l.key, { ...l, saisie: { ...l.saisie }, quantite: { ...l.quantite } }); continue }
      addValues(cur.saisie, l.saisie); addValues(cur.quantite, l.quantite); cur.lignes += l.lignes
    }
  }
  const all = k => [...new Set(results.flatMap(r => r[k]))]
  return {
    lines: [...lines.values()], lignes: results.reduce((t, r) => t + r.lignes, 0), magIds: all('magIds'),
    unknownMagasins: all('unknownMagasins'), unknownUnivers: all('unknownUnivers'), ecartsTotal: all('ecartsTotal'), sansPrix: all('sansPrix'),
  }
}

export const CIBLE_NOUVELLE = 'nouvelle'
export const CIBLE_IGNORER = 'ignorer'

// Ligne de marque du budget qui reçoit un groupe de la commande, parmi les marques du segment :
// la déclinaison dont la fin du nom (« FEMME », « Q3 »…) est dans le contexte, sinon la marque exacte ;
// '' si plusieurs déclinaisons existent sans que le contexte permette de choisir ; CIBLE_NOUVELLE si
// la marque n'existe pas encore dans le segment.
export function cibleCommande(line, segBrands) {
  const marque = normLabel(line.nom)
  const contexte = new Set(line.contexte.split(' '))
  const candidates = segBrands.filter(b => normLabel(b.nom) === marque || normLabel(b.nom).startsWith(`${marque} `))
  let best = [], bestScore = 0
  for (const b of candidates) {
    const suffixe = mots(normLabel(b.nom).slice(marque.length))
    if (!suffixe.length || !suffixe.every(w => contexte.has(w))) continue
    if (suffixe.length > bestScore) { best = [b]; bestScore = suffixe.length } else if (suffixe.length === bestScore) best.push(b)
  }
  if (best.length === 1) return best[0].id
  if (best.length > 1) return ''
  const exacte = candidates.find(b => normLabel(b.nom) === marque)
  if (exacte) return exacte.id
  return candidates.length ? '' : CIBLE_NOUVELLE
}

// Ce qu'une commande écrit dans le budget. Lignes affichées (rows) : un groupe par segment, marque et
// ligne de budget proposée, avec le choix de l'utilisateur (choix : { [row.key]: id | CIBLE_NOUVELLE |
// CIBLE_IGNORER }). Écritures (items), une par ligne de budget, dans les magasins du fichier (magIds) :
// remplacement de la saisie (montants et quantités ; un magasin sans pièce est vidé) ou ajout (ajouter).
// Les univers que l'utilisateur ne peut pas modifier sont écartés (horsDroits). Valeur null : à effacer.
export function planCommande(commande, { brands, segments, budgetLines, user, ajouter = false, choix = {} }) {
  const permis = commande.lines.filter(l => canEditUnivers(user, l.univers))
  const horsDroits = [...new Set(commande.lines.filter(l => !canEditUnivers(user, l.univers)).map(l => l.univers))]
  const bySeg = new Map()
  for (const b of brands) bySeg.set(b.segId, [...(bySeg.get(b.segId) || []), b])
  for (const list of bySeg.values()) list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  const brandById = new Map(brands.map(b => [b.id, b]))

  // Lignes affichées : groupes du fichier qui vont vers la même ligne de budget proposée
  const rowsByKey = new Map()
  for (const l of permis) {
    const auto = cibleCommande(l, bySeg.get(l.segId) || [])
    const key = `${marqueKey(l.segId, l.nom)}|${auto}`
    const row = rowsByKey.get(key) ?? {
      key, auto, segId: l.segId, univers: l.univers, segment: l.segment, nom: l.nom, familles: [], options: bySeg.get(l.segId) || [],
      saisie: {}, quantite: {}, lignes: 0,
    }
    if (l.famille && !row.familles.includes(l.famille)) row.familles.push(l.famille)
    addValues(row.saisie, l.saisie); addValues(row.quantite, l.quantite); row.lignes += l.lignes
    rowsByKey.set(key, row)
  }
  const rows = [...rowsByKey.values()].map(r => ({
    ...r, cible: choix[r.key] ?? r.auto, commande: sumValues(r.saisie), pieces: sumValues(r.quantite),
  }))
  rows.sort((a, b) => a.univers.localeCompare(b.univers, 'fr') || (a.segment || '').localeCompare(b.segment || '', 'fr')
    || a.nom.localeCompare(b.nom, 'fr') || a.familles.join().localeCompare(b.familles.join(), 'fr'))

  // Écritures : une par ligne de budget visée (nouvelle marque : une par segment et nom)
  const byTarget = new Map()
  for (const r of rows) {
    if (!r.cible || r.cible === CIBLE_IGNORER) continue
    const tKey = r.cible === CIBLE_NOUVELLE ? `new|${marqueKey(r.segId, r.nom)}` : r.cible
    const brand = r.cible === CIBLE_NOUVELLE ? null : brandById.get(r.cible)
    const t = byTarget.get(tKey) ?? {
      id: brand?.id || null, nouvelle: !brand, saisieCmd: {}, quantiteCmd: {},
      identity: brand
        ? { univers: brand.univers, segId: brand.segId, segment: brand.segment || '', nom: brand.nom }
        : { univers: r.univers, segId: r.segId, segment: r.segment || '', nom: r.nom },
    }
    addValues(t.saisieCmd, r.saisie); addValues(t.quantiteCmd, r.quantite)
    byTarget.set(tKey, t)
    r.tKey = tKey
  }
  const lineById = new Map(budgetLines.map(l => [l.id, l]))
  const items = [...byTarget.entries()].map(([tKey, t]) => {
    const cur = (t.id && lineById.get(t.id)) || {}
    const values = (k, cmd) => Object.fromEntries(commande.magIds.flatMap(m => {
      const v = cmd[m]
      if (!ajouter) return [[m, v || null]]
      if (!v) return []
      return [[m, Math.round(((cur[k]?.[m] || 0) + v) * 100) / 100]]
    }))
    const saisie = values('saisie', t.saisieCmd), quantite = values('quantite', t.quantiteCmd)
    return {
      tKey, id: t.id, nouvelle: t.nouvelle, identity: t.identity, saisie, quantite,
      avant: sumValues(cur.saisie), apres: sumValues({ ...(cur.saisie || {}), ...saisie }),
    }
  })
  const itemByKey = new Map(items.map(i => [i.tKey, i]))
  for (const r of rows) r.item = r.tKey ? itemByKey.get(r.tKey) : null

  const segIds = new Set(segments.map(s => s.id))
  const newSegments = []
  for (const it of items) {
    if (segIds.has(it.identity.segId)) continue
    segIds.add(it.identity.segId)
    newSegments.push({ id: it.identity.segId, univers: it.identity.univers, nom: it.identity.segment })
  }
  return { rows, items, horsDroits, newSegments, aChoisir: rows.filter(r => !r.cible).length }
}

// ── Marques ─────────────────────────────────────────────────────────────────────
// Liste commune des marques (budget_marques : univers, segment, segId, nom). Dans un budget, la ligne
// d'une marque (N-1, saisie, commentaire) porte l'id de la marque : budgets/{id}/marques/{idMarque}.

// Lignes N-1 tirées d'un budget précédent (sa saisie et ses quantités deviennent le N-1), même id de marque
export function linesFromBudget(lines) {
  return lines.map(l => ({
    id: l.id, segId: l.segId, univers: l.univers, segment: l.segment || '', nom: l.nom || '',
    n1: { ...(l.saisie || {}) }, quantiteN1: { ...(l.quantite || {}) }, commentaire: l.commentaire || '',
  }))
}

// Rapprochement des lignes N-1 avec la liste des marques : marques trouvées, marques à ajouter
// à la liste et segments à ajouter au budget (absents de la base)
export function planN1Import(lines, brands, segments = []) {
  const byKey = new Map(brands.map(b => [marqueKey(b.segId, b.nom), b]))
  const segIds = new Set(segments.map(s => s.id))
  const matched = [], missing = [], newSegments = []
  for (const l of lines) {
    const b = byKey.get(marqueKey(l.segId, l.nom))
    if (b) matched.push({ id: b.id, line: l })
    else missing.push(l)
    if (!segIds.has(l.segId)) {
      segIds.add(l.segId)
      newSegments.push({ id: l.segId, univers: l.univers, nom: l.segment })
    }
  }
  return { matched, missing, newSegments }
}

const hasAmounts = l => ['n1', 'saisie', 'quantite', 'quantiteN1']
  .some(k => Object.values(l?.[k] || {}).some(v => typeof v === 'number'))

// Marques de chaque segment d'un budget : celles de la liste, plus les lignes du budget dont la marque
// a été retirée de la liste mais qui ont encore des montants (orphan). { segId: [{ id, nom, line, … }] }
export function brandsBySegment(brands, lines) {
  const lineById = new Map(lines.map(l => [l.id, l]))
  const bySeg = new Map()
  const push = (segId, item) => { if (!bySeg.has(segId)) bySeg.set(segId, []); bySeg.get(segId).push(item) }
  for (const b of brands) push(b.segId, { id: b.id, nom: b.nom, univers: b.univers, segId: b.segId, segment: b.segment || '', line: lineById.get(b.id) || null, orphan: false })
  const ids = new Set(brands.map(b => b.id))
  for (const l of lines) {
    if (ids.has(l.id) || !hasAmounts(l)) continue
    push(l.segId, { id: l.id, nom: l.nom || '—', univers: l.univers, segId: l.segId, segment: l.segment || '', line: l, orphan: true })
  }
  for (const list of bySeg.values()) list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  return bySeg
}

// Segments connus (tous budgets confondus), pour ranger la liste des marques
export function segmentsCatalog(budgets, extra = []) {
  const byId = new Map()
  for (const s of [...budgets.flatMap(b => b.segments || []), ...extra]) if (!byId.has(s.id)) byId.set(s.id, s)
  return [...byId.values()]
}

// ── Totaux ──────────────────────────────────────────────────────────────────────

// 8060351.4 → « 8 060 351 € »
export function formatBudget(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} €`
}

export function sumValues(map) {
  let t = 0
  for (const v of Object.values(map || {})) if (typeof v === 'number') t += v
  return t
}

export function hasValue(map, magId) {
  return typeof map?.[magId] === 'number'
}

// Tri des segments : univers dans l'ordre de la liste des univers (inconnus à la fin), univers entier
// en premier, puis l'ordre du budget
export function sortSegments(segments, universOrder) {
  const rank = new Map(universOrder.map((u, i) => [normLabel(u), i]))
  const pos = new Map(segments.map((s, i) => [s.id, i]))
  const r = s => rank.get(normLabel(s.univers)) ?? Infinity
  return [...segments].sort((a, b) => (r(a) - r(b))
    || a.univers.localeCompare(b.univers)
    || ((a.nom ? 1 : 0) - (b.nom ? 1 : 0))
    || (pos.get(a.id) - pos.get(b.id)))
}

// Totaux par segment et magasin : { [segId]: { [magId]: cellule } }. Cellule : base, groupe, n1, saisie,
// engage (saisie des marques déjà commandées : line.engage, pour tous les magasins), qte et qteN1 (quantités).
// ratio : coefficient du budget groupe appliqué au budget de base (null : budget groupe non fixé)
const EMPTY_CELL = { base: 0, groupe: 0, adapte: 0, n1: 0, saisie: 0, engage: 0, qte: 0, qteN1: 0 }
export const emptyCell = () => ({ ...EMPTY_CELL })

export function computeTotals(segments, base, marques, ratio = null) {
  const t = {}
  const cell = (segId, magId) => ((t[segId] ??= {})[magId] ??= emptyCell())
  for (const s of segments) {
    for (const [magId, v] of Object.entries(base?.[s.id] || {})) {
      const c = cell(s.id, magId)
      c.base += v
      if (ratio != null) c.groupe += v * ratio
    }
  }
  for (const m of marques) {
    for (const [magId, v] of Object.entries(m.n1 || {})) if (typeof v === 'number') cell(m.segId, magId).n1 += v
    for (const [magId, v] of Object.entries(m.saisie || {})) {
      if (typeof v !== 'number') continue
      cell(m.segId, magId).saisie += v
      if (m.engage === true) cell(m.segId, magId).engage += v
    }
    for (const [magId, v] of Object.entries(m.quantite || {})) if (typeof v === 'number') cell(m.segId, magId).qte += v
    for (const [magId, v] of Object.entries(m.quantiteN1 || {})) if (typeof v === 'number') cell(m.segId, magId).qteN1 += v
  }
  return t
}

// Addition de cellules de totaux
export function addTotals(cells) {
  const r = emptyCell()
  for (const c of cells) if (c) for (const k of Object.keys(EMPTY_CELL)) r[k] += c[k] || 0
  return r
}

// 1234 → « 1 234 p. » (quantités)
export function formatQte(n) {
  return `${(Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR')} p.`
}

// ── Budget groupe ───────────────────────────────────────────────────────────────
// Fixé par la direction pour tout le budget : un montant, ou une évolution en % du N-1 total
// (−3 % = 97 % du N-1). Il est réparti sur chaque univers, segment et magasin au prorata du budget
// de base, sans toucher à la base. budget.groupe = { mode: 'montant' | 'pct', montant?, pct? }

export function groupeTotal(groupe, n1Total) {
  if (groupe?.mode === 'pct') return typeof groupe.pct === 'number' && n1Total > 0 ? n1Total * (1 + groupe.pct / 100) : null
  if (groupe?.mode === 'montant') return typeof groupe.montant === 'number' ? groupe.montant : null
  return null
}

// Coefficient appliqué au budget de base (null : pas de budget groupe ou base vide)
export function groupeRatio(total, baseTotal) {
  return total != null && baseTotal > 0 ? total / baseTotal : null
}

// Évolution en % de value par rapport à ref (null si ref nul)
export function evolution(value, ref) {
  return ref > 0 && value != null ? (value / ref - 1) * 100 : null
}

// −3.25 → « −3,3 % » ; +2 → « +2 % »
export function formatPct(p) {
  if (p == null) return '—'
  const r = Math.round(p * 10) / 10
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('fr-FR')} %`
}

// Budget à répartir : le budget groupe une fois fixé, sinon la base
export function objectif(cell, hasGroupe) {
  return hasGroupe ? cell.groupe : cell.base
}

// ── Notation des marques et budget adapté ───────────────────────────────────────
// Chaque marque (une fiche pour tout le groupe, par budget) est notée sur 10 selon 3 critères ; la
// moyenne pondérée donne un coefficient (5/10 neutre, ± amplitude %). Elle peut aussi demander un
// budget (total groupe, facultatif). Pondérations et amplitude : réglage commun à tous.

export const CRITERES = [
  { key: 'reassort', label: 'Réassort', hint: 'Disponibilité du réassort en cours de saison avec cette marque' },
  { key: 'conditions', label: 'Conditions commerciales', hint: 'Impact stratégique sur la marge (RFA, marge nette…)' },
  { key: 'service', label: 'Taux de service', hint: 'Le fournisseur livre-t-il correctement (dans la période, la commande saisie) ?' },
]
export const NOTE_NEUTRE = 5
export const NOTATION_DEFAUT = { poids: { reassort: 1, conditions: 1, service: 1 }, amplitude: 20 }

export function notationReglages(doc) {
  return {
    poids: { ...NOTATION_DEFAUT.poids, ...(doc?.poids || {}) },
    amplitude: typeof doc?.amplitude === 'number' ? doc.amplitude : NOTATION_DEFAUT.amplitude,
  }
}

// Identifiant de la fiche d'une marque (même marque dans plusieurs univers : une seule fiche)
export function fournisseurKey(nom) {
  return normLabel(nom).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '_'
}

// Fournisseur d'une marque : ses déclinaisons (« ADIDAS FEMME », « ADIDAS OFFRE TERRAIN »…) partagent la
// fiche du fournisseur (notes, budget demandé). Lien choisi par un acheteur : liens[clé de la marque] =
// nom du fournisseur ('' : marque seule). Sinon automatique : la plus courte autre marque dont le nom
// commence le sien suivi d'un espace (« ADIDAS FEMME » → « ADIDAS »). nom → { key, nom, auto, manuel }
export function fournisseurResolver(noms, liens = {}) {
  const names = [...new Set(noms.map(normLabel))].sort((a, b) => a.length - b.length)
  const cache = new Map()
  const auto = n => names.find(p => p.length < n.length && n.startsWith(`${p} `)) || n
  return nom => {
    const n = normLabel(nom)
    if (cache.has(n)) return cache.get(n)
    const a = auto(n)
    const lien = liens?.[fournisseurKey(n)]
    let f = typeof lien === 'string' ? (normLabel(lien) || n) : a
    // Le fournisseur automatique peut lui-même être lié à la main (« ADIDAS » → « ADIDAS GROUP »)
    if (typeof lien !== 'string' && f !== n && typeof liens?.[fournisseurKey(f)] === 'string') f = normLabel(liens[fournisseurKey(f)]) || f
    const r = { key: fournisseurKey(f), nom: f, auto: a, manuel: typeof lien === 'string' }
    cache.set(n, r)
    return r
  }
}

// Ordre chronologique des budgets : PE (printemps-été) puis AH (automne-hiver) d'une même année
export const budgetRank = b => b.annee * 2 + (b.saison === 'AH' ? 1 : 0)

// Moyenne pondérée des notes présentes (null : aucune note)
export function noteMarque(notes, poids = NOTATION_DEFAUT.poids) {
  let t = 0, w = 0
  for (const { key } of CRITERES) {
    const n = notes?.[key], p = poids?.[key] ?? 1
    if (typeof n === 'number' && p > 0) { t += n * p; w += p }
  }
  return w > 0 ? t / w : null
}

// Coefficient : 5/10 → ×1 ; 10/10 → ×(1 + amplitude %) ; 0/10 → ×(1 − amplitude %). Non notée : ×1
export function coefMarque(note, amplitude = NOTATION_DEFAUT.amplitude) {
  return note == null ? 1 : 1 + (amplitude / 100) * (note - NOTE_NEUTRE) / NOTE_NEUTRE
}

// Budget adapté de chaque marque, par magasin.
// 1. Dans chaque segment et magasin, l'enveloppe (budget groupe, sinon base ; négative = 0) est
//    partagée selon le N-1 de chaque marque multiplié par son coefficient (total = l'enveloppe).
//    Une marque sans N-1 part de 0 ; une marque retirée de la liste (orphan) n'a pas de budget adapté.
// 2. Une marque qui demande un budget plus élevé que son budget adapté s'en rapproche à hauteur de sa
//    note (8/10 : 80 % de l'écart ; non notée : 50 %). Le complément est pris d'abord sur l'enveloppe
//    non répartie, puis sur les autres marques du même segment et magasin.
// fiche(key) → { notes, demande } ; fournisseur(nom) → { key, nom } (déclinaisons regroupées) ; renvoie { byBrand: Map id → { magId: € }, cells: { segId: { magId: € } },
// marques: Map key → { key, nom, note, coef, demande, avant, total }, keyOf: Map id de marque → clé }
export function computeAdapte({ segments, totals, brandsBySeg, magIds, fiche, reglages, hasGroupe, fournisseur }) {
  const fournOf = fournisseur || (nom => ({ key: fournisseurKey(nom), nom: normLabel(nom) }))
  const { poids, amplitude } = notationReglages(reglages)
  const byBrand = new Map()
  const marques = new Map()
  const keyOf = new Map() // id de la marque → clé de son fournisseur
  const get = (id, m) => byBrand.get(id)?.[m] || 0
  const set = (id, m, v) => { if (!byBrand.has(id)) byBrand.set(id, {}); byBrand.get(id)[m] = v }
  const env = (segId, m) => Math.max(objectif(totals[segId]?.[m] || EMPTY_CELL, hasGroupe), 0)
  const infoOf = b => {
    const { key, nom } = fournOf(b.nom)
    if (!marques.has(key)) {
      const f = fiche(key)
      const note = noteMarque(f?.notes, poids)
      marques.set(key, {
        key, nom, note, coef: coefMarque(note, amplitude),
        demande: typeof f?.demande === 'number' && f.demande > 0 ? f.demande : null, cells: [],
      })
    }
    return marques.get(key)
  }

  const actives = segId => (brandsBySeg.get(segId) || []).filter(b => !b.orphan)
  for (const s of segments) {
    const list = actives(s.id)
    for (const b of list) {
      infoOf(b).cells.push(...magIds.map(m => ({ id: b.id, segId: s.id, m })))
      keyOf.set(b.id, fournOf(b.nom).key)
    }
    for (const m of magIds) {
      const raw = list.map(b => Math.max(b.line?.n1?.[m] || 0, 0) * infoOf(b).coef)
      const t = raw.reduce((a, x) => a + x, 0)
      list.forEach((b, i) => set(b.id, m, t > 0 ? env(s.id, m) * raw[i] / t : 0))
    }
  }

  const sumCells = cells => cells.reduce((a, c) => a + get(c.id, c.m), 0)
  for (const info of marques.values()) info.avant = sumCells(info.cells)
  const demandeurs = [...marques.values()].filter(i => i.demande != null)
    .sort((a, b) => (b.note ?? NOTE_NEUTRE) - (a.note ?? NOTE_NEUTRE))
  for (const info of demandeurs) {
    const total = sumCells(info.cells)
    const voulu = (info.demande - total) * (info.note ?? NOTE_NEUTRE) / 10
    if (voulu <= 0) continue
    // Réparti sur les cases de la marque selon son budget adapté, sinon selon l'enveloppe
    let w = info.cells.map(c => get(c.id, c.m))
    if (!(total > 0)) w = info.cells.map(c => env(c.segId, c.m))
    const wt = w.reduce((a, x) => a + x, 0)
    if (!(wt > 0)) continue
    info.cells.forEach((c, i) => {
      let besoin = voulu * w[i] / wt
      if (!(besoin > 0)) return
      const voisins = actives(c.segId).filter(b => fournOf(b.nom).key !== info.key)
      const pris = voisins.reduce((a, b) => a + get(b.id, c.m), 0)
      const libre = Math.max(env(c.segId, c.m) - pris - get(c.id, c.m), 0)
      const surLibre = Math.min(besoin, libre)
      besoin -= surLibre
      const surVoisins = Math.min(besoin, pris)
      if (surVoisins > 0) for (const b of voisins) set(b.id, c.m, get(b.id, c.m) * (1 - surVoisins / pris))
      set(c.id, c.m, get(c.id, c.m) + surLibre + surVoisins)
    })
  }

  const cells = {}
  for (const s of segments) {
    for (const b of brandsBySeg.get(s.id) || []) {
      for (const m of magIds) {
        const v = get(b.id, m)
        if (v) ((cells[s.id] ??= {})[m] = (cells[s.id]?.[m] || 0) + v)
      }
    }
  }
  for (const info of marques.values()) { info.total = sumCells(info.cells); delete info.cells }
  return { byBrand, cells, marques, keyOf }
}

// Ajoute le budget adapté aux totaux par segment et magasin
export function withAdapte(totals, cells) {
  const t = {}
  for (const [segId, mags] of Object.entries(totals)) {
    t[segId] = {}
    for (const [m, c] of Object.entries(mags)) t[segId][m] = { ...c, adapte: cells[segId]?.[m] || 0 }
  }
  return t
}
