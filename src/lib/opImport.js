// Import d'une OP depuis l'Excel commercial : lecture du fichier, rapprochement avec la base des
// vélos en stock, prix bon plan et réimport. Fonctions pures (tests/unit/opImport.test.mjs).

// ── Nettoyage des cellules ──────────────────────────────────────────────────────

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Texte sur une ligne : retours à la ligne et espaces multiples réduits à un espace
export function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

export function normName(v) {
  return stripAccents(cleanText(v)).toLowerCase()
}

// Référence ou chrono : majuscules, sans espaces superflus
export function cleanRef(v) {
  return cleanText(v).toUpperCase()
}

// « 2049.90 € », « 1 299,99 », 1299.99 → nombre arrondi au centime, ou null
export function parsePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  let s = String(v ?? '').replace(/[\s\u00a0\u202f€]/g, '')
  if (!s) return null
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (comma >= 0) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export const SEGMENT_LABELS = {
  velo: 'Vélo', trottinette: 'Trottinette', roller: 'Roller', accessoires: 'Accessoires', textile: 'Textile',
}

// « ACCESSOIRE DU VELO » → accessoires (à tester avant « vélo »), « HABILLEMENT » → textile…
export function normSegment(v) {
  const s = normName(v)
  if (!s) return null
  if (/accessoire/.test(s)) return 'accessoires'
  if (/habillement|textile|vetement/.test(s)) return 'textile'
  if (/trottinette|scooter/.test(s)) return 'trottinette'
  if (/roller/.test(s)) return 'roller'
  if (/velo|vae|bike|cycle/.test(s)) return 'velo'
  return s
}

// Seuls les vélos sont dans la base de stock : les autres segments sont importés sans vérification
export function checksStock(segment) {
  return !segment || segment === 'velo'
}

// Fond de cellule bleu (du cyan au bleu, clair ou foncé) : la ligne passera en bon plan à la fin de l'OP
export function isBlueFill(rgb) {
  if (!/^[0-9A-F]{6}$/i.test(rgb || '')) return false
  const [r, g, b] = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.06) return false // blanc, gris
  const l = (max + min) / 2
  const sat = d / (1 - Math.abs(2 * l - 1))
  let hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  if (hue < 0) hue += 360
  return hue >= 170 && hue <= 250 && sat >= 0.25 && l > 0.15 && l <= 0.95
}

// ── Lecture du fichier ──────────────────────────────────────────────────────────

const HEADER_FIELDS = {
  'nom': 'nom', 'produit': 'nom', 'article': 'nom', 'designation': 'nom', 'libelle': 'nom',
  'marque': 'marque', 'brand': 'marque',
  'reference': 'reference', 'ref': 'reference', 'ref produit': 'reference',
  'ref fournisseur': 'refFournisseur', 'reference fournisseur': 'refFournisseur', 'ref fourn': 'refFournisseur',
  'chrono': 'chrono',
  'couleur': 'couleur',
  'famille': 'famille',
  'segment': 'segment',
  'prix fort': 'prixFort',
  'prix op': 'prixOp', 'prix promo': 'prixOp', 'prix operation': 'prixOp',
}

