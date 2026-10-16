// Modèle calculé d'un budget (fonction pure) : segments triés, totaux par segment et magasin (base, budget
// groupe, budget adapté, N-1, saisie…), marques par segment, fiches des fournisseurs (reprises des budgets
// précédents) et budget adapté. Utilisé par la page du budget (useBudgetModel) et par la sauvegarde
// automatique côté serveur (Cloud Function), pour un même fichier Excel.
import {
  addTotals, brandsBySegment, budgetRank, computeAdapte, computeTotals, fournisseurResolver, groupeRatio, groupeTotal,
  previousSeason, sortSegments, withAdapte,
} from './budgets.js'

// Budgets précédents, du plus récent au plus ancien (fiches des fournisseurs reprises)
export function budgetsAvant(budgets, budget) {
  return budget ? budgets.filter(b => budgetRank(b) < budgetRank(budget)).sort((a, b) => budgetRank(b) - budgetRank(a)) : []
}

// fiches : fiches de ce budget ; history : [{ budget, list }] fiches des budgets précédents (budgetsAvant)
export function computeBudgetModel({ budget, lines, brands, universList, magasins, budgets, fiches, history, reglages, liens }) {
  const segments = sortSegments(budget?.segments || [], universList.map(u => u.nom))
  // Budget groupe : montant, ou % du N-1 total du budget, réparti au prorata de la base
  const t = computeTotals(segments, budget?.base, lines)
  const all = addTotals(segments.flatMap(s => magasins.map(m => t[s.id]?.[m.id])))
  const sums = { n1: all.n1, base: all.base }
  const groupeMontant = groupeTotal(budget?.groupe, sums.n1)
  const ratio = groupeRatio(groupeMontant, sums.base)
  const hasGroupe = ratio != null
  const rawTotals = computeTotals(segments, budget?.base, lines, ratio)
  const brandsBySeg = brandsBySegment(brands, lines)

  const prevSeason = budget ? previousSeason(budget) : null
  const prev = (prevSeason && budgets.find(b => b.saison === prevSeason.saison && b.annee === prevSeason.annee)) || null
  // Fiches : celles de ce budget, sinon la plus récente des budgets précédents (les notes se reportent
  // d'année en année sans ressaisie)
  const fiche = key => {
    const f = fiches.find(x => x.id === key)
    if (f) return f
    for (const h of history) {
      const p = h.list.find(x => x.id === key)
      if (p) return { ...p, herite: true, source: h.budget.nom }
    }
    return null
  }
  const fournisseur = fournisseurResolver([...brands, ...lines].map(b => b.nom || ''), liens)
  const adapte = computeAdapte({
    segments, totals: rawTotals, brandsBySeg, magIds: magasins.map(m => m.id), fiche, reglages, hasGroupe, fournisseur,
  })
  const totals = withAdapte(rawTotals, adapte.cells)
  return { segments, sums, groupeMontant, hasGroupe, brandsBySeg, prev, fiche, fournisseur, adapte, totals }
}
