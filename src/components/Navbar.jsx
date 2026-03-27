import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { useTheme } from '../store/useTheme'
import { useMagasin } from '../store/useMagasin'
import NotificationsBell from './NotificationsBell'
import { db } from '../lib/firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { GLOBAL_ROLES } from '../lib/constants'

const NAV = [
  { label: 'Réparation / SAV', path: '/' },
  { label: 'Commande Client', path: '/orders' },
  { label: 'Transfert', path: '/requests' },
]

export default function Navbar() {
  const { user, profile, logout } = useAuth(s => ({ user: s.user, profile: s.profile, logout: s.logout }))
  const { theme, toggle: toggleTheme } = useTheme()
  const { selectedId, setSelectedId } = useMagasin()
  const [open, setOpen] = useState(false)
  const [magasins, setMagasins] = useState([])
  const navigate = useNavigate()
  const location = useLocation()
  const menuRef = useRef(null)

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const canSettings = ['directeurmag', 'acheteur', 'directeurgen'].includes(profile?.role)

  // Charger la liste des magasins pour le sélecteur
  useEffect(() => {
    if (!isGlobal) return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isGlobal])

  useEffect(() => {
    function onDown(e) { if (open && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const firstName = profile?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Profil'
  const initial = firstName[0]?.toUpperCase() || 'U'

  const navItems = [
    ...NAV.slice(0, 1),
    ...NAV.slice(1),
    ...(canSettings ? [{ label: 'Admin', path: '/settings' }] : []),
  ]

  return (
    <header className="sticky top-0 z-[200] border-b border-gray-200 dark:border-neutral-800
                       bg-white/90 dark:bg-neutral-900/90 backdrop-blur">
      <div className="mx-auto max-w-7xl h-12 px-5 flex items-center justify-between gap-4">

        {/* Brand */}
        <button
          onClick={() => navigate('/')}
          className="text-sm font-semibold text-gray-900 dark:text-white shrink-0 hover:opacity-70 transition-opacity"
        >
          Atelier SAV
        </button>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ label, path }) => {
            const active = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={[
                  'h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                  active
                    ? 'bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Sélecteur de magasin (acheteur + directeurgen) */}
          {isGlobal && magasins.length > 0 && (
            <div className="flex items-center h-8 rounded-lg border overflow-hidden
                            border-gray-200 dark:border-neutral-700">
              <button
                onClick={() => setSelectedId(null)}
                className={[
                  'h-full px-2.5 text-xs font-medium transition-colors border-r border-gray-200 dark:border-neutral-700',
                  !selectedId
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-500 hover:bg-gray-50 dark:text-neutral-400 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                Tous
              </button>
              <select
                value={selectedId || ''}
                onChange={e => setSelectedId(e.target.value || null)}
                className="h-full px-2.5 pr-6 text-xs font-medium bg-transparent border-0 outline-none cursor-pointer
                           text-gray-700 dark:text-neutral-300"
              >
                <option value="">— Magasin</option>
                {magasins.map(m => (
                  <option key={m.id} value={m.id}>{m.nom}</option>
                ))}
              </select>
            </div>
          )}

          {/* Indicateur magasin pour directeurmag/vendeur */}
          {!isGlobal && profile?.magasinId && (
            <span className="h-8 px-3 flex items-center rounded-lg border border-gray-200 dark:border-neutral-700
                             text-xs text-gray-500 dark:text-neutral-400">
              {profile?.magasinNom || profile?.magasinId}
            </span>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                       dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            {theme === 'dark'
              ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" /></svg>
              : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
            }
          </button>

          <NotificationsBell />

          {/* Profile menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="h-8 inline-flex items-center gap-2 px-2 rounded-lg text-xs font-medium
                         text-gray-700 hover:bg-gray-100 transition-colors
                         dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <span className="h-5 w-5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-black
                               grid place-items-center text-[10px] font-bold shrink-0">
                {initial}
              </span>
              <span>{firstName}</span>
              <svg className={`h-3 w-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-44 rounded-2xl border shadow-lg overflow-hidden
                           bg-white border-gray-200
                           dark:bg-neutral-900 dark:border-neutral-800"
              >
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); navigate('/profile') }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50
                             dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                >
                  Mon profil
                </button>
                <div className="h-px bg-gray-100 dark:bg-neutral-800" />
                <button
                  role="menuitem"
                  onClick={async () => { setOpen(false); await logout(); navigate('/login') }}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50
                             dark:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
