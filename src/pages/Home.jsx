import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import WeeklyCalendar from '../components/WeeklyCalendar'
import InfosBanner from '../components/InfosBanner'
import TodoWidget from '../components/todo/TodoWidget'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import ToolCard, { groupMeta, openTool } from '../components/home/ToolCard'
import { GROUPS, SECTIONS } from '../components/home/sections'
import { useHomeCounts } from '../components/home/useHomeCounts'
import { GLOBAL_ROLES } from '../lib/constants'
import { runCleanup } from '../lib/cleanup'
import { arrangeHome } from '../lib/homeLayout'

export default function Home() {
  const navigate = useNavigate()
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const { selectedId } = useMagasin()

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId

  useEffect(() => { runCleanup(profile?.role).catch(() => { }) }, [profile?.role])

  const counts = useHomeCounts(profile, effectiveMagasinId, isGlobal)
  const cards = arrangeHome(SECTIONS, Object.keys(GROUPS), profile)

  const [calendarExpanded, setCalendarExpanded] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 flex flex-col lg:flex-row lg:items-start">
        <h1 className="sr-only">Accueil</h1>

        {/* Colonne gauche : outils */}
        <div className={['lg:shrink-0 flex flex-col p-4 sm:p-6 lg:pr-3 lg:overflow-hidden transition-[width] duration-300 ease-in-out',
          calendarExpanded ? 'lg:w-1/5' : 'lg:w-[28%]',
        ].join(' ')}>
          <InfosBanner magasinId={effectiveMagasinId} />
          <nav aria-label="Outils" className={['grid gap-2 sm:gap-3 grid-cols-3', calendarExpanded ? 'lg:grid-cols-1' : 'lg:grid-cols-2'].join(' ')}>
            {cards.map(card => card.type === 'group' ? (
              <ToolCard key={card.group} item={GROUPS[card.group]}
                meta={groupMeta(card.tools, counts)} onOpen={() => navigate(GROUPS[card.group].path)} />
            ) : (
              <ToolCard key={card.section.path} item={card.section} count={counts[card.section.path]}
                onOpen={() => openTool(card.section, navigate)} />
            ))}
          </nav>
        </div>

        {/* Colonne du milieu : todo list du rayon (masquée quand le calendrier est agrandi) */}
        <div className={['lg:shrink-0 px-4 pb-4 sm:px-6 sm:pb-6 lg:px-3 lg:py-6 lg:w-[24%] lg:sticky lg:top-12', calendarExpanded ? 'lg:hidden' : ''].join(' ')}>
          <TodoWidget profile={profile} magasinId={effectiveMagasinId} />
        </div>

        {/* Séparateur vertical + bouton expand */}
        <div className="hidden lg:block relative shrink-0 w-px bg-gray-200 dark:bg-neutral-800 self-stretch">
          <button
            onClick={() => setCalendarExpanded(e => !e)}
            title={calendarExpanded ? 'Réduire le calendrier' : 'Agrandir le calendrier'}
            className="absolute top-4 left-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 shadow-sm flex items-center justify-center text-gray-500 dark:text-neutral-400 hover:text-gray-600 dark:hover:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors z-10"
          >
            {calendarExpanded ? (
              <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            )}
          </button>
        </div>

        {/* Colonne droite : calendrier */}
        <div className={['lg:flex-1 lg:min-w-0 lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] flex flex-col px-4 pb-4 sm:px-6 sm:pb-6 lg:p-6 lg:pl-5 transition-[width] duration-300 ease-in-out',
        ].join(' ')}>
          <WeeklyCalendar magasinId={effectiveMagasinId} />
        </div>

      </main>
    </div>
  )
}
