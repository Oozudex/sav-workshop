// Équipe d'un rayon (tests/unit/equipe.test.mjs).

/**
 * Un seul membre dans l'équipe : son nom, présélectionné dans les listes « Créé par », « Auteur »,
 * « Vendeur »… des nouvelles saisies. Dès qu'il y a deux membres, on choisit comme avant ('').
 * membres : [{ nom }] ou noms.
 */
export function membreUnique(membres) {
  if (!Array.isArray(membres) || membres.length !== 1) return ''
  const m = membres[0]
  return (typeof m === 'string' ? m : m?.nom) || ''
}
