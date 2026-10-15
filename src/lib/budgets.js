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
  { nom: 'MONTVAL', code: 'VOUV 4515/0', alias: [] },
]

// ── Droits ──────────────────────────────────────────────────────────────────────
// La direction (administrateurs compris) modifie tous les univers ; un acheteur, ses univers attitrés
// (users/{uid}.univers). Les règles Firestore appliquent la même règle aux lignes par marque.

export function canEditUnivers(user, univers) {
  if (user?.role === 'directeurgen') return true
  return user?.role === 'acheteur' && (user.univers || []).includes(univers)
}

export function editableLines(lines, user) {
  return lines.filter(l => canEditUnivers(user, l.univers))
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
const EMPTY_CELL = { base: 0, groupe: 0, n1: 0, saisie: 0, engage: 0, qte: 0, qteN1: 0 }
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
