import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'

export default function Profile() {
    const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
    const navigate = useNavigate()

    return (
        <div className="min-h-screen flex flex-col">
            {/* Simple header local ou réutilise ta Navbar si tu préfères */}
            <div className="border-b border-gray-200 bg-white/90 backdrop-blur
                      dark:border-neutral-800 dark:bg-neutral-900/90">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="font-heading text-xl">Profil</div>
                    <button
                        onClick={() => navigate('/')}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50
                       dark:border-neutral-700 dark:hover:bg-neutral-800"
                    >
                        ← Retour
                    </button>
                </div>
            </div>

            <main className="flex-1">
                <div className="max-w-6xl mx-auto p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card title="Identité">
                            <Line label="Nom affiché" value={profile?.displayName || '—'} />
                            <Line label="Email" value={user?.email || '—'} />
                            <Line label="UID" value={user?.uid || '—'} mono />
                        </Card>

                        <Card title="Rôle & statut">
                            <Line label="Rôle" value={profile?.role || '—'} />
                            <Line label="Actif" value={profile?.isActive ? 'Oui' : 'Non'} />
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    )
}

function Card({ title, children }) {
    return (
        <div className="rounded-2xl border bg-white p-4
                    border-gray-200
                    dark:bg-neutral-900 dark:border-neutral-800">
            <div className="text-sm font-semibold mb-3">{title}</div>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

function Line({ label, value, mono = false }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-gray-600 dark:text-neutral-400">{label}</div>
            <div className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    )
}
