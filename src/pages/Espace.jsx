// Espace d'un rayon (ex. /espace/velo) : les outils du rayon accessibles au compte,
// ouverts depuis la carte « Vélo » de l'accueil des directeurs et des acheteurs.
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import Navbar from '../components/Navbar'
import ToolCard, { openTool } from '../components/home/ToolCard'
import { COLOR, GROUPS, SECTIONS } from '../components/home/sections'
import { useHomeCounts } from '../components/home/useHomeCounts'
import { useAuth } from '../store/useAuth'
import { useMagasin } from '../store/useMagasin'
import { GLOBAL_ROLES } from '../lib/constants'
import { groupTools } from '../lib/homeLayout'

export default function Espace() {
  const { rayon } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const counts = useHomeCounts(profile, isGlobal ? selectedId : profile?.magasinId, isGlobal)

  const group = GROUPS[rayon]
  const tools = group ? groupTools(SECTIONS, rayon, profile) : []
  if (!tools.length) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${COLOR[group.color].bg} ${COLOR[group.color].icon}`}>
              {group.icon}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Espace {group.label.toLowerCase()}</h1>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{group.description}</p>
            </div>
          </div>
          <nav aria-label={`Outils ${group.label}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map(t => (
              <ToolCard key={t.path} item={t} count={counts[t.path]} large onOpen={() => openTool(t, navigate)} />
            ))}
          </nav>
        </div>
      </main>
    </div>
  )
}
