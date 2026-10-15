// Code couleur des budgets : une couleur par notion, la même partout (cartes, colonnes, lignes).
// sticky : fond opaque de la 1re colonne figée d'une ligne colorée (row)
// input : fond d'un champ saisi (engagé / prévisionnel)
// N-1 gris · base bleu ciel · groupe indigo · adapté violet · engagé vert · prévisionnel ambre · dépassement rouge

export const TONE = {
  n1: { label: 'N-1', text: 'text-gray-600 dark:text-neutral-300', head: 'text-gray-500 dark:text-neutral-400', dot: 'bg-gray-400 dark:bg-neutral-500', row: 'bg-gray-50 dark:bg-neutral-800/40', bar: 'border-t-gray-300 dark:border-t-neutral-600' },
  base: { label: 'Budget de base', text: 'text-sky-700 dark:text-sky-400', head: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500', row: 'bg-sky-50 dark:bg-sky-500/10', sticky: '!bg-sky-50 dark:!bg-[#16252c]', bar: 'border-t-sky-500' },
  groupe: { label: 'Budget groupe', text: 'text-indigo-700 dark:text-indigo-400', head: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500', row: 'bg-indigo-50 dark:bg-indigo-500/10', sticky: '!bg-indigo-50 dark:!bg-[#1f1f2d]', bar: 'border-t-indigo-500' },
  adapte: { label: 'Budget adapté', text: 'text-violet-700 dark:text-violet-400', head: 'text-violet-700 dark:text-violet-400', dot: 'bg-violet-500', row: 'bg-violet-50 dark:bg-violet-500/10', sticky: '!bg-violet-50 dark:!bg-[#231e2d]', bar: 'border-t-violet-500' },
  saisie: { label: 'Saisi', text: 'text-gray-900 dark:text-white', head: 'text-gray-500 dark:text-neutral-400', dot: 'bg-gray-900 dark:bg-white', row: '', bar: 'border-t-gray-900 dark:border-t-white' },
  engage: { label: 'Engagé (commandé)', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', bar: 'border-t-emerald-500', input: '!border-emerald-400 !bg-emerald-50 dark:!bg-emerald-500/10 dark:!border-emerald-500/60' },
  previsionnel: { label: 'Prévisionnel', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', bar: 'border-t-amber-500', input: '!border-amber-300 !bg-amber-50 dark:!bg-amber-500/10 dark:!border-amber-500/50' },
  ok: { label: 'Tout est réparti', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', bar: 'border-t-emerald-500' },
  depassement: { label: 'Dépassement', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', bar: 'border-t-red-500' },
}

// Couleur d'une case saisie : verte si la marque est engagée, ambre si prévisionnelle, neutre si vide
export function saisieTone(line, magId) {
  const filled = typeof line?.saisie?.[magId] === 'number' || typeof line?.quantite?.[magId] === 'number'
  if (!filled) return ''
  return line.engage === true ? TONE.engage.input : TONE.previsionnel.input
}

// Une marque a-t-elle une saisie (montant ou quantité) dans au moins un magasin ?
export function lineFilled(line) {
  return ['saisie', 'quantite'].some(k => Object.values(line?.[k] || {}).some(v => typeof v === 'number'))
}

// Interrupteur Engagé / Prévisionnel d'une marque (tous les magasins, montants et quantités)
export function EngageSwitch({ on, onChange, label, disabled, withText = false }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      title={on ? 'Engagé : commande passée chez le fournisseur' : 'Prévisionnel : pas encore commandé'}
      className="inline-flex items-center gap-1.5 shrink-0 disabled:cursor-not-allowed">
      <span aria-hidden="true" className={`relative h-4 w-7 rounded-full transition-colors ${on ? 'bg-emerald-500'
        : disabled ? 'bg-gray-200 dark:bg-neutral-700' : 'bg-amber-400 dark:bg-amber-500/70'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-[0.875rem]' : 'left-0.5'}`} />
      </span>
      {withText && !disabled && <span className={`text-[11px] font-semibold ${on ? TONE.engage.text : TONE.previsionnel.text}`}>{on ? 'Engagé' : 'Prévisionnel'}</span>}
    </button>
  )
}

// Barre engagé (vert) / prévisionnel (ambre) d'un montant saisi
export function SplitBar({ saisie, engage, className = '' }) {
  if (!(saisie > 0)) return null
  const pct = Math.min(100, Math.max(0, (engage / saisie) * 100))
  return (
    <span aria-hidden="true" title={`${Math.round(pct)} % engagé`}
      className={`flex h-1 rounded-full overflow-hidden bg-amber-400 dark:bg-amber-500/70 ${className}`}>
      <span className="bg-emerald-500" style={{ width: `${pct}%` }} />
    </span>
  )
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
