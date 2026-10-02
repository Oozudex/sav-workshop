// Bloc « À faire » de l'accueil : la todo list du rayon, et le lien vers la page complète
import { useNavigate } from 'react-router-dom'
import TodoPanel from './TodoPanel'
import RayonPills from './RayonPills'
import { useTodos } from './useTodos'
import { useTodoRayons } from './useTodoRayons'

export default function TodoWidget({ profile, magasinId }) {
  const navigate = useNavigate()
  const { rayons, rayon, choose } = useTodoRayons(profile, magasinId)
  const data = useTodos(magasinId, rayon)
  const restantes = data.todos.filter(t => !t.fait).length

  return (
    <section className="flex flex-col rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 lg:max-h-[calc(100vh-6rem)]" aria-label="À faire">
      <div className="px-4 pt-4 pb-3 space-y-2 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">À faire</h2>
          {restantes > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">{restantes}</span>}
        </div>
        <RayonPills rayons={rayons} rayon={rayon} onChoose={choose} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!magasinId ? (
          <p className="text-xs text-gray-400 dark:text-neutral-500 py-4">Choisis un magasin dans la barre du haut pour voir sa todo list.</p>
        ) : !rayon ? (
          <p className="text-xs text-gray-400 dark:text-neutral-500 py-4">Aucun rayon dans ce magasin.</p>
        ) : (
          <TodoPanel data={data} magasinId={magasinId} rayon={rayon} compact />
        )}
      </div>
      <div className="p-3 border-t border-gray-100 dark:border-neutral-800">
        <button type="button" onClick={() => navigate('/todo')}
          className="w-full h-9 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
          Accéder à la todo list →
        </button>
      </div>
    </section>
  )
}
