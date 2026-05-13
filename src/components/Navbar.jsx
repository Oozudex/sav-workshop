import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { useTheme } from '../store/useTheme'
import { useMagasin } from '../store/useMagasin'
import NotificationsBell from './NotificationsBell'
import { db } from '../lib/firebase'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { GLOBAL_ROLES } from '../lib/constants'

const PAGE_TITLES = {
  '/tickets': 'Réparation / SAV',
  '/orders': 'Commandes',
  '/transfert': 'Transferts',
  '/settings': 'Admin',
  '/b2b': 'B2B',
  '/rh': 'Ressources Humaines',
  '/service': 'Services Vélo',
  '/profile': 'Mon profil',
  '/operations': 'Opérations Commerciales',
  '/flocage': 'Flocage',
}

export default function Navbar() {
  const { user, profile, logout } = useAuth(s => ({ user: s.user, profile: s.profile, logout: s.logout }))
  const { theme, toggle: toggleTheme } = useTheme()
  const { selectedId, setSelectedId } = useMagasin()
  const [open, setOpen] = useState(false)
  const [magasins, setMagasins] = useState([])
  const [magasinNom, setMagasinNom] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const menuRef = useRef(null)

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)

  // Charger la liste des magasins pour le sélecteur (rôles globaux)
  useEffect(() => {
    if (!isGlobal) return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isGlobal])

  // Charger le nom du magasin pour les rôles locaux (vendeur, directeurmag)
  useEffect(() => {
    if (isGlobal || !profile?.magasinId) return
    return onSnapshot(doc(db, 'magasins', profile.magasinId), snap => {
      setMagasinNom(snap.exists() ? snap.data().nom : null)
    })
  }, [isGlobal, profile?.magasinId])

  useEffect(() => {
    function onDown(e) { if (open && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const firstName = profile?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Profil'
  const initial = firstName[0]?.toUpperCase() || 'U'

  const isHome = location.pathname === '/'
  const pageTitle = PAGE_TITLES[location.pathname]
    ?? (location.pathname.startsWith('/operations/') ? 'Opérations Commerciales' : undefined)

  return (
    <header className="sticky top-0 z-[200] border-b border-gray-200 dark:border-neutral-800
                       bg-white/90 dark:bg-neutral-900/90 backdrop-blur">
      <div className="mx-auto max-w-7xl h-12 px-5 flex items-center justify-between gap-4">

        {/* Left : home icon + brand ou back arrow + titre */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/')}
            title="Accueil"
            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                       dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </button>
          {isHome ? (
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Groupe Nivault
            </span>
          ) : (
            <>
              <button
                onClick={() => navigate(-1)}
                className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                           dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                title="Retour"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {pageTitle && (
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {pageTitle}
                </span>
              )}
            </>
          )}
        </div>

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
              {magasinNom || profile?.magasinId}
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
