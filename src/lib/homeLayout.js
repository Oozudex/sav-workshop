// Rangement de l'accueil selon le compte. Fonctions pures (tests/unit/homeLayout.test.mjs).
// - Comptes rayon : tous leurs outils, directement.
// - Directeurs de magasin, acheteurs, direction : les outils d'un rayon sont regroupés dans une carte
//   « espace » (ex. Vélo) dès que le rayon en compte au moins deux ; puis les cartes « lead » (Budgets),
//   puis les outils communs.
import { RAYON_TYPES } from './constants.js'

// Outil visible : rôle autorisé (null = tout le monde) et, pour un acheteur, un de ses services
export function canSeeSection(section, profile) {
  if (section.roles !== null && !section.roles.includes(profile?.role)) return false
  if (profile?.role === 'acheteur' && section.acheteurRayons) {
    return section.acheteurRayons.some(r => (profile.rayons || []).includes(r))
  }
  return true
}

export function groupTools(sections, group, profile) {
  return sections.filter(s => s.group === group && canSeeSection(s, profile))
}

// Cartes de l'accueil : { type: 'tool', section } ou { type: 'group', group, tools }
export function arrangeHome(sections, groupKeys, profile) {
  const visible = sections.filter(s => canSeeSection(s, profile))
  if (RAYON_TYPES.includes(profile?.role)) return visible.map(section => ({ type: 'tool', section }))

  const cards = []
  for (const group of groupKeys) {
    const tools = visible.filter(s => s.group === group)
    if (tools.length >= 2) cards.push({ type: 'group', group, tools })
    else cards.push(...tools.map(section => ({ type: 'tool', section })))
  }
  const others = visible.filter(s => !s.group || !groupKeys.includes(s.group))
  return [
    ...cards,
    ...others.filter(s => s.lead).map(section => ({ type: 'tool', section })),
    ...others.filter(s => !s.lead).map(section => ({ type: 'tool', section })),
  ]
}
