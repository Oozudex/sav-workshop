// Code couleur des budgets : une couleur par notion, la même partout (cartes, colonnes, lignes).
// sticky : fond opaque de la 1re colonne figée d'une ligne colorée (row)
// N-1 gris · base bleu ciel · groupe indigo · adapté violet · engagé vert · prévisionnel ambre · dépassement rouge

export const TONE = {
  n1: { label: 'N-1', text: 'text-gray-600 dark:text-neutral-300', head: 'text-gray-500 dark:text-neutral-400', dot: 'bg-gray-400 dark:bg-neutral-500', row: 'bg-gray-50 dark:bg-neutral-800/40', bar: 'border-t-gray-300 dark:border-t-neutral-600' },
  base: { label: 'Budget de base', text: 'text-sky-700 dark:text-sky-400', head: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500', row: 'bg-sky-50 dark:bg-sky-500/10', sticky: '!bg-sky-50 dark:!bg-[#16252c]', bar: 'border-t-sky-500' },
  groupe: { label: 'Budget groupe', text: 'text-indigo-700 dark:text-indigo-400', head: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500', row: 'bg-indigo-50 dark:bg-indigo-500/10', sticky: '!bg-indigo-50 dark:!bg-[#1f1f2d]', bar: 'border-t-indigo-500' },
  saisie: { label: 'Saisi', text: 'text-gray-900 dark:text-white', head: 'text-gray-500 dark:text-neutral-400', dot: 'bg-gray-900 dark:bg-white', row: '', bar: 'border-t-gray-900 dark:border-t-white' },
  ok: { label: 'Tout est réparti', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', bar: 'border-t-emerald-500' },
  depassement: { label: 'Dépassement', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', bar: 'border-t-red-500' },
}

// Légende des couleurs affichée sous les cartes
export function Legend({ keys }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-neutral-300" aria-label="Légende des couleurs">
      {keys.map(k => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE[k].dot}`} />{TONE[k].label}
        </li>
      ))}
    </ul>
  )
}
