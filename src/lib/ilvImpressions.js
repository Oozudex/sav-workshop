// Historique d'impression des ILV : le vendeur prépare ses ILV sur son téléphone (« Envoyer à l'impression »)
// et les imprime toutes d'un coup sur son ordinateur, avec le même compte. Fonctions pures
// (tests/unit/ilvImpressions.test.mjs).
import { toMs } from './todos.js'

export const IMPRESSION_COLLECTION = 'ilv_impressions'
export const IMPRESSION_RETENTION_JOURS = 7 // ILV imprimées gardées 7 jours (réimpression possible)

// Champs du produit gardés avec l'envoi (les données à jour sont reprises de la base à l'impression)
const SOURCE_FIELDS = ['chrono', 'refFournisseur', 'nom', 'marque', 'reference', 'couleur', 'segment', 'famille',
  'presqueParfait', 'prixFort', 'prixOp', 'prixBonPlan', 'dateDebut', 'dateFin', 'pack', 'label']

/**
 * Document d'un envoi à l'impression. source : la déclinaison choisie dans la fenêtre ILV ;
 * choix : { type, duree, oney, packChoisi }.
 */
export function impressionData({ uid, magasinId = null, source, choix }) {
  const produit = {}
  for (const k of SOURCE_FIELDS) if (source[k] !== undefined && source[k] !== null && source[k] !== '') produit[k] = source[k]
  return {
    uid, magasinId: magasinId || null, source: produit,
    type: choix.type, duree: choix.duree === 2 ? 2 : 1,
    oney: choix.type === 'normal' && [3, 4].includes(choix.oney) ? choix.oney : null,
    packChoisi: choix.packChoisi || null,
    imprimeAt: null,
  }
}

// Envois → sources pour enrichIlvSources (la clé est l'identifiant de l'envoi)
export function impressionSources(impressions) {
  return impressions.map(i => ({ ...i.source, key: i.id }))
}

// À imprimer (plus anciens d'abord) et déjà imprimés (plus récents d'abord)
export function trierImpressions(impressions) {
  const aImprimer = impressions.filter(i => !i.imprimeAt).sort((a, b) => toMs(a.envoyeAt) - toMs(b.envoyeAt))
  const imprimees = impressions.filter(i => i.imprimeAt).sort((a, b) => toMs(b.imprimeAt) - toMs(a.imprimeAt))
  return { aImprimer, imprimees }
}

// ILV imprimées depuis plus de 7 jours : supprimées
export function impressionsExpirees(impressions, now = Date.now()) {
  const limite = now - IMPRESSION_RETENTION_JOURS * 86400000
  return impressions.filter(i => i.imprimeAt && toMs(i.imprimeAt) && toMs(i.imprimeAt) < limite)
}
