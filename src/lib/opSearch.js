// Opérations commerciales : visibilité selon le profil et recherche « ce vélo est-il en remise ? »
// pour les vendeurs. Fonctions pures (tests/unit/opSearch.test.mjs).
import { RAYON_TYPES } from './constants.js'
import { bonPlanKey, bonPlanPrices, cleanRef, isBonPlanBetter, latestBonPlans, normName, parsePrice, prixReference, remisePct } from './opImport.js'

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
 * `magasinId` : magasin affiché (choisi dans la barre du haut par l'acheteur et le directeur
 * général ; null = tous les magasins). Par défaut, celui du profil.
 * Règle commune à la page OP, à l'accueil, au bandeau d'infos et au calendrier.
 */
export function isOpVisibleFor(op, profile, magasinId = profile?.magasinId) {
  const rayons = opRayons(op)
  if (rayons.length && profile?.role !== 'directeurgen') {
    if (RAYON_TYPES.includes(profile?.role) && !rayons.includes(profile.role)) return false
    if (profile?.role === 'acheteur' && profile.rayons?.length && !rayons.some(r => profile.rayons.includes(r))) return false
  }
  if (op.magasinIds?.length && magasinId && !op.magasinIds.includes(magasinId)) return false
  return true
}

// Formulaire d'OP : message d'erreur, ou null si tout est bon
export function opFormError(form) {
  if (!form.nom.trim()) return 'Le nom est obligatoire.'
  if (!form.dateDebut || !form.dateFin) return 'Les dates de début et de fin sont obligatoires.'
  if (form.dateFin < form.dateDebut) return 'La date de fin doit être après la date de début.'
  return null
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
 * - `bonPlans` : ses prix bon plan actuels (carte fidélité), avec les chronos concernés ;
 * - `engages` : son prix engagé (base de données).
 * Chaque situation garde ses produits (`produits` / `items`) pour générer les ILV.
 * `produits` : produits des OP (avec `opId`) ; `bonPlanList` : collection des prix bon plan ;
 * `engageList` : produits de la base de données en prix engagé.
 */
export function buildPromoIndex({ ops, produits, bonPlanList = [], engageList = [], today = todayStr() }) {
  const opsById = new Map(ops.map(o => [o.id, o]))
  const bonPlanActuel = bonPlanPrices(bonPlanList)
  const groups = new Map()
  const byChrono = new Map()

  function groupFor(p) {
    const chrono = cleanRef(p.chrono)
    const key = (chrono && byChrono.get(chrono)) || groupKey(p)
    if (!groups.has(key)) {
      groups.set(key, { key, nom: p.nom || '', marque: p.marque || null, couleurs: [], refs: [], references: [], chronos: [], ops: [], bonPlans: [], engages: [] })
    }
    if (chrono && !byChrono.has(chrono)) byChrono.set(chrono, key)
    const g = groups.get(key)
    add(g.couleurs, p.couleur)
    add(g.refs, p.refFournisseur)
    add(g.references, p.reference)
    add(g.chronos, chrono)
    return g
  }

  for (const raw of produits) {
    const op = opsById.get(raw.opId)
    if (!op || raw.prixOp == null) continue
    // Comparaison avec le prix bon plan actuel (il a pu changer depuis l'import de l'OP)
    const actuel = bonPlanActuel.get(bonPlanKey(raw))
    const p = actuel != null ? { ...raw, prixBonPlan: actuel } : raw
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
        remise: remisePct(p), bonPlanBetter: isBonPlanBetter(p), futurBonPlan: false, couleurs: [], produits: [],
      }
      g.ops.push(s)
    }
    add(s.couleurs, p.couleur)
    s.produits.push({ ...p, dateDebut: op.dateDebut, dateFin: op.dateFin })
    if (p.passeBonPlan && !p.bonPlanTransfere) s.futurBonPlan = true
  }

  for (const b of latestBonPlans(bonPlanList)) {
    const prix = parsePrice(b.prixBonPlan)
    if (prix == null) continue
    const g = groupFor(b)
    const prixFort = parsePrice(b.prixFort)
    let s = g.bonPlans.find(x => x.prix === prix && x.prixFort === prixFort)
    if (!s) {
      s = { prix, prixFort, remise: prixFort > 0 ? Math.round((1 - prix / prixFort) * 100) : null, couleurs: [], chronos: [], items: [] }
      g.bonPlans.push(s)
    }
    add(s.couleurs, b.couleur)
    add(s.chronos, cleanRef(b.chrono))
    s.items.push(b)
  }

  for (const c of engageList) {
    const prix = parsePrice(c.prixEngage)
    if (prix == null) continue
    const g = groupFor(c)
    const prixFort = parsePrice(c.prixFort)
    let s = g.engages.find(x => x.prix === prix && x.prixFort === prixFort)
    if (!s) {
      s = { prix, prixFort, remise: prixFort > 0 ? Math.round((1 - prix / prixFort) * 100) : null, couleurs: [], items: [] }
      g.engages.push(s)
    }
    add(s.couleurs, c.couleur)
    s.items.push(c)
  }

  for (const g of groups.values()) {
    g.ops.sort((a, b) => (a.status === b.status ? a.op.dateDebut.localeCompare(b.op.dateDebut) : a.status === 'en_cours' ? -1 : 1))
    g.rank = g.engages.length || g.ops.some(s => s.status === 'en_cours') ? 0 : g.ops.length ? 1 : 2
    if (!g.refs.length) g.refs = g.references // réf. fournisseur de préférence, sinon références de la base
    g.text = normName([g.nom, g.marque, ...g.refs, ...g.references, ...g.chronos, ...g.couleurs].join(' '))
  }
  return [...groups.values()]
}

