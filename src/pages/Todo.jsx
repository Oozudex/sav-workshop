// Page « Todo list » : la liste complète du rayon (avec l'historique de 30 jours) et les tâches récurrentes
import { useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import { GLOBAL_ROLES, RAYON_TYPE_LABELS } from '../lib/constants'
import { useStaff } from '../lib/useStaff'
import { JOURS, joursLabel } from '../lib/todos'
import TodoPanel from '../components/todo/TodoPanel'
import RayonPills from '../components/todo/RayonPills'
import { useTodos } from '../components/todo/useTodos'
import { useTodoRayons } from '../components/todo/useTodoRayons'

function Recurrences({ data, magasinId, rayon }) {
  const staff = useStaff(magasinId, rayon)
  const [titre, setTitre] = useState('')
  const [jours, setJours] = useState([0])
  const [assigneA, setAssigneA] = useState('')
  const [saving, setSaving] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!titre.trim() || !jours.length) return
    setSaving(true)
    try { await data.addRecurrence({ titre, jours, assigneA }); setTitre(''); setAssigneA('') } finally { setSaving(false) }
  }
  const toggleJour = j => setJours(js => (js.includes(j) ? js.filter(x => x !== j) : [...js, j]))

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">🔁 Tâches récurrentes</h2>
        <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Ajoutées toutes seules à la liste les jours choisis.</p>
      </div>

      <form onSubmit={add} className="space-y-2">
        <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. Vérifier les vélos prêts à rendre" aria-label="Tâche récurrente" className="Input h-9 text-sm" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Jours">
          {JOURS.map((nom, j) => (
            <button key={nom} type="button" onClick={() => toggleJour(j)} aria-pressed={jours.includes(j)}
              className={['h-7 w-10 rounded-lg text-[11px] font-semibold transition-colors',
                jours.includes(j) ? 'bg-indigo-600 text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'].join(' ')}>
              {nom.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {staff.length > 0 && (
            <select value={assigneA} onChange={e => setAssigneA(e.target.value)} aria-label="Assigner à"
              className="h-9 px-2 rounded-xl border text-xs bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-700 flex-1 min-w-0">
              <option value="">Pour qui ? (facultatif)</option>
              {staff.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
            </select>
          )}
          <button type="submit" disabled={!titre.trim() || !jours.length || saving}
            className="h-9 px-4 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            Ajouter
          </button>
        </div>
      </form>

      {data.recurrences.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-neutral-500">Aucune tâche récurrente.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
          {data.recurrences.map(r => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <div className={`flex-1 min-w-0 ${r.actif === false ? 'opacity-50' : ''}`}>
                <p className="text-sm text-gray-900 dark:text-neutral-100 break-words">{r.titre}</p>
                <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                  {joursLabel(r.jours)}{r.assigneA ? ` · ${r.assigneA}` : ''}{r.actif === false ? ' · en pause' : ''}
                </p>
              </div>
              <button type="button" onClick={() => data.toggleRecurrence(r)}
                className="h-7 px-2.5 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                {r.actif === false ? 'Reprendre' : 'Pause'}
              </button>
              <button type="button" onClick={() => confirm(`Supprimer la tâche récurrente « ${r.titre} » ?`) && data.removeRecurrence(r)}
                className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Todo() {
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const { selectedId } = useMagasin()
  const magasinId = GLOBAL_ROLES.includes(profile?.role) ? selectedId : profile?.magasinId
  const { rayons, rayon, choose } = useTodoRayons(profile, magasinId)
  const data = useTodos(magasinId, rayon)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Todo list{rayon ? ` · ${RAYON_TYPE_LABELS[rayon] || rayon}` : ''}</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                Tâches de l’équipe, débuts et fins d’OP (2 jours ouvrés avant), relances atelier et mot du soir.
              </p>
            </div>
            <RayonPills rayons={rayons} rayon={rayon} onChoose={choose} />
          </div>

          {!magasinId ? (
            <p className="text-sm text-gray-400 dark:text-neutral-500 py-10 text-center">Choisis un magasin dans la barre du haut.</p>
          ) : !rayon ? (
            <p className="text-sm text-gray-400 dark:text-neutral-500 py-10 text-center">Aucun rayon dans ce magasin.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
              <section className="lg:col-span-3 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5">
                <TodoPanel data={data} magasinId={magasinId} rayon={rayon} />
              </section>
              <div className="lg:col-span-2">
                <Recurrences data={data} magasinId={magasinId} rayon={rayon} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
