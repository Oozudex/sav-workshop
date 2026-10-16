// Couleur du classement de la marge % et du taux de sortie entre lignes du même niveau (ex. les magasins), sans rapport
// avec l'évolution N-1 (vert / rouge) : dégradé bleu (meilleurs) → jaune (moyenne) → orange (moins bons),
// 5 nuances selon t (1 = meilleur, 0 = moins bon).
export const RANG = [
  { cls: 'bg-orange-200 text-orange-950 dark:bg-orange-500/40 dark:text-orange-50', label: 'parmi les moins bons' },
  { cls: 'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200', label: 'plutôt moins bon' },
  { cls: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-100', label: 'dans la moyenne' },
  { cls: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200', label: 'plutôt meilleur' },
  { cls: 'bg-sky-200 text-sky-950 dark:bg-sky-500/40 dark:text-sky-50', label: 'parmi les meilleurs' },
]
export const rangNuance = t => RANG[Math.min(RANG.length - 1, Math.floor(t * RANG.length))]
export const rangTexte = ({ pos, k }) => `${pos === 1 ? '1er' : `${pos}e`} sur ${k}`
