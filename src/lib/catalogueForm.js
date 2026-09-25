// Formulaire produit de la base de données : lecture et contrôle des saisies.
// Fonctions pures (tests/unit/catalogueForm.test.mjs).
import { cleanRef, normSegment, parsePrice } from './opImport.js'

// Segments proposés dans le formulaire (mêmes valeurs que le filtre des prix bon plan)
export const CATALOGUE_SEGMENTS = ['velo_pp', 'velo', 'accessoires']

const euro = v => (v != null ? String(v).replace('.', ',') : '')

// Produit existant (ou vide) → valeurs du formulaire ; bonPlan : prix bon plan actuel du produit
export function catalogueFormValues(produit, bonPlan = null) {
  return {
    nom:         produit?.nom       || '',
    marque:      produit?.marque    || '',
    chrono:      produit?.chrono    || '',
    reference:   produit?.reference || '',
    couleur:     produit?.couleur   || '',
    famille:     produit?.famille   || '',
    segment:     CATALOGUE_SEGMENTS.includes(normSegment(produit?.segment)) ? normSegment(produit.segment) : '',
    prixFort:    euro(produit?.prixFort),
    pack:        produit?.pack      || '',
    engage:      produit?.prixEngage != null,
    prixEngage:  euro(produit?.prixEngage),
    bonPlan:     bonPlan != null,
    prixBonPlan: euro(bonPlan),
  }
}

/**
 * Erreurs par champ ({} si tout est bon).
 * produits : base actuelle, pour refuser un chrono déjà pris ; id : produit modifié.
 */
export function catalogueFormErrors(form, { produits = [], id = null } = {}) {
  const errors = {}
  const chrono = cleanRef(form.chrono)
  const prixFort = parsePrice(form.prixFort)
  if (!form.nom.trim()) errors.nom = 'Nom obligatoire'
  if (!chrono) errors.chrono = 'Chrono obligatoire'
  else if (produits.some(p => p.id !== id && cleanRef(p.chrono) === chrono)) errors.chrono = 'Ce chrono existe déjà'
  if (prixFort == null) errors.prixFort = 'Prix fort obligatoire'
  if (!form.pack && form.segment !== 'accessoires') errors.pack = 'Choisis le pack de ce vélo'
  for (const [flag, field, name] of [['engage', 'prixEngage', 'prix engagé'], ['bonPlan', 'prixBonPlan', 'prix bon plan']]) {
    if (!form[flag]) continue
    const prix = parsePrice(form[field])
    if (prix == null) errors[field] = `Renseigne le ${name}`
    else if (prixFort != null && prix >= prixFort) errors[field] = 'Doit être inférieur au prix fort'
  }
  return errors
}

// Valeurs du formulaire → document de la base de données
export function catalogueData(form) {
  return {
    chrono:     cleanRef(form.chrono),
    reference:  cleanRef(form.reference) || null,
    nom:        form.nom.trim().toUpperCase(),
    marque:     form.marque.trim().toUpperCase() || null,
    couleur:    form.couleur.trim() || null,
    famille:    form.famille.trim() || null,
    segment:    form.segment || null,
    prixFort:   parsePrice(form.prixFort),
    pack:       form.segment === 'accessoires' ? null : form.pack || null, // pas de pack pour les accessoires
    prixEngage: form.engage ? parsePrice(form.prixEngage) : null,
  }
}

// Remise affichée à côté d'un prix spécial (-13)
export function remiseSur(prixFort, prix) {
  const f = parsePrice(prixFort), p = parsePrice(prix)
  return f > 0 && p != null && p < f ? Math.round((1 - p / f) * 100) : null
}
