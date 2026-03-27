import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'

const SERVICE_TOOLS = [
  {
    label: 'Upway',
    description: 'Plateforme de reprise et revente de vélos électriques reconditionnés',
    url: null, // remplacer par l'URL réelle
    roles: null,
    color: 'emerald',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
      </svg>
    ),
  },
]

const COLOR = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       icon: 'text-blue-600 dark:text-blue-400',       ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',       btn: 'bg-blue-600 hover:bg-blue-700' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-500/10',       icon: 'text-rose-600 dark:text-rose-400',       ring: 'hover:ring-rose-200 dark:hover:ring-rose-500/30',       btn: 'bg-rose-600 hover:bg-rose-700' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     icon: 'text-amber-600 dark:text-amber-400',     ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',     btn: 'bg-amber-500 hover:bg-amber-600' },
}

export default function Service() {
  const { profile } = useAuth(s => ({ profile: s.profile }))

  const visibleTools = SERVICE_TOOLS.filter(t =>
    t.roles === null || t.roles.includes(profile?.role)
  )

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Services Vélo</h1>
          <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
            Accédez aux plateformes de services vélo partenaires du Groupe Nivault
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
