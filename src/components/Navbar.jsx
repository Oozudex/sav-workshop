import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { useTheme } from '../store/useTheme'
import NotificationsBell from './NotificationsBell'

export default function Navbar() {
  const { user, profile, logout } = useAuth(s => ({
    user: s.user, profile: s.profile, logout: s.logout
  }))
  const { theme, init: initTheme, toggle: toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const menuRef = useRef(null)

  useEffect(() => { initTheme() }, [initTheme])

  // Fermer au clic extérieur / Échap
  useEffect(() => {
    function onClick(e) { if (open && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey) }
  }, [open])

  const firstName =
    (profile?.displayName?.split(' ')[0]) ||
    (user?.email?.split('@')[0]) ||
    'Profil'
  const initial = firstName?.[0]?.toUpperCase() || 'U'

  return (
    <div className="sticky top-0 z-[200] border-b border-black/10 dark:border-white/10
                 bg-white/70 dark:bg-neutral-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/60
                 dark:supports-[backdrop-filter]:bg-neutral-900/60"
    >
      <div className="mx-auto max-w-7xl h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="font-heading text-xl" onClick={() => navigate('/')}>Atelier SAV</div>



        <div className="flex items-center gap-2">

          <button
            onClick={() => navigate('/')}
            className="h-10 px-3 rounded-xl border text-sm
             border-gray-300 hover:bg-gray-50
             dark:border-neutral-700 dark:hover:bg-neutral-800">
            SAV
          </button>

          {(profile?.role === 'admin' || profile?.role === 'buyer') && (
            <button
              onClick={() => navigate('/admin')}
              className="h-10 px-3 rounded-xl border text-sm
                        border-gray-300 hover:bg-gray-50
                        dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Admin
            </button>
          )}
          {true && (
            <button
              onClick={() => navigate('/orders')}
              className="h-10 px-3 rounded-xl border text-sm
               border-gray-300 hover:bg-gray-50
               dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Commandes
            </button>
          )}
          <button
            onClick={() => navigate('/requests')}
            className="h-10 px-3 rounded-xl border text-sm
             border-gray-300 hover:bg-gray-50
             dark:border-neutral-700 dark:hover:bg-neutral-800">
            Demandes vélo
          </button>

          {/* Toggle thème */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            className="w-10 h-10 grid place-items-center rounded-xl border text-base
             border-gray-300 hover:bg-gray-50
             dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <NotificationsBell />

          {/* Menu profil */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen(v => !v)}
              className="h-10 inline-flex items-center gap-2 pl-2 pr-3 rounded-xl border text-sm leading-none
               border-gray-300 hover:bg-gray-50
               dark:border-neutral-700 dark:hover:bg-neutral-800"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="h-6 w-6 rounded-full bg-black text-white grid place-items-center
                     dark:bg-white dark:text-black text-xs font-medium">
                {initial}
              </span>
              <span className="whitespace-nowrap">{firstName}</span>
              <svg className="h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.126l3.71-3.896a.75.75 0 111.08 1.04l-4.24 4.46a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-lg overflow-hidden
                           border-gray-200 dark:bg-neutral-900 dark:border-neutral-800"
              >
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); navigate('/profile') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50
                             dark:hover:bg-neutral-800"
                >
                  Profil
                </button>
                <div className="h-px bg-gray-200 dark:bg-neutral-800" />
                <button
                  role="menuitem"
                  onClick={async () => { setOpen(false); await logout(); navigate('/login') }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50
                             dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
