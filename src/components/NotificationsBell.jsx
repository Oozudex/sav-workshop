import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/firebase'
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useAuth } from '../store/useAuth'

export default function NotificationsBell() {
    const { user } = useAuth()
    const [open,  setOpen]  = useState(false)
    const [items, setItems] = useState([])
    const [error, setError] = useState(null)
    const navigate  = useNavigate()
    const panelRef  = useRef(null)

    useEffect(() => {
        if (!user) return
        const q = query(collection(db, 'notifications'), where('toUid', '==', user.uid))
        return onSnapshot(q,
            snap => {
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                setItems(rows); setError(null)
            },
            err => { console.error('[Notifications]', err); setError(err.message) }
        )
    }, [user])

    // Fermer au clic extérieur
    useEffect(() => {
        function onDown(e) { if (open && panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
        window.addEventListener('mousedown', onDown)
        return () => window.removeEventListener('mousedown', onDown)
    }, [open])

    const unread = items.length

    async function onClickNotif(n) {
        try { await deleteDoc(doc(db, 'notifications', n.id)) } catch {}
        navigate(n.link || '/requests')
        setOpen(false)
    }

    async function markAllRead() {
        if (!items.length) return
        try { await Promise.all(items.map(n => deleteDoc(doc(db, 'notifications', n.id)))) } catch {}
        setOpen(false)
    }

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={() => setOpen(v => !v)}
                title="Notifications"
                className="relative h-8 w-8 grid place-items-center rounded-lg
                           text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors
                           dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="M14.25 18.75a2.25 2.25 0 11-4.5 0m9-6v-1.5a6.75 6.75 0 10-13.5 0v1.5c0 .861-.352 1.687-.977 2.278L3.5 16.5h17l-1.773-1.472a3.375 3.375 0 01-1.977-3.278z" />
                </svg>
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-0.5
                                     flex items-center justify-center rounded-full
                                     bg-red-500 text-white text-[10px] font-bold">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-1.5 w-72 z-[9999] rounded-2xl border shadow-lg overflow-hidden
                                bg-white border-gray-200
                                dark:bg-neutral-900 dark:border-neutral-800">

                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2.5 border-b
                                    border-gray-100 dark:border-neutral-800">
                        <span className="text-xs font-semibold text-gray-700 dark:text-neutral-300">
                            Notifications
                        </span>
                        {unread > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium
                                             bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                                {unread}
                            </span>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-64 overflow-y-auto">
                        {error && (
                            <p className="px-3 py-3 text-xs text-red-500">{error}</p>
                        )}
                        {!error && items.length === 0 && (
                            <p className="px-3 py-4 text-xs text-gray-400 dark:text-neutral-500 text-center">
                                Aucune notification
                            </p>
                        )}
                        {!error && items.map(n => (
                            <button
                                key={n.id}
                                onClick={() => onClickNotif(n)}
                                className="w-full text-left px-3 py-2.5 border-b text-xs transition-colors
                                           border-gray-100 hover:bg-gray-50
                                           dark:border-neutral-800 dark:hover:bg-neutral-800"
                            >
                                <p className="text-gray-800 dark:text-neutral-200 leading-snug">{n.message || 'Notification'}</p>
                                {n.type && <p className="text-gray-400 dark:text-neutral-500 mt-0.5">{n.type}</p>}
                            </button>
                        ))}
                    </div>

                    {/* Footer */}
                    {unread > 0 && (
                        <div className="px-3 py-2 border-t border-gray-100 dark:border-neutral-800">
                            <button
                                onClick={markAllRead}
                                className="w-full h-7 rounded-lg text-xs font-medium transition-colors
                                           text-gray-500 hover:text-gray-800 hover:bg-gray-100
                                           dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800"
                            >
                                Tout marquer comme lu
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
