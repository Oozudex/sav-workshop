// Données d'une ILV : produits complétés avec la base de données (prix fort, pack, prix engagé, référence)
// et le prix bon plan en vigueur. Utilisé par la fenêtre ILV et le téléchargement de toutes les ILV d'une OP.
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { BON_PLAN_COLLECTION, bonPlanDocId } from './bonPlan'
import { cleanRef } from './opImport'

/**
 * Complète les produits avec la base de données (prix fort, pack, prix engagé, référence) et le prix
 * bon plan en vigueur. Une source : { key, label, chrono, refFournisseur, nom, marque, reference,
 * prixFort, pack, prixOp, prixBonPlan, dateDebut, dateFin }.
 */
export async function enrichIlvSources(sources) {
  const chronos = [...new Set(sources.map(s => cleanRef(s.chrono)).filter(Boolean))]
  const catalogue = new Map()
  for (let i = 0; i < chronos.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'catalogue_produits'), where('chrono', 'in', chronos.slice(i, i + 30))))
    snap.docs.forEach(d => catalogue.set(cleanRef(d.get('chrono')), d.data()))
  }
  const bonPlans = new Map(await Promise.all(sources.map(async s => {
    const id = bonPlanDocId(s)
    const snap = id ? await getDoc(doc(db, BON_PLAN_COLLECTION, id)) : null
    return [s.key, snap?.exists() ? snap.data() : null]
  })))
  return sources.map(s => {
    const cat = catalogue.get(cleanRef(s.chrono)) || {}
    const bp = bonPlans.get(s.key)
    return {
      ...s,
      nom:         cat.nom || s.nom,
      marque:      s.marque || cat.marque,
      reference:   cat.reference || s.reference,
      couleur:     s.couleur || cat.couleur,
      segment:     cat.segment || s.segment || null,
      presqueParfait: cat.presqueParfait ?? s.presqueParfait ?? false,
      prixFort:    s.prixFort ?? cat.prixFort ?? bp?.prixFort ?? null,
      pack:        cat.pack || s.pack || null,
      prixEngage:  cat.prixEngage ?? null,
      prixBonPlan: bp?.prixBonPlan ?? s.prixBonPlan ?? null,
    }
  })
}

