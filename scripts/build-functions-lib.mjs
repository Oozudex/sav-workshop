// Regroupe le code partagé avec le site (export Excel des budgets) dans functions/gen/ pour les Cloud
// Functions : lancé avant chaque déploiement des fonctions (firebase.json, predeploy) et avant les tests.
import { build } from 'rolldown'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
await build({
  input: `${root}src/lib/budgetSauvegarde.js`,
  platform: 'node',
  output: { file: `${root}functions/gen/budgetSauvegarde.js`, format: 'esm' },
  logLevel: 'warn',
})
console.log('functions/gen/budgetSauvegarde.js prêt')
