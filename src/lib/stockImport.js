// Base de données des vélos (Opérations commerciales) : lecture de l'état de stock Excel.
// Un vélo par chrono (le fichier a une ligne par magasin), prix fort = prix de vente magasin,
// noms et couleurs nettoyés, vélos « presque parfaits » repérés, pack déduit de la famille.
// Fonctions pures (tests/unit/stockImport.test.mjs).
import { cleanRef, cleanText, normHeader, normSegment, parsePrice } from './opImport.js'

const HEADER_FIELDS = {
  'univers': 'univers', 'segment': 'segmentFichier', 'famille': 'famille',
  'sous-famille': 'sousFamille', 'sous famille': 'sousFamille', 'us-fami': 'sousFamille',
  'marque': 'marque', 'chrono': 'chrono',
  'ref': 'reference', 'reference': 'reference',
  'modele': 'nom', 'designation': 'nom', 'article': 'nom', 'libelle': 'nom',
  'couleur': 'couleur', 'coloris': 'couleur',
  'velos presque parfaits': 'presqueParfait', 'presque parfait': 'presqueParfait',
  'qtstkfin': 'stock', 'stock': 'stock', 'total': 'stock', 'stk': 'stock',
  'pv mag': 'prixFort', 'prix de vente': 'prixFort', 'pv': 'prixFort', 'prix fort': 'prixFort',
}

const PP_TAG = /\s*"?\s*presque\s+parfaits?\s*"?\s*/i

// « CLIFF 700 "PRESQUE PARFAIT" » → « CLIFF 700 »
export function cleanNom(v) {
  return cleanText(String(v ?? '').replace(PP_TAG, ' ')).toUpperCase()
}

function isSubsequence(small, word) {
  let i = 0
  for (const c of word) if (c === small[i]) i++
  return i === small.length
}

// Code fournisseur en tête de couleur : « SNS SNS … », « 00017Z NOIR », « IV IVORY », « VYN VIOLET-YELLOW-NOIR »
function isColorCode(token, rest) {
  if (!rest.length) return false
  if (/\d/.test(token) && token.length <= 8) return true
  if (!/^[A-Z]{2,3}$/.test(token)) return false
  const parts = rest.join(' ').split(/[\s-]+/).filter(Boolean)
  const first = parts[0] || ''
  if (token === rest[0]) return true
  if (first.startsWith(token)) return true
  if (token.length === 3 && isSubsequence(token, first)) return true
  return parts.length === token.length && parts.length >= 2
}

export function cleanCouleur(v) {
  let words = cleanText(v).toUpperCase().replace(/\s*([-/])\s*/g, '$1').split(' ').filter(Boolean)
  while (words.length > 1 && isColorCode(words[0], words.slice(1))) words = words.slice(1)
  return words.join(' ')
}

// Pack optionnel : électrique (59,99 €) pour toute la gamme électrique, enfant (9,99 €) pour
// les vélos enfant (junior, jouet), sinon à renseigner par l'acheteur
export function packPourFamille(famille) {
  const f = cleanText(famille).toUpperCase()
  if (/ELECTRIQUE|ÉLECTRIQUE|VAE/.test(f)) return 'electrique'
  if (/JUNIOR|JOUET|ENFANT/.test(f)) return 'enfant'
  return null
}

const isYes = v => /^(oui|o|x|yes|1|pp)$/i.test(cleanText(v))

/**
 * Lignes du fichier (tableau de tableaux) → { produits, ecartes, lignesIgnorees, error }.
 * produits : un par chrono ; ecartes : vélos sans stock (total ≤ 0) ; lignesIgnorees : lignes sans chrono.
 */
