// Univers (liste des budgets) : choix dans les formulaires, étiquettes sur les cartes, filtre des pages
import { useState } from 'react'
import { FILTRE_MES_UNIVERS, FILTRE_TOUS } from '../lib/universFilter'

const PILL = 'h-8 px-3 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5'
const PILL_ON = 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
const PILL_OFF = 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800'

// Boutons à cocher, avec recherche au-delà de 12 univers. names : univers proposés ; un univers coché
// absent de la liste (renommé, supprimé) reste affiché pour pouvoir le décocher.
export function UniversChoice({ names, value, onChange, label = 'Univers' }) {
  const [q, setQ] = useState('')
  const all = [...names, ...value.filter(v => !names.includes(v))]
  const needle = q.trim().toLowerCase()
  const shown = needle ? all.filter(n => n.toLowerCase().includes(needle)) : all
  const toggle = nom => onChange(value.includes(nom) ? value.filter(x => x !== nom) : [...value, nom])
  if (!all.length) {
    return <p className="text-xs text-gray-500 dark:text-neutral-400">La liste des univers est vide : remplis-la dans la carte Budgets, onglet Univers.</p>
  }
  return (
    <div className="space-y-2">
      {all.length > 12 && (
        <input type="search" className="Input h-9 text-sm" placeholder="Filtrer les univers…" value={q}
          onChange={e => setQ(e.target.value)} aria-label={`Filtrer : ${label}`} />
      )}
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
        {shown.map(nom => {
          const on = value.includes(nom)
          return (
            <button key={nom} type="button" aria-pressed={on} onClick={() => toggle(nom)} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
              {on && <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              {nom}
            </button>
          )
        })}
        {shown.length === 0 && <p className="text-xs text-gray-500 dark:text-neutral-400 py-1">Aucun univers ne correspond.</p>}
      </div>
    </div>
  )
}

// Étiquettes d'univers sur une carte (deux au plus, le reste au survol)
export function UniversTags({ univers = [] }) {
  if (!univers.length) return null
  const shown = univers.slice(0, 2)
  return (
    <div className="flex flex-wrap gap-1" title={univers.join(', ')}>
      {shown.map(u => (
        <span key={u} className="h-5 px-1.5 inline-flex items-center gap-1 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-violet-500" />{u}
        </span>
      ))}
      {univers.length > 2 && (
        <span className="h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          +{univers.length - 2}
        </span>
      )}
    </div>
  )
}

// Filtre d'une page : mes univers (acheteur), tous, ou un univers (les éléments communs restent affichés)
export function UniversFilter({ value, onChange, options, mesUnivers = [] }) {
  if (!options.length && !mesUnivers.length) return null
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Filtrer par univers"
      className="Input h-10 text-sm sm:w-64">
      {mesUnivers.length > 0 && <option value={FILTRE_MES_UNIVERS}>Mes univers ({mesUnivers.length})</option>}
      <option value={FILTRE_TOUS}>Tous les univers</option>
      {options.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
  )
}