/**
 * Produits dont le texte contient tous les mots recherchés (sans tenir compte des accents),
 * ceux en prix engagé ou en OP en cours d'abord, puis à venir, puis en bon plan seulement.
 */
export function searchPromos(index, term) {
  const words = normName(term).split(' ').filter(Boolean)
  if (!words.length) return []
  return index
    .filter(g => words.every(w => g.text.includes(w)))
    .sort((a, b) => a.rank - b.rank || a.nom.localeCompare(b.nom, 'fr'))
}

// ── Fiche d'une OP ──────────────────────────────────────────────────────────────

const DAY = 86400000
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / DAY)
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

// « Commence dans 6 jours », « Se termine dans 2 jours », « Dernier jour », « Terminée depuis 3 jours »
export function opTiming(op, today = todayStr()) {
  if (op.dateDebut > today) {
    const n = daysBetween(today, op.dateDebut)
    return n === 1 ? 'Commence demain' : `Commence dans ${plural(n, 'jour')}`
  }
  if (op.dateFin < today) {
    const n = daysBetween(op.dateFin, today)
    return n === 1 ? 'Terminée hier' : `Terminée depuis ${plural(n, 'jour')}`
  }
  const n = daysBetween(today, op.dateFin)
  return n === 0 ? 'Dernier jour' : n === 1 ? 'Se termine demain' : `Se termine dans ${plural(n, 'jour')}`
}

/**
 * Résumé d'une OP : produits (déclinaisons) et modèles, remise maximale, produits qui passeront en bon plan
 * à la fin de l'OP (ou déjà passés) et produits dont le bon plan est déjà plus avantageux.
 */
export function opSummary(produits) {
  const remises = produits.map(p => (isBonPlanBetter(p) ? null : remisePct(p))).filter(r => r != null && r > 0)
  return {
    produits: produits.length,
    modeles: new Set(produits.map(p => normName(p.nom))).size,
    remiseMax: remises.length ? Math.max(...remises) : null,
    bonPlanFin: produits.filter(p => p.passeBonPlan && !p.bonPlanTransfere).length,
    bonPlanFaits: produits.filter(p => p.bonPlanTransfere).length,
    bonPlanMieux: produits.filter(isBonPlanBetter).length,
  }
}