export function parseStockSheet(rows) {
  const headerIdx = rows.slice(0, 10).findIndex(r => {
    const fields = (r || []).map(h => HEADER_FIELDS[normHeader(h)])
    return fields.includes('chrono') && fields.includes('nom')
  })
  if (headerIdx < 0) return { produits: [], ecartes: [], lignesIgnorees: 0, error: 'En-têtes introuvables : il faut au moins les colonnes « Chrono » et « Modèle ».' }

  const fieldMap = rows[headerIdx].map(h => HEADER_FIELDS[normHeader(h)] || null)
  const hasStock = fieldMap.includes('stock')
  const byChrono = new Map()
  let lignesIgnorees = 0

  for (const row of rows.slice(headerIdx + 1)) {
    const r = {}
    fieldMap.forEach((field, j) => { if (field && r[field] == null) r[field] = row?.[j] })
    const chrono = cleanRef(r.chrono)
    if (!chrono) {
      if (Object.values(r).some(v => cleanText(v))) lignesIgnorees++
      continue
    }
    if (!byChrono.has(chrono)) byChrono.set(chrono, { chrono, stock: 0, pp: false, prixFort: null })
    const p = byChrono.get(chrono)
    for (const f of ['univers', 'famille', 'sousFamille', 'marque', 'reference', 'nom', 'couleur']) {
      if (!p[f] && cleanText(r[f])) p[f] = r[f]
    }
    if (p.prixFort == null) p.prixFort = parsePrice(r.prixFort)
    if (isYes(r.presqueParfait) || PP_TAG.test(String(r.nom ?? ''))) p.pp = true
    p.stock += parsePrice(r.stock) || 0
  }

  const produits = [], ecartes = []
  for (const p of byChrono.values()) {
    const produit = {
      chrono: p.chrono,
      reference: cleanRef(p.reference) || null,
      nom: cleanNom(p.nom),
      marque: cleanText(p.marque).toUpperCase() || null,
      couleur: cleanCouleur(p.couleur) || null,
      famille: cleanText(p.famille).toUpperCase() || null,
      sousFamille: cleanText(p.sousFamille).toUpperCase() || null,
      segment: p.pp ? 'velo_pp' : 'velo',
      presqueParfait: p.pp,
      prixFort: p.prixFort > 0 ? p.prixFort : null,
      pack: packPourFamille(p.famille),
      stock: Math.round(p.stock),
    }
    if (hasStock && produit.stock <= 0) ecartes.push(produit)
    else produits.push(produit)
  }
  produits.sort((a, b) => (a.marque || '').localeCompare(b.marque || '', 'fr') || a.nom.localeCompare(b.nom, 'fr'))
  return {
    produits, ecartes, lignesIgnorees,
    error: produits.length ? null : 'Aucun vélo en stock trouvé sous la ligne d’en-têtes.',
  }
}

// Résumé affiché avant l'import
export function stockSummary(produits) {
  return {
    total: produits.length,
    presqueParfaits: produits.filter(p => p.presqueParfait).length,
    sansPrix: produits.filter(p => p.prixFort == null).length,
    packEnfant: produits.filter(p => p.pack === 'enfant').length,
    packElectrique: produits.filter(p => p.pack === 'electrique').length,
    packARenseigner: produits.filter(p => !p.pack).length,
  }
}

/**
 * Données écrites pour un vélo du fichier. existing : document actuel (ou null).
 * Le prix fort suit le fichier (s'il y en a un) ; le prix engagé et un pack déjà choisi sont conservés.
 */
export function stockImportData(produit, existing) {
  const { stock: _stock, pack, prixFort, ...rest } = produit
  return {
    ...rest,
    ...(prixFort != null || !existing ? { prixFort } : {}),
    ...(existing?.pack ? {} : { pack }),
  }
}

// ── Export Excel de la base ─────────────────────────────────────────────────
const PACK_EXPORT = { enfant: 'Enfant', classique: 'Classique', sport: 'Sport', electrique: 'Électrique' }

/**
 * Lignes de la base ({ v: vélo, bp: prix bon plan éventuel }) → tableau Excel, en-têtes compris.
 * Les en-têtes sont ceux de l'import : le fichier exporté peut être réimporté tel quel.
 */
export function catalogueExportTable(items) {
  const num = v => parsePrice(v) ?? ''
  return [
    ['Chrono', 'Réf', 'Modèle', 'Marque', 'Couleur', 'Famille', 'Sous-Famille', 'Vélos presque parfaits', 'Prix fort', 'Pack', 'Prix engagé', 'Prix bon plan'],
    ...items.map(({ v, bp }) => [
      v.chrono || '', v.reference || '', v.nom || '', v.marque || '', v.couleur || '', v.famille || '', v.sousFamille || '',
      normSegment(v.segment) === 'velo_pp' ? 'OUI' : '',
      num(v.prixFort ?? bp?.prixFort), PACK_EXPORT[v.pack] || '', num(v.prixEngage), num(bp?.prixBonPlan),
    ]),
  ]
}
