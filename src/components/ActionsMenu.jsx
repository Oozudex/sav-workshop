import { useEffect, useRef, useState } from 'react'

// Menu « … » pour les actions rares (modifier, supprimer)
export default function ActionsMenu({ items, label = 'Plus d’actions' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={label}
        className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1.5 w-48 z-20 rounded-xl border shadow-lg overflow-hidden bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
          {items.map(it => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onClick() }}
              className={['w-full text-left px-3 py-2 text-xs transition-colors',
                it.danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10' : 'text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800'].join(' ')}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
