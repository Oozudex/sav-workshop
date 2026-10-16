// Sauvegarde automatique d'un budget (Cloud Function sauvegardeBudgets) : le même fichier Excel que le
// bouton « Exporter (Excel) », à partir des données Firestore du budget. Ce module est regroupé avec
// xlsx dans functions/gen/budgetSauvegarde.js (scripts/build-functions-lib.mjs) au déploiement.
import { utils, write } from 'xlsx'
import { budgetsAvant, computeBudgetModel } from './budgetModel.js'
import { budgetWorkbook } from './budgetExport.js'
import { remplirClasseur } from './workbook.js'

export { budgetsAvant }

// data : { budget, lines, brands, universList, magasins, budgets, fiches, history, reglages, liens }
// → contenu du fichier .xlsx (Buffer)
export function budgetExcel(data) {
  const model = computeBudgetModel(data)
  const sheets = budgetWorkbook({
    budget: data.budget, segments: model.segments, magasins: data.magasins, totals: model.totals, brandsBySeg: model.brandsBySeg,
    adapte: model.adapte, fournisseur: model.fournisseur, fiche: model.fiche, hasGroupe: model.hasGroupe,
    groupeMontant: model.groupeMontant, reglages: data.reglages,
  })
  return write(remplirClasseur(utils, sheets), { type: 'buffer', bookType: 'xlsx', compression: true })
}
