// Classement des B2B et des services par univers (champ univers : noms des univers des budgets).
// Sans univers : commun à tous. Fonctions pures (tests/unit/universFilter.test.mjs).

export const FILTRE_MES_UNIVERS = '*mine'
export const FILTRE_TOUS = ''

export const universOf = item => item?.univers || []

// Filtre par défaut : un acheteur qui a des univers attitrés voit les siens, les autres voient tout
export function defaultUniversFilter(profile) {
  return profile?.role === 'acheteur' && profile.univers?.length ? FILTRE_MES_UNIVERS : FILTRE_TOUS
}

// Éléments affichés : les communs, plus ceux de l'univers choisi (ou des univers de l'acheteur)
export function filterByUnivers(items, filtre, mesUnivers = []) {
  if (!filtre) return items
  const wanted = filtre === FILTRE_MES_UNIVERS ? mesUnivers : [filtre]
  return items.filter(i => !universOf(i).length || universOf(i).some(u => wanted.includes(u)))
}

// Univers proposés dans le filtre : ceux utilisés par les éléments, triés
export function universOptions(items) {
  return [...new Set(items.flatMap(universOf))].sort((a, b) => a.localeCompare(b, 'fr'))
}