export function normHeader(h) {
  return normName(h).replace(/[.:]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Lignes du fichier → produits de l'OP. La ligne d'en-têtes est cherchée dans les 10 premières lignes
 * (un titre peut la précéder). `fills` (optionnel) : couleurs de fond, une ligne en bleu = futur bon plan.
 * Renvoie { rows, error } ; chaque produit garde son numéro de ligne Excel (`line`).
 */
export function parseOpSheet(rows, fills = []) {
  const headerIdx = rows.slice(0, 10).findIndex(r => {
    const fields = (r || []).map(h => HEADER_FIELDS[normHeader(h)]).filter(Boolean)
    return fields.includes('nom') && fields.includes('prixOp')
  })
  if (headerIdx < 0) return { rows: [], error: 'En-têtes introuvables : il faut au moins les colonnes « Nom » et « Prix op ».' }

  const fieldMap = rows[headerIdx].map(h => HEADER_FIELDS[normHeader(h)] || null)
  const out = []
  rows.slice(headerIdx + 1).forEach((row, k) => {
    const i = headerIdx + 1 + k
    const r = { line: i + 1 }
    fieldMap.forEach((field, j) => {
      if (!field || r[field] != null) return
      const raw = row?.[j]
      if (field === 'prixFort' || field === 'prixOp') r[field] = parsePrice(raw)
      else if (field === 'segment') r[field] = normSegment(raw)
      else if (field === 'reference' || field === 'refFournisseur' || field === 'chrono') r[field] = cleanRef(raw) || null
      else r[field] = cleanText(raw) || null
    })
    if (!r.nom && !r.reference && !r.refFournisseur && !r.chrono) return
    r.highlighted = (fills[i] || []).some(isBlueFill)
    out.push(r)
  })
  return { rows: out, error: out.length ? null : 'Aucun produit trouvé sous la ligne d\'en-têtes.' }
}

// ── Rapprochement avec la base des vélos en stock ───────────────────────────────

function pushTo(map, key, item) {
  if (!key) return
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(item)
}

// Base : une référence = « réf. modèle + code déclinaison » (« YH60WY 014TVP »), un chrono par déclinaison
export function buildCatalogueIndex(catalogue) {
  const idx = { byChrono: new Map(), byRef: new Map(), byModel: new Map(), byName: new Map() }
  for (const p of catalogue) {
    const ref = cleanRef(p.reference)
    pushTo(idx.byChrono, cleanRef(p.chrono), p)
    pushTo(idx.byRef, ref.replace(/\s/g, ''), p)
    pushTo(idx.byModel, ref.split(' ')[0], p)
    pushTo(idx.byName, normName(p.nom), p)
  }
  return idx
}

/**
 * Déclinaisons en stock correspondant à une ligne de l'OP.
 * - `chrono` / `ref` / `modele` : trouvées par un identifiant, fiables ;
 * - `nom` : trouvées seulement par le nom (souvent plusieurs années de modèle), à vérifier ;
 * - null : rien en stock.
 * La colonne « Réf fournisseur » contient selon les marques la réf. modèle ou le chrono.
 */
export function matchLine(line, idx) {
  const keys = [...new Set([line.chrono, line.reference, line.refFournisseur].filter(Boolean))]
  for (const key of keys) {
    const byChrono = idx.byChrono.get(key)
    if (byChrono) return { how: 'chrono', matches: byChrono }
    const byRef = idx.byRef.get(key.replace(/\s/g, ''))
    if (byRef) return { how: 'ref', matches: byRef }
    // Réf. modèle seule : toutes ses déclinaisons en stock (pas si une déclinaison précise est demandée)
    const byModel = !key.includes(' ') && idx.byModel.get(key)
    if (byModel) return { how: 'modele', matches: byModel }
  }
  const byName = line.nom && idx.byName.get(normName(line.nom))
  if (byName) return { how: 'nom', matches: byName }
  return { how: null, matches: [] }
}

// ── Prix bon plan ───────────────────────────────────────────────────────────────

function millis(t) {
  if (!t) return 0
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (t instanceof Date) return t.getTime()
  return (t.seconds ?? 0) * 1000
}

// Prix bon plan en vigueur : le plus récent quand un chrono en a plusieurs (les autres sont gardés)
export function latestBonPlans(list) {
  const byChrono = new Map(), others = []
  for (const p of list) {
    const key = cleanRef(p.chrono)
    if (!key) { others.push(p); continue }
    const cur = byChrono.get(key)
    if (!cur || millis(p.importedAt) >= millis(cur.importedAt)) byChrono.set(key, p)
  }
  return [...byChrono.values(), ...others]
}

// Prix bon plan en vigueur par chrono
export function bonPlanByChrono(list) {
  const map = new Map()
  for (const p of latestBonPlans(list)) {
    const key = cleanRef(p.chrono)
    const prix = parsePrice(p.prixExcluTeam)
    if (key && prix != null) map.set(key, prix)
  }
  return map
}

// Le bon plan est déjà aussi avantageux que l'OP : le produit reste affiché mais grisé
export function isBonPlanBetter(p) {
  return p.prixBonPlan != null && p.prixOp != null && p.prixBonPlan <= p.prixOp
}

// Prix barré légal : si le produit a un prix bon plan, la remise se calcule à partir de lui
export function prixReference(p) {
  return p.prixBonPlan != null && !isBonPlanBetter(p) ? p.prixBonPlan : p.prixFort ?? null
}

export function remisePct(p) {
  const ref = prixReference(p)
  if (!ref || ref <= 0 || p.prixOp == null) return null
  return Math.round((1 - p.prixOp / ref) * 100)
}

// ── Préparation de l'import ─────────────────────────────────────────────────────

/**
 * Rapproche chaque ligne du fichier. Statuts :
 * - `found` : déclinaisons trouvées par identifiant, toutes importées ;
 * - `check` : trouvées par le nom, à cocher dans l'aperçu ;
 * - `outside` : hors vélo, importé sans vérifier le stock ;
 * - `missing` : vélo absent de la base, non importé.
 */
export function resolveLines(lines, catalogue) {
  const idx = buildCatalogueIndex(catalogue)
  return lines.map(line => {
    const { how, matches } = matchLine(line, idx)
    if (how && how !== 'nom') return { ...line, status: 'found', how, matches }
    if (!checksStock(line.segment)) return { ...line, status: 'outside', how: null, matches: [] }
    if (how === 'nom') return { ...line, status: 'check', how, matches }
    return { ...line, status: 'missing', how: null, matches: [] }
  })
}

// Identité d'un produit dans l'OP : son chrono, sinon sa référence et son nom
export function productKey(p) {
  const chrono = cleanRef(p.chrono)
  if (chrono) return `c:${chrono}`
  return `r:${cleanRef(p.refFournisseur || p.reference).replace(/\s/g, '')}|${normName(p.nom)}`
}

const COMPARED = ['nom', 'marque', 'segment', 'reference', 'refFournisseur', 'couleur', 'prixFort', 'prixOp', 'prixBonPlan', 'passExcluTeam']

/**
 * Écritures à faire. `selected[i]` : ids des déclinaisons cochées pour une ligne `check` ;
 * `bonPlan[i]` : la ligne passera en bon plan à la fin de l'OP.
 * Réimport : un produit déjà dans l'OP est mis à jour (prix…), les nouveaux sont ajoutés.
 * Renvoie une entrée par produit : { action: 'create' | 'update' | 'same', key, line, data, existing? }.
 */
export function planImport(resolved, { selected = {}, bonPlan = {}, bonPlans = new Map(), existing = [] } = {}) {
  const existingByKey = new Map(existing.map(p => [productKey(p), p]))
  const byKey = new Map()

  resolved.forEach((line, i) => {
    const variants = line.status === 'found' ? line.matches
      : line.status === 'check' ? line.matches.filter(m => selected[i]?.includes(m.id))
      : line.status === 'outside' ? [null]
      : []
    for (const m of variants) {
      const chrono = m ? cleanRef(m.chrono) || null : line.chrono || null
      const data = {
        nom:            line.nom || m?.nom || '',
        marque:         line.marque || m?.marque || null,
        segment:        line.segment || normSegment(m?.segment) || null,
        famille:        line.famille || m?.famille || null,
        reference:      m ? cleanRef(m.reference) || null : line.reference || null,
        refFournisseur: line.refFournisseur || null,
        chrono,
        couleur:        m?.couleur || line.couleur || null,
        prixFort:       line.prixFort ?? null,
        prixOp:         line.prixOp ?? null,
        prixBonPlan:    (chrono && bonPlans.get(chrono)) ?? null,
        passExcluTeam:  !!bonPlan[i],
        horsCatalogue:  !m,
      }
      byKey.set(productKey(data), { data, line: line.line }) // même déclinaison deux fois : la dernière ligne l'emporte
    }
  })

  return [...byKey].map(([key, { data, line }]) => {
    const prev = existingByKey.get(key)
    if (!prev) return { action: 'create', key, line, data }
    const same = COMPARED.every(f => (prev[f] ?? null) === (data[f] ?? null))
    return { action: same ? 'same' : 'update', key, line, data, existing: prev }
  })
}
