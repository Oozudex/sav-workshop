import { RAYON_TYPE_LABELS } from '../../lib/constants'

// Choix du rayon (directeur, acheteur, direction) ; rien pour un compte rayon
export default function RayonPills({ rayons, rayon, onChoose, counts = {} }) {
  if (rayons.length < 2) return null
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Rayon">
      {rayons.map(r => (
        <button key={r} type="button" role="tab" aria-selected={r === rayon} onClick={() => onChoose(r)}
          className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors',
            r === rayon ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
              : 'text-gray-500 border border-gray-200 hover:bg-gray-50 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800'].join(' ')}>
          {RAYON_TYPE_LABELS[r] || r}{counts[r] ? ` · ${counts[r]}` : ''}
        </button>
      ))}
    </div>
  )
}
