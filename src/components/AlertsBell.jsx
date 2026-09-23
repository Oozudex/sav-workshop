import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../store/useAlerts'

/** Cloche des alertes du magasin (tickets SAV et commandes), affichée au directeur de magasin. */
export default function AlertsBell() {
  const alerts = useAlerts(s => s.alerts)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const count = alerts.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title={count ? `${count} alerte${count > 1 ? 's' : ''} rayon vélo` : 'Aucune alerte rayon vélo'}
        aria-label="Alertes rayon vélo"
        aria-expanded={open}
        className="relative h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                   dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold grid place-items-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-80 rounded-2xl border shadow-lg overflow-hidden bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Alertes rayon vélo</p>
          </div>
          {count === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400 dark:text-neutral-500">
              Aucun seuil dépassé. Les seuils se règlent avec le bouton « Alertes » des pages Réparation / SAV et Commandes.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800">
              {alerts.map(a => (
                <li key={`${a.scope}-${a.key}`}>
                  <button
                    onClick={() => { setOpen(false); navigate(`${a.path}?alerte=${a.key}`) }}
                    className="w-full text-left px-3 py-2.5 flex gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span aria-hidden className="text-red-600 dark:text-red-400 text-sm leading-5">⚠</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-gray-900 dark:text-white">{a.label}</span>
                      <span className="block text-xs text-gray-600 dark:text-neutral-300">
                        Attention, ton équipe vélo a dépassé le seuil : {a.message}.
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
