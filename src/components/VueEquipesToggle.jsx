// Administrateur : bascule entre ses outils personnels et ceux des équipes du magasin (cf. useVueEquipes)
export default function VueEquipesToggle({ vue, label = 'Moi' }) {
  if (!vue.possible) return null
  const options = [['perso', label], ['equipes', 'Équipes']]
  return (
    <div className="flex items-center h-7 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden shrink-0" role="group" aria-label="Affichage">
      {options.map(([v, texte], i) => {
        const actif = (v === 'equipes') === vue.equipes
        return (
          <button key={v} type="button" aria-pressed={actif} onClick={() => vue.choisir(v)}
            className={['h-full px-2.5 text-[11px] font-semibold transition-colors', i ? 'border-l border-gray-200 dark:border-neutral-700' : '',
              actif ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'].join(' ')}>
            {texte}
          </button>
        )
      })}
    </div>
  )
}
