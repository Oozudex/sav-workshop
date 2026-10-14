// Ajout manuel de vélos dans une OP depuis la base de données (catalogue_produits) : recherche,
// vélos déjà dans l'OP et produits créés. Fonctions pures : tests/unit/opAjoutBase.test.mjs
import { cleanRef, normName, normSegment, productKey } from './opImport.js'

export const RECHERCHE_MIN = 2
export const GROUPES_MAX = 12

const texteCherche = p => normName([p.nom, p.marque, p.chrono, p.reference, p.couleur, p.famille].filter(Boolean).join(' '))

/**
 * Vélos de la base dont le texte contient tous les mots cherchés (sans accents ni majuscules),
 * regroupés par modèle (marque + nom), déclinaisons triées par couleur.
 * → { groupes: [{ key, nom, marque, variantes }], total } (total : nombre de modèles trouvés)
 */
export function rechercherBase(catalogue, recherche, { limite = GROUPES_MAX } = {}) {
  const q = normName(recherche)
  if (q.length < RECHERCHE_MIN) return { groupes: [], total: 0 }
  const mots = q.split(/\s+/).filter(Boolean)
  const parModele = new Map()
  for (const p of catalogue || []) {
    if (!mots.every(m => texteCherche(p).includes(m))) continue
    const key = `${normName(p.marque)}|${normName(p.nom)}`
    if (!parModele.has(key)) parModele.set(key, { key, nom: p.nom, marque: p.marque || null, variantes: [] })
    parModele.get(key).variantes.push(p)
  }
  const fr = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr')
  const groupes = [...parModele.values()].sort((a, b) => fr(a.marque, b.marque) || fr(a.nom, b.nom))
  groupes.forEach(g => g.variantes.sort((a, b) => fr(a.couleur, b.couleur) || fr(a.chrono, b.chrono)))
  return { groupes: groupes.slice(0, limite), total: groupes.length }
}

// Vélo de la base déjà dans l'OP (même chrono, sinon même référence et même nom)
export function clesOp(produitsOp) {
  return new Set((produitsOp || []).map(productKey))
}
export const dejaDansOp = (velo, cles) => cles.has(productKey(velo))

/**
 * Produits à créer dans l'OP pour les vélos choisis : un prix OP commun, prix fort de la base
 * (ou saisi pour ce vélo : prixForts[id]). Renvoie les données de chaque document.
 */
export function produitsDepuisBase(velos, { prixOp, prixForts = {} }) {
  return velos.map(v => ({
    nom: String(v.nom || '').trim(),
    marque: v.marque || null,
    reference: cleanRef(v.reference) || null,
    refFournisseur: null,
    chrono: cleanRef(v.chrono) || null,
    couleur: v.couleur || null,
    segment: normSegment(v.segment) || 'velo',
    famille: v.famille || null,
    prixFort: prixForts[v.id] ?? (v.prixFort > 0 ? v.prixFort : null),
    prixOp,
    // Comme un vélo importé et trouvé dans la base : pas de passage en bon plan coché d'office
    passeBonPlan: false,
    horsCatalogue: false,
  }))
}
