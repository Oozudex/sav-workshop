import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { GLOBAL_ROLES } from '../lib/constants'

// Ajoutez vos outils B2B ici. roles: null = tout le monde, roles: [...] = rôles spécifiques
const B2B_TOOLS = [
  {
    label: 'Outil B2B 1',
    description: 'Description de l\'outil',
    url: null, // remplacer par l'URL réelle
    roles: null,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    color: 'indigo',
  },
  {
    label: 'Outil B2B 2',
    description: 'Description de l\'outil',
    url: null,
    roles: null,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    color: 'emerald',
  },
  {
    label: 'Outil B2B 3',
    description: 'Description de l\'outil',
    url: null,
    roles: GLOBAL_ROLES,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    color: 'amber',
  },
]

const COLOR = {
  indigo: {
    bg:   'bg-indigo-50 dark:bg-indigo-500/10',
    icon: 'text-indigo-600 dark:text-indigo-400',
    ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30',
    btn:  'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  },
  emerald: {
    bg:   'bg-emerald-50 dark:bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30',
    btn:  'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600',
  },
  amber: {
    bg:   'bg-amber-50 dark:bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',
    btn:  'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600',
  },
  blue: {
    bg:   'bg-blue-50 dark:bg-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
    ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',
    btn:  'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
  },
  gray: {
    bg:   'bg-gray-100 dark:bg-neutral-800',
    icon: 'text-gray-600 dark:text-neutral-300',
    ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700',
    btn:  'bg-gray-800 hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600',
  },
}

export default function B2B() {
  const { profile } = useAuth(s => ({ profile: s.profile }))

  const visibleTools = B2B_TOOLS.filter(t =>
    t.roles === null || t.roles.includes(profile?.role)
  )

  function openTool(tool) {
    if (tool.url) window.open(tool.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Espace B2B</h1>
          <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
            Accédez aux outils et plateformes partenaires du Groupe Nivault
          </p>
        </div>

        <div className="grid grid-cols-6 gap-4">
          {visibleTools.map((t, i) => {
            const c = COLOR[t.color] || COLOR.gray
            return (
              <button
                key={i}
                onClick={() => openTool(t)}
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
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                    {t.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">
                    {t.description}
                  </p>
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
