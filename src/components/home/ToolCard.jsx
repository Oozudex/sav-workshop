// Carte d'un outil ou d'un espace de rayon (accueil, page /espace/:rayon)
import { COLOR } from './sections'

export function openTool(section, navigate) {
  if (section.soon) return
  if (section.external) window.open(section.path, '_blank', 'noopener,noreferrer')
  else navigate(section.path)
}

// Résumé d'un espace : « 11 tickets · 10 commandes · 2 transferts »
const META = {
  '/tickets': n => `${n} ticket${n > 1 ? 's' : ''}`,
  '/orders': n => `${n} commande${n > 1 ? 's' : ''}`,
  '/transfert': n => `${n} transfert${n > 1 ? 's' : ''}`,
  '/balises': n => `${n} balise${n > 1 ? 's' : ''} à traiter`,
}
export function groupMeta(tools, counts) {
  return tools.filter(t => META[t.path] && counts[t.path] > 0).map(t => META[t.path](counts[t.path])).join(' · ')
}

// large : page d'un espace (description et bouton toujours visibles)
export default function ToolCard({ item, count, meta, onOpen, large = false }) {
  const c = COLOR[item.color]
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={item.soon}
      className={[
        'relative group flex flex-col gap-2 rounded-2xl border transition-all bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800',
        large ? 'items-start text-left gap-3 p-4' : 'items-center text-center lg:items-start lg:text-left lg:gap-3 p-3 sm:p-4',
        item.soon ? 'opacity-60 cursor-not-allowed' : `hover:shadow-lg hover:ring-4 ${c.ring}`,
      ].join(' ')}
    >
      {count > 0 && (
        <span className={`absolute ${large ? 'top-4 right-4' : 'top-2 right-2 lg:top-4 lg:right-4'} min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold bg-red-600 text-white`}>
          {count}
        </span>
      )}
      <div className={`p-2 rounded-xl ${c.bg}`}>
        <span className={c.icon}>{item.icon}</span>
      </div>
      <div className="flex-1">
        <p className={`${large ? 'text-sm' : 'text-xs lg:text-sm'} font-semibold text-gray-900 dark:text-white leading-snug`}>{item.label}</p>
        {meta && <p className="text-[11px] font-medium text-gray-600 dark:text-neutral-300 mt-0.5 leading-snug">{meta}</p>}
        <p className={`${large ? 'block' : 'hidden xl:block'} text-[11px] text-gray-500 dark:text-neutral-400 mt-1 leading-snug`}>
          {item.description}
        </p>
      </div>
      <span className={[
        `${large ? 'flex' : 'hidden lg:flex'} w-full h-7 items-center justify-center rounded-lg text-[11px] font-semibold transition-colors`,
        item.soon ? 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400' : `text-white ${c.btn}`,
      ].join(' ')}>
        {item.soon ? 'Bientôt disponible' : 'Accéder →'}
      </span>
    </button>
  )
}
