// Formulaire produit de la base de données : lecture et contrôle des saisies.
// Fonctions pures (tests/unit/catalogueForm.test.mjs).
import { SEGMENT_LABELS, cleanRef, normSegment, parsePrice, segmentFromInput } from './opImport.js'
import { sansPack } from './ilv.js'

// Segments de la base vélos (ILV) : vélo neuf ou presque parfait, ou « Autre segment » saisi à la main
export const CATALOGUE_SEGMENTS = ['velo', 'velo_pp']

// Segment enregistré : celui de la liste, ou l'autre segment saisi
export function effectiveSegment(form) {
  return form.autreSegment ? segmentFromInput(form.segmentLibre) : (form.segment || null)
}

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
    // Segment hors liste déjà enregistré (accessoires…) : affiché dans « Autre segment »
    autreSegment: !!produit?.segment && !CATALOGUE_SEGMENTS.includes(normSegment(produit.segment)),
    segmentLibre: produit?.segment && !CATALOGUE_SEGMENTS.includes(normSegment(produit.segment))
      ? (SEGMENT_LABELS[normSegment(produit.segment)] || produit.segment) : '',
    prixFort:    euro(produit?.prixFort),
    pack:        produit?.pack      || '',
    engage:      produit?.prixEngage != null,
    prixEngage:  euro(produit?.prixEngage),
    // Vélo presque parfait : toujours en prix bon plan
    bonPlan:     bonPlan != null || normSegment(produit?.segment) === 'velo_pp',
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
  const segment = effectiveSegment(form)
  if (form.autreSegment && !segment) errors.segment = 'Renseigne le segment'
  if (!form.pack && !sansPack(segment)) errors.pack = 'Choisis le pack de ce vélo'
  if (segment === 'velo_pp' && !form.bonPlan) errors.prixBonPlan = 'Vélo presque parfait : le prix bon plan est obligatoire'
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
  const segment = effectiveSegment(form)
  return {
    chrono:     cleanRef(form.chrono),
    reference:  cleanRef(form.reference) || null,
    nom:        form.nom.trim().toUpperCase(),
    marque:     form.marque.trim().toUpperCase() || null,
    couleur:    form.couleur.trim() || null,
    famille:    form.famille.trim() || null,
    segment,
    prixFort:   parsePrice(form.prixFort),
    pack:       sansPack(segment) ? null : form.pack || null, // pack optionnel réservé aux vélos
    presqueParfait: segment === 'velo_pp',
    prixEngage: form.engage ? parsePrice(form.prixEngage) : null,
  }
}

// Remise affichée à côté d'un prix spécial (-13)
export function remiseSur(prixFort, prix) {
  const f = parsePrice(prixFort), p = parsePrice(prix)
  return f > 0 && p != null && p < f ? Math.round((1 - p / f) * 100) : null
}
