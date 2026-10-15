// Modèle calculé d'un budget, partagé par la page du budget et les statistiques : segments triés, totaux
// par segment et magasin (base, budget groupe, budget adapté, N-1, saisie…), marques par segment, fiches
// des fournisseurs (reprises des budgets précédents) et budget adapté.
import { useCallback, useMemo } from 'react'
import {
  addTotals, brandsBySegment, budgetRank, computeAdapte, computeTotals, fournisseurResolver, groupeRatio, groupeTotal,
  previousSeason, sortSegments, withAdapte,
} from './budgets'
import {
  useBrands, useBudget, useBudgetLines, useBudgetMagasins, useBudgetUnivers, useBudgets, useFiches, useFichesHistory,
  useFournisseurLiens, useNotationReglages,
} from './budgetsStore'

export function useBudgetModel(id) {
  const { budget, loading } = useBudget(id)
  const { list: lines } = useBudgetLines(id)
  const { list: brands } = useBrands()
  const { list: universList } = useBudgetUnivers()
  const { list: magasins } = useBudgetMagasins()
  const { list: budgets } = useBudgets()

  const segments = useMemo(() => sortSegments(budget?.segments || [], universList.map(u => u.nom)), [budget?.segments, universList])
  // Budget groupe : montant, ou % du N-1 total du budget, réparti au prorata de la base
  const sums = useMemo(() => {
    const t = computeTotals(segments, budget?.base, lines)
    const all = addTotals(segments.flatMap(s => magasins.map(m => t[s.id]?.[m.id])))
    return { n1: all.n1, base: all.base }
  }, [segments, budget?.base, lines, magasins])
  const groupeMontant = groupeTotal(budget?.groupe, sums.n1)
  const ratio = groupeRatio(groupeMontant, sums.base)
  const hasGroupe = ratio != null
  const rawTotals = useMemo(() => computeTotals(segments, budget?.base, lines, ratio), [segments, budget?.base, lines, ratio])
  const brandsBySeg = useMemo(() => brandsBySegment(brands, lines), [brands, lines])

  // Budget adapté. Fiches des fournisseurs : celles de ce budget, sinon la plus récente des budgets
  // précédents (les notes se reportent d'année en année sans ressaisie). Déclinaisons regroupées.
  const prevSeason = budget ? previousSeason(budget) : null
  const prev = prevSeason && budgets.find(b => b.saison === prevSeason.saison && b.annee === prevSeason.annee)
  const avant = useMemo(() => (budget ? budgets.filter(b => budgetRank(b) < budgetRank(budget))
    .sort((a, b) => budgetRank(b) - budgetRank(a)) : []), [budgets, budget])
  const { list: fiches } = useFiches(id)
  const history = useFichesHistory(avant)
  const { reglages } = useNotationReglages()
  const liens = useFournisseurLiens()
  const fiche = useCallback(key => {
    const f = fiches.find(x => x.id === key)
    if (f) return f
    for (const h of history) {
      const p = h.list.find(x => x.id === key)
      if (p) return { ...p, herite: true, source: h.budget.nom }
    }
    return null
  }, [fiches, history])
  const fournisseur = useMemo(() => fournisseurResolver([...brands, ...lines].map(b => b.nom || ''), liens), [brands, lines, liens])
  const adapte = useMemo(() => computeAdapte({
    segments, totals: rawTotals, brandsBySeg, magIds: magasins.map(m => m.id), fiche, reglages, hasGroupe, fournisseur,
  }), [segments, rawTotals, brandsBySeg, magasins, fiche, reglages, hasGroupe, fournisseur])
  const totals = useMemo(() => withAdapte(rawTotals, adapte.cells), [rawTotals, adapte])

  return {
    budget, loading, lines, brands, universList, magasins, budgets, segments, sums, groupeMontant, hasGroupe, brandsBySeg,
    prev, fiche, reglages, liens, fournisseur, adapte, totals,
  }
}
