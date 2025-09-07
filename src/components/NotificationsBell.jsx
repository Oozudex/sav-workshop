// src/components/NotificationsBell.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, onSnapshot, query, where, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../store/useAuth'

export default function NotificationsBell() {
    const { user } = useAuth(s => ({ user: s.user }))
    const [items, setItems] = useState([])
    const [open, setOpen] = useState(false)
    const btnRef = useRef(null)
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

    // stream notifs (sans orderBy => pas d’index nécessaire)
    useEffect(() => {
        if (!user) return
        const qRef = query(collection(db, 'notifications'), where('toUid', '==', user.uid))
        return onSnapshot(qRef, snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            rows.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt))
            setItems(rows)
        })
    }, [user])

    const unread = useMemo(() => items.filter(i => !i.read).length, [items])

    // calcule la position (ancrage au bouton)
    function recalc() {
        const r = btnRef.current?.getBoundingClientRect()
        if (!r) return
        setPos({ top: r.bottom + 8, left: r.right, width: r.width })
    }
    useEffect(() => { if (open) recalc() }, [open])
    useEffect(() => {
        if (!open) return
        const f = () => recalc()
        window.addEventListener('scroll', f, { passive: true })
        window.addEventListener('resize', f)
        return () => { window.removeEventListener('scroll', f); window.removeEventListener('resize', f) }
    }, [open])

    async function markAllRead() {
        await Promise.all(items.filter(i => !i.read).map(i => updateDoc(doc(db, 'notifications', i.id), { read: true })))
    }

    async function removeNotif(id) {
        await deleteDoc(doc(db, 'notifications', id))
    }

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={() => setOpen(o => !o)}
                className="h-10 w-10 rounded-full border flex items-center justify-center
                   border-gray-300 hover:bg-gray-50
                   dark:border-neutral-700 dark:hover:bg-neutral-800"
                title="Notifications"
            >
                <BellIcon className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px]
                           bg-red-500 text-white">{unread}</span>
                )}
            </button>

            {open && createPortal(
                <>
                    {/* overlay cliquable pour fermer */}
                    <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setOpen(false)}
                    />
                    {/* panneau fixé à l’écran, aligné à droite du bouton */}
                    <div
                        className="fixed z-[9999] w-80 rounded-2xl border bg-white shadow-xl
                       dark:bg-neutral-900 dark:border-neutral-800"
                        style={{ top: pos.top, left: pos.left - 320 }} // 320px ≈ w-80, on colle à droite du bouton
                    >
                        <div className="px-3 py-2 flex items-center justify-between">
                            <div className="text-sm font-medium">Notifications</div>
                            <button className="text-xs opacity-70 hover:opacity-100" onClick={markAllRead}>
                                Tout marquer lu
                            </button>
                        </div>
                        <div className="max-h-80 overflow-auto divide-y divide-gray-100 dark:divide-neutral-800">
                            {items.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500 dark:text-neutral-400">Rien à signaler</div>
                            ) : items.map(it => (
                                <div key={it.id} className="p-3 text-sm group">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{labelForType(it.type)}</div>
                                            <div className="opacity-80 break-words">{it.message}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!it.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                                            <button
                                                title="Supprimer"
                                                aria-label="Supprimer"
                                                onClick={() => removeNotif(it.id)}
                                                className="p-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50
                      dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-1 text-[11px] opacity-60">{fmtDateTime(it.createdAt)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    )
}

/* utils */
function BellIcon({ className = '' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M6 8a6 6 0 1 1 12 0v5l1.5 3H4.5L6 13V8Z" />
            <path d="M9 19a3 3 0 0 0 6 0" />
        </svg>
    )
}
function labelForType(t) {
    return ({
        request_created: 'Nouvelle demande',
        request_approved: 'Demande validée',
        request_rejected: 'Demande refusée',
        request_notified: 'Client prévenu',
    }[t] || 'Notification')
}
function tsToMs(ts) {
    if (!ts) return 0
    if (ts.seconds) return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6)
    const d = new Date(ts); return isNaN(+d) ? 0 : +d
}
function fmtDateTime(ts) {
    const ms = tsToMs(ts)
    if (!ms) return '—'
    return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function TrashIcon({ className = '' }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 6h18" strokeLinecap="round" />
            <path d="M8 6V4.8c0-.995.805-1.8 1.8-1.8h4.4c.995 0 1.8.805 1.8 1.8V6" />
            <path d="M19 6l-1 13a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8L5 6" />
            <path d="M10 10v7M14 10v7" strokeLinecap="round" />
        </svg>
    )
}
