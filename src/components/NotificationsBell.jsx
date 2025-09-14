import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/firebase'
import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    where,
} from 'firebase/firestore'
import { useAuth } from '../store/useAuth'

export default function NotificationsBell() {
    const { user } = useAuth()
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) return
        // Fallback sans orderBy -> pas besoin d'index
        const qRef = query(
            collection(db, 'notifications'),
            where('toUid', '==', user.uid)
        )
        const unsub = onSnapshot(
            qRef,
            (snap) => {
                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                // tri client sur createdAt desc
                rows.sort((a, b) => {
                    const ta = a.createdAt?.seconds || 0
                    const tb = b.createdAt?.seconds || 0
                    return tb - ta
                })
                setItems(rows)
                setError(null)
            },
            (err) => {
                console.error('[Notifications] onSnapshot error:', err)
                setError(err.message || 'Erreur notifications')
            }
        )
        return () => unsub()
    }, [user])

    const unread = items.length

    const onClickNotif = async (n) => {
        try { await deleteDoc(doc(db, 'notifications', n.id)) } catch { }
        navigate(n.link || '/requests')
        setOpen(false)
    }

    const markAllRead = async () => {
        if (!items.length) return
        try {
            await Promise.all(items.map(n => deleteDoc(doc(db, 'notifications', n.id))))
        } catch (e) {
            console.warn('[Notifications] markAllRead error:', e)
        } finally {
            setOpen(false)
        }
    }

    return (
        <div className="relative">
            {/* Bouton pill identique aux autres (h-10 / rounded-2xl / border) */}
            <button
                onClick={() => setOpen(v => !v)}
                className="relative inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-black/10 px-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                title="Notifications"
            >
                {/* Icône cloche (Heroicons) */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"
                        d="M14.25 18.75a2.25 2.25 0 11-4.5 0m9-6v-1.5a6.75 6.75 0 10-13.5 0v1.5c0 .861-.352 1.687-.977 2.278L3.5 16.5h17l-1.773-1.472a3.375 3.375 0 01-1.977-3.278z" />
                </svg>
                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
                        {unread}
                    </span>
                )}
            </button>

            {/* Menu : z-index max pour passer au-dessus de tout */}
            {open && (
                <div
                    className="absolute right-0 z-[9999] mt-2 w-80 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900"
                // si tu préfères, tu peux passer en fixed pour 0 risque de stacking:
                // className="fixed top-[3.75rem] right-4 z-[9999] ..."
                >
                    <div className="max-h-[320px] overflow-y-auto">
                        {error && (
                            <div className="p-3 text-xs text-red-500">{error}</div>
                        )}
                        {!error && items.length === 0 && (
                            <div className="p-4 text-sm text-gray-500 dark:text-neutral-400">
                                Aucune notification
                            </div>
                        )}
                        {!error && items.map((n) => (
                            <button
                                key={n.id}
                                onClick={() => onClickNotif(n)}
                                className="block w-full cursor-pointer border-b border-black/5 p-3 text-left hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                            >
                                <div className="text-sm">{n.message || 'Notification'}</div>
                                <div className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
                                    {n.type || 'info'}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 p-2 text-xs text-gray-600 dark:text-neutral-400">
                        <span>{unread} notif(s)</span>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={markAllRead}
                                disabled={!unread}
                                className="rounded-lg border border-black/10 px-2 py-1 hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
                            >
                                Tout marquer comme lu
                            </button>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-lg border border-black/10 px-2 py-1 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
