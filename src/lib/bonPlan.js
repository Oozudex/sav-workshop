// Prix bon plan : prix réservés aux porteurs de la carte fidélité. Un document par chrono
// (identifiant = chrono), ce qui empêche les doublons à l'import et au transfert de fin d'OP.
// Fonctions pures (tests/unit/bonPlan.test.mjs).
import { bonPlanKey, cleanRef, cleanText, normHeader, parsePrice } from './opImport.js'

export const BON_PLAN_COLLECTION = 'prix_bon_plan'

// Identifiant du document : le chrono, sinon la réf. fournisseur (articles hors base vélos)
export function bonPlanDocId(p) {
  return bonPlanKey(p)?.replace(/\//g, '_') ?? null
}

export function remiseBonPlan(p) {
  const fort = parsePrice(p.prixFort), prix = parsePrice(p.prixBonPlan)
  return fort > 0 && prix != null ? Math.round((1 - prix / fort) * 100) : null
}

const HEADER_FIELDS = {
  'nom': 'nom', 'produit': 'nom', 'article': 'nom', 'designation': 'nom',
  'marque': 'marque', 'brand': 'marque',
  'chrono': 'chrono',
  'segment': 'segment',
  'prix fort': 'prixFort',
  'prix bon plan': 'prixBonPlan', 'bon plan': 'prixBonPlan', 'prix promo': 'prixBonPlan',
  'prix exclu team': 'prixBonPlan', 'prix promo exclu': 'prixBonPlan', // anciens fichiers
}

/**
 * Fichier Excel des prix bon plan → un prix par chrono (la dernière ligne l'emporte).
 * Renvoie { rows, skipped, error } ; `skipped` : lignes sans chrono ou sans prix bon plan.
 */
export function parseBonPlanSheet(rows) {
  const headerIdx = rows.slice(0, 10).findIndex(r => {
    const fields = (r || []).map(h => HEADER_FIELDS[normHeader(h)])
    return fields.includes('chrono') && fields.includes('prixBonPlan')
  })
  if (headerIdx < 0) return { rows: [], skipped: 0, error: 'En-têtes introuvables : il faut au moins les colonnes « Chrono » et « Prix bon plan ».' }

  const fieldMap = rows[headerIdx].map(h => HEADER_FIELDS[normHeader(h)] || null)
  const byChrono = new Map()
  let skipped = 0
  for (const row of rows.slice(headerIdx + 1)) {
    const r = {}
    fieldMap.forEach((field, j) => {
      if (!field || r[field] != null) return
      const raw = row?.[j]
      if (field === 'prixFort' || field === 'prixBonPlan') r[field] = parsePrice(raw)
      else if (field === 'chrono') r[field] = cleanRef(raw) || null
      else r[field] = cleanText(raw) || null
    })
    if (!Object.values(r).some(v => v != null)) continue
    if (!r.chrono || r.prixBonPlan == null) { skipped++; continue }
    byChrono.set(r.chrono, r)
  }
  return { rows: [...byChrono.values()], skipped, error: byChrono.size ? null : 'Aucune ligne avec un chrono et un prix bon plan.' }
}

/**
 * Fin d'OP : produits cochés « passe en bon plan » et pas encore transférés → prix bon plan.
 * Renvoie { docs: [{ id, data }], produitIds, skipped } ; `skipped` : produits sans chrono ni réf.
 */
export function bonPlanTransfer(produits, opId) {
  const docs = new Map(), produitIds = [], skipped = []
  for (const p of produits) {
    if (!p.passeBonPlan || p.bonPlanTransfere || p.prixOp == null) continue
    const id = bonPlanDocId(p)
    if (!id) { skipped.push(p); continue }
    docs.set(id, {
      chrono:         cleanRef(p.chrono) || null,
      refFournisseur: p.refFournisseur || null,
      nom:            p.nom || '',
      marque:         p.marque || null,
      segment:        p.segment || null,
      couleur:        p.couleur || null,
      prixFort:       p.prixFort ?? null,
      prixBonPlan:    p.prixOp,
      sourceOpId:     opId,
    })
    produitIds.push(p.id)
  }
  return { docs: [...docs].map(([id, data]) => ({ id, data })), produitIds, skipped }
}
