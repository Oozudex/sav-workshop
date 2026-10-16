// Modèle calculé d'un budget pour la page du budget et les statistiques : données Firestore en temps réel
// passées au calcul commun (budgetModel.js, partagé avec la sauvegarde automatique).
import { useMemo } from 'react'
import { budgetsAvant, computeBudgetModel } from './budgetModel'
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
  const avant = useMemo(() => budgetsAvant(budgets, budget), [budgets, budget])
  const { list: fiches } = useFiches(id)
  const history = useFichesHistory(avant)
  const { reglages } = useNotationReglages()
  const liens = useFournisseurLiens()

  const model = useMemo(() => computeBudgetModel({ budget, lines, brands, universList, magasins, budgets, fiches, history, reglages, liens }),
    [budget, lines, brands, universList, magasins, budgets, fiches, history, reglages, liens])

  return { budget, loading, lines, brands, universList, magasins, budgets, reglages, liens, ...model }
}
