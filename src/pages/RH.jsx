import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { GLOBAL_ROLES } from '../lib/constants'

const RH_TOOLS = [
  {
    label: 'Tamigo',
    description: 'Gestion des plannings et des temps de travail',
    url: null, // remplacer par l'URL réelle
    roles: null,
    color: 'blue',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    label: 'Lucca',
    description: 'Gestion des congés, absences et notes de frais',
    url: null,
    roles: null,
    color: 'emerald',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
]

const COLOR = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       icon: 'text-blue-600 dark:text-blue-400',       ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',       btn: 'bg-blue-600 hover:bg-blue-700' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-500/10',   icon: 'text-violet-600 dark:text-violet-400',   ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30',   btn: 'bg-violet-600 hover:bg-violet-700' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     icon: 'text-amber-600 dark:text-amber-400',     ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',     btn: 'bg-amber-500 hover:bg-amber-600' },
}

export default function RH() {
  const { profile } = useAuth(s => ({ profile: s.profile }))

  const visibleTools = RH_TOOLS.filter(t =>
    t.roles === null || t.roles.includes(profile?.role)
  )

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Ressources Humaines</h1>
          <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
            Accédez aux outils RH du Groupe Nivault
          </p>
        </div>

        <div className="grid grid-cols-6 gap-4">
          {visibleTools.map((t, i) => {
            const c = COLOR[t.color] || COLOR.blue
            return (
              <button
                key={i}
                onClick={() => t.url && window.open(t.url, '_blank', 'noopener,noreferrer')}
                disabled={!t.url}
                className={[
                  'flex flex-col items-start gap-3 p-5 rounded-2xl border text-left transition-all',
                  'bg-white dark:bg-neutral-900',
                  'border-gray-200 dark:border-neutral-800',
                  t.url ? `hover:shadow-lg hover:ring-4 ${c.ring}` : 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                <div className={`p-2.5 rounded-xl ${c.bg}`}>
                  <span className={c.icon}>{t.icon}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.label}</p>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">{t.description}</p>
                </div>
                <span className={`w-full h-7 flex items-center justify-center rounded-lg text-xs font-semibold text-white transition-colors ${c.btn}`}>
                  {t.url ? 'Accéder →' : 'Bientôt disponible'}
                </span>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
