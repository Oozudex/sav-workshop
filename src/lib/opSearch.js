// Opérations commerciales : visibilité selon le profil et recherche « ce vélo est-il en remise ? »
// pour les vendeurs. Fonctions pures (tests/unit/opSearch.test.mjs).
import { RAYON_TYPES } from './constants.js'
import { cleanRef, isBonPlanBetter, latestBonPlans, normName, parsePrice, prixReference, remisePct } from './opImport.js'

// Date du jour au format des OP (AAAA-MM-JJ, heure locale)
export function todayStr(now = new Date()) {
  return now.toLocaleDateString('fr-CA')
}

export function opStatus(op, today = todayStr()) {
  if (op.dateFin < today) return 'terminee'
  if (op.dateDebut > today) return 'a_venir'
  return 'en_cours'
}

export function opRayons(op) {
  return op.rayonTypes?.length ? op.rayonTypes : op.rayonType ? [op.rayonType] : []
}

/**
 * Une OP ciblée sur des rayons ou des magasins n'est visible que d'eux :
 * - vendeur : son rayon et son magasin ;
 * - acheteur : les rayons qu'il suit ;
 * - directeur de magasin : son magasin ; directeur général : tout.
 */
export function isOpVisibleFor(op, profile) {
  const rayons = opRayons(op)
  if (rayons.length && profile?.role !== 'directeurgen') {
    if (RAYON_TYPES.includes(profile?.role) && !rayons.includes(profile.role)) return false
    if (profile?.role === 'acheteur' && profile.rayons?.length && !rayons.some(r => profile.rayons.includes(r))) return false
  }
  if (op.magasinIds?.length && profile?.magasinId && !op.magasinIds.includes(profile.magasinId)) return false
  return true
}

// ── Recherche ───────────────────────────────────────────────────────────────────

function add(list, v) {
  if (v && !list.includes(v)) list.push(v)
}

function groupKey(p) {
  return `${normName(p.nom)}|${normName(p.marque)}`
}

/**
 * Regroupe par produit (nom + marque, ou même chrono) tout ce qui concerne son prix :
 * - `ops` : ses OP en cours ou à venir (prix barré, prix OP, remise, futur bon plan) ;
 * - `bonPlans` : ses prix bon plan actuels (carte fidélité), avec les chronos concernés.
 * `produits` : produits des OP (avec `opId`) ; `bonPlanList` : collection des prix bon plan.
 */
export function buildPromoIndex({ ops, produits, bonPlanList = [], today = todayStr() }) {
  const opsById = new Map(ops.map(o => [o.id, o]))
  const groups = new Map()
  const byChrono = new Map()

  function groupFor(p) {
    const chrono = cleanRef(p.chrono)
    const key = (chrono && byChrono.get(chrono)) || groupKey(p)
    if (!groups.has(key)) {
      groups.set(key, { key, nom: p.nom || '', marque: p.marque || null, couleurs: [], refs: [], references: [], chronos: [], ops: [], bonPlans: [] })
    }
    if (chrono && !byChrono.has(chrono)) byChrono.set(chrono, key)
    const g = groups.get(key)
    add(g.couleurs, p.couleur)
    add(g.refs, p.refFournisseur)
    add(g.references, p.reference)
    add(g.chronos, chrono)
    return g
  }

  for (const p of produits) {
    const op = opsById.get(p.opId)
    if (!op || p.prixOp == null) continue
    const status = opStatus(op, today)
    if (status === 'terminee') continue
    const g = groupFor(p)
    const prixRef = prixReference(p)
    const id = `${op.id}|${p.prixOp}|${prixRef}`
    let s = g.ops.find(x => x.id === id)
    if (!s) {
      s = {
        id, status, op: { id: op.id, nom: op.nom, dateDebut: op.dateDebut, dateFin: op.dateFin },
        prixOp: p.prixOp, prixRef, prixFort: p.prixFort ?? null, refIsBonPlan: prixRef != null && prixRef === p.prixBonPlan,
        remise: remisePct(p), bonPlanBetter: isBonPlanBetter(p), futurBonPlan: false, couleurs: [],
      }
      g.ops.push(s)
    }
    add(s.couleurs, p.couleur)
    if (p.passeBonPlan && !p.bonPlanTransfere) s.futurBonPlan = true
  }

  for (const b of latestBonPlans(bonPlanList)) {
    const prix = parsePrice(b.prixBonPlan)
    if (prix == null) continue
    const g = groupFor(b)
    const prixFort = parsePrice(b.prixFort)
    let s = g.bonPlans.find(x => x.prix === prix && x.prixFort === prixFort)
    if (!s) {
      s = { prix, prixFort, remise: prixFort > 0 ? Math.round((1 - prix / prixFort) * 100) : null, couleurs: [], chronos: [] }
      g.bonPlans.push(s)
    }
    add(s.couleurs, b.couleur)
    add(s.chronos, cleanRef(b.chrono))
  }

  for (const g of groups.values()) {
    g.ops.sort((a, b) => (a.status === b.status ? a.op.dateDebut.localeCompare(b.op.dateDebut) : a.status === 'en_cours' ? -1 : 1))
    g.rank = g.ops.some(s => s.status === 'en_cours') ? 0 : g.ops.length ? 1 : 2
    if (!g.refs.length) g.refs = g.references // réf. fournisseur de préférence, sinon références de la base
    g.text = normName([g.nom, g.marque, ...g.refs, ...g.references, ...g.chronos, ...g.couleurs].join(' '))
  }
  return [...groups.values()]
}

/**
 * Produits dont le texte contient tous les mots recherchés (sans tenir compte des accents),
 * ceux en OP en cours d'abord, puis à venir, puis en bon plan seulement.
 */
export function searchPromos(index, term) {
  const words = normName(term).split(' ').filter(Boolean)
  if (!words.length) return []
  return index
    .filter(g => words.every(w => g.text.includes(w)))
    .sort((a, b) => a.rank - b.rank || a.nom.localeCompare(b.nom, 'fr'))
}
