// src/pages/Requests.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore'

/* ================= Layout ================= */
function Container({ children, className = '' }) {
    return (
        <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>
            {children}
        </div>
    )
}

/* ================= Utils ================= */
const fmtPrice = (v) => {
    if (v == null || v === '' || Number.isNaN(Number(v))) return '—'
    try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))
    } catch {
        return `${v} €`
    }
}

const searchIn = (obj, q) => {
    if (!q) return true
    const s = q.toLowerCase()
    return [obj.customerName, obj.customerPhone, obj.bikeModel, obj.sizeColor, obj.requesterName]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(s))
}

/* ================= Badges statut ================= */
function StatusChip({ status }) {
    const cls =
        {
            pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-300',
            approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
            rejected: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
            client_ok: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
            client_no: 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-300',
            ordered: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300',
            arrived: 'bg-teal-500/10 text-teal-700 border-teal-500/20 dark:text-teal-300',
            delivered: 'bg-emerald-600/10 text-emerald-700 border-emerald-600/20 dark:text-emerald-300',
        }[status] ||
        'bg-black/5 text-black/60 border-black/10 dark:bg-white/5 dark:text-white/60 dark:border-white/10'

    const label =
        {
            pending: 'En attente',
            approved: 'Validée',
            rejected: 'Refusée',
            client_ok: 'Client OK',
            client_no: 'Client NON',
            ordered: 'Commandée',
            arrived: 'Arrivée',
            delivered: 'Remise au client',
        }[status] || status

    return <span className={`inline-block px-2 py-1 rounded-full text-xs border ${cls}`}>{label}</span>
}

/* ================= Notifications (robuste) ================= */
// payload: { type, message, link? }
async function notifyUser(uid, payload) {
    if (!uid) return
    await addDoc(collection(db, 'notifications'), {
        toUid: uid,
        read: false,
        createdAt: serverTimestamp(),
        ...payload,
    })
}
async function notifyByRoles(roles, payload) {
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', roles)))
    // Tolère users stockés avec doc.id === authUID OU un champ uid/authUid
    const targets = Array.from(
        new Set(
            snap.docs
                .map((d) => d.data()?.uid || d.data()?.authUid || d.id)
                .filter(Boolean)
        )
    )
    await Promise.all(targets.map((uid) => notifyUser(uid, payload)))
}
const notifyBuyers = (p) => notifyByRoles(['buyer', 'admin'], p)
const notifyMechanics = (p) => notifyByRoles(['mechanic'], p)

/* ================= UI Sections ================= */
function Section({ title, children }) {
    return (
        <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold">{title}</h2>
            {children}
        </section>
    )
}

/* ================= Tableau demandes ================= */
function RequestsTable({
    rows,
    role,
    canApprove = false,
    onApprove,
    onReject,
    onClientOk,
    onClientNo,
    onMarkOrdered,
    onArrived,
    onDelivered,
    onRemove,
}) {
    const isBuyer = role === 'buyer' || role === 'admin'
    const isMech = role === 'mechanic'
    const canDeleteByMech = (r) => isMech && (r.status === 'rejected' || r.status === 'client_no')

    return (
        <div className="overflow-x-auto rounded-2xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
            <table className="w-full text-sm">
                <thead className="text-left text-gray-600 dark:text-neutral-400">
                    <tr>
                        <th className="py-2 px-3">Client</th>
                        <th className="py-2 px-3">Contact</th>
                        <th className="py-2 px-3">Modèle</th>
                        <th className="py-2 px-3">Taille/Couleur</th>
                        <th className="py-2 px-3 text-right">Budget</th>
                        <th className="py-2 px-3">Par</th>
                        <th className="py-2 px-3">Statut</th>
                        <th className="py-2 px-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="py-6 text-center text-gray-500 dark:text-neutral-400">
                                Aucune demande
                            </td>
                        </tr>
                    ) : (
                        rows.map((r) => (
                            <tr
                                id={`req-${r.id}`}
                                key={r.id}
                                className="border-t border-gray-100 dark:border-neutral-800 hover:bg-black/5 dark:hover:bg-white/5"
                            >
                                <td className="py-2 px-3">{r.customerName || '—'}</td>
                                <td className="py-2 px-3">{r.customerPhone || '—'}</td>
                                <td className="py-2 px-3">{r.bikeModel || '—'}</td>
                                <td className="py-2 px-3">{r.sizeColor || '—'}</td>
                                <td className="py-2 px-3 text-right">{fmtPrice(r.budget)}</td>
                                <td className="py-2 px-3">{r.requesterName || '—'}</td>
                                <td className="py-2 px-3">
                                    <StatusChip status={r.status} />
                                </td>
                                <td className="py-2 px-3">
                                    <div className="flex flex-wrap gap-2">
                                        {canApprove && r.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => onApprove?.(r)}
                                                    className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                                >
                                                    Valider
                                                </button>
                                                <button
                                                    onClick={() => onReject?.(r)}
                                                    className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                                                >
                                                    Refuser
                                                </button>
                                            </>
                                        )}

                                        {role === 'mechanic' && r.status === 'approved' && (
                                            <>
                                                <button
                                                    onClick={() => onClientOk?.(r)}
                                                    className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20"
                                                >
                                                    Client OK
                                                </button>
                                                <button
                                                    onClick={() => onClientNo?.(r)}
                                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                                >
                                                    Client NON
                                                </button>
                                            </>
                                        )}

                                        {isBuyer && r.status === 'client_ok' && (
                                            <button
                                                onClick={() => onMarkOrdered?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
                                            >
                                                Commandée
                                            </button>
                                        )}

                                        {role === 'mechanic' && r.status === 'ordered' && (
                                            <button
                                                onClick={() => onArrived?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/20"
                                            >
                                                Vélo arrivé
                                            </button>
                                        )}

                                        {role === 'mechanic' && r.status === 'arrived' && (
                                            <button
                                                onClick={() => onDelivered?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                            >
                                                Vélo remis
                                            </button>
                                        )}

                                        {(isBuyer || canDeleteByMech(r)) && (
                                            <button
                                                onClick={() => onRemove?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                                            >
                                                Supprimer
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}

/* ================= Création ================= */
function CreateRequest({ onCreated }) {
    const { user, profile } = useAuth()
    const [open, setOpen] = useState(false)
    const [form, setForm] = useState({
        customerName: '',
        customerPhone: '',
        bikeModel: '',
        sizeColor: '',
        budget: '',
        notes: '',
    })
    const can = form.customerName && form.bikeModel

    const submit = async (e) => {
        e.preventDefault()
        if (!can) return
        const payload = {
            ...form,
            budget: form.budget ? Number(form.budget) : null,
            status: 'pending',
            createdAt: serverTimestamp(),
            requesterUid: user?.uid || null,
            requesterName: profile?.displayName || user?.email || null,
            updatedAt: serverTimestamp(),
        }
        const ref = await addDoc(collection(db, 'purchase_requests'), payload)
        await notifyBuyers({
            type: 'request_created',
            message: `Nouvelle demande — ${form.customerName} / ${form.bikeModel}`,
            link: `/requests?focus=${ref.id}`,
        })
        setOpen(false)
        setForm({ customerName: '', customerPhone: '', bikeModel: '', sizeColor: '', budget: '', notes: '' })
        onCreated?.(ref.id)
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
            >
                Nouvelle demande
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-2xl rounded-2xl border bg-white p-5 dark:bg-neutral-900 dark:border-neutral-800">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Nouvelle demande</h3>
                            <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100">
                                Fermer
                            </button>
                        </div>
                        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1">
                                <span className="text-sm opacity-70">Client *</span>
                                <input
                                    className="rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.customerName}
                                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                                    required
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-sm opacity-70">Téléphone</span>
                                <input
                                    className="rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.customerPhone}
                                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                                />
                            </label>
                            <label className="flex flex-col gap-1 sm:col-span-2">
                                <span className="text-sm opacity-70">Modèle *</span>
                                <input
                                    className="rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.bikeModel}
                                    onChange={(e) => setForm({ ...form, bikeModel: e.target.value })}
                                    required
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-sm opacity-70">Taille / Couleur</span>
                                <input
                                    className="rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.sizeColor}
                                    onChange={(e) => setForm({ ...form, sizeColor: e.target.value })}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-sm opacity-70">Budget</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.budget}
                                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                                />
                            </label>
                            <label className="flex flex-col gap-1 sm:col-span-2">
                                <span className="text-sm opacity-70">Notes</span>
                                <textarea
                                    className="min-h-[80px] rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                />
                            </label>
                            <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="px-3 py-1.5 rounded-lg border dark:border-neutral-700"
                                >
                                    Annuler
                                </button>
                                <button
                                    disabled={!can}
                                    className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
                                >
                                    Créer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}

/* ================= Page ================= */
export default function Requests() {
    const { user, profile } = useAuth()
    const location = useLocation()

    const [q, setQ] = useState('')
    const [list, setList] = useState([])
    const [focusId, setFocusId] = useState(null)

    // live data
    useEffect(() => {
        const qRef = query(collection(db, 'purchase_requests'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(qRef, (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
        return () => unsub()
    }, [])

    // focus from ?focus=
    useEffect(() => {
        const id = new URLSearchParams(location.search).get('focus')
        if (id) setFocusId(id)
    }, [location.search])

    useEffect(() => {
        if (!focusId) return
        const el = document.getElementById(`req-${focusId}`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring', 'ring-blue-400', 'ring-offset-2', 'ring-offset-transparent')
        const t = setTimeout(() => {
            el.classList.remove('ring', 'ring-blue-400', 'ring-offset-2', 'ring-offset-transparent')
        }, 2000)
        return () => clearTimeout(t)
    }, [focusId, list])

    const isBuyer = useMemo(() => ['buyer', 'admin'].includes(profile?.role), [profile?.role])
    const isMech = useMemo(() => profile?.role === 'mechanic', [profile?.role])

    // filters
    const toProcess = useMemo(
        () => list.filter((r) => r.status === 'pending' && searchIn(r, q)),
        [list, q]
    )
    const toOrder = useMemo(
        () => list.filter((r) => r.status === 'client_ok' && searchIn(r, q)),
        [list, q]
    )
    const orderedMine = useMemo(
        () => list.filter((r) => r.status === 'ordered' && r.requesterUid === user?.uid && searchIn(r, q)),
        [list, user?.uid, q]
    )
    const arrivedMine = useMemo(
        () => list.filter((r) => r.status === 'arrived' && r.requesterUid === user?.uid && searchIn(r, q)),
        [list, user?.uid, q]
    )
    const mineActive = useMemo(
        () =>
            list.filter(
                (r) =>
                    r.requesterUid === user?.uid &&
                    !['client_ok', 'ordered', 'arrived', 'delivered'].includes(r.status) &&
                    searchIn(r, q)
            ),
        [list, user?.uid, q]
    )

    /* ===== Actions ===== */

    // Acheteur: pending -> approved (notif mécanos)
    const approve = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedByUid: user?.uid,
            approvedByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
        await notifyMechanics({
            type: 'request_approved',
            message: `Demande validée — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    // Acheteur: pending -> rejected (notif mécanos)
    const rejectReq = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'rejected',
            rejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        })
        await notifyMechanics({
            type: 'request_rejected',
            message: `Refusée — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    // Mécano: approved -> client_ok | client_no (notif acheteurs)
    const clientOk = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'client_ok',
            clientConfirmedAt: serverTimestamp(),
            clientConfirmedByUid: user?.uid,
            clientConfirmedByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
        await notifyBuyers({
            type: 'request_client_ok',
            message: `Client OK — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    const clientNo = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'client_no',
            updatedAt: serverTimestamp(),
        })
        await notifyBuyers({
            type: 'request_client_no',
            message: `Client NON — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    // Acheteur: client_ok -> ordered (notif mécanos)
    const markOrdered = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'ordered',
            orderedAt: serverTimestamp(),
            orderedByUid: user?.uid,
            orderedByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
        await notifyMechanics({
            type: 'request_ordered',
            message: `Commande passée — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    // Mécano: ordered -> arrived
    const markArrived = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'arrived',
            arrivedAt: serverTimestamp(),
            arrivedByUid: user?.uid,
            arrivedByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
    }

    // Mécano: arrived -> delivered (notif acheteurs)
    const markDelivered = async (req) => {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'delivered',
            deliveredAt: serverTimestamp(),
            deliveredByUid: user?.uid,
            deliveredByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
        await notifyBuyers({
            type: 'request_delivered',
            message: `Vélo remis — ${req.customerName} / ${req.bikeModel}`,
            link: `/requests?focus=${req.id}`,
        })
    }

    // Delete (admin/buyer toujours; mécano si refusé / client_no)
    const removeReq = async (req) => {
        if (!confirm('Supprimer cette demande ?')) return
        await deleteDoc(doc(db, 'purchase_requests', req.id))
    }

    return (
        <>
            <Navbar />

            <main className="py-6">
                <Container>
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h1 className="text-xl font-semibold">Demandes de commande vélo</h1>
                        <div className="flex items-center gap-2">
                            <input
                                className="w-[240px] rounded-lg border px-3 py-2 bg-transparent dark:border-neutral-700"
                                placeholder="Rechercher…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                            <CreateRequest />
                        </div>
                    </div>

                    {/* Acheteurs */}
                    {isBuyer && (
                        <>
                            <Section title={`À traiter (${toProcess.length})`}>
                                <RequestsTable
                                    rows={toProcess}
                                    role={profile?.role}
                                    canApprove
                                    onApprove={approve}
                                    onReject={rejectReq}
                                />
                            </Section>

                            <Section title={`À commander (${toOrder.length})`}>
                                <RequestsTable rows={toOrder} role={profile?.role} onMarkOrdered={markOrdered} />
                            </Section>
                        </>
                    )}

                    {/* Mécano: mes demandes actives */}
                    <Section title={`Mes demandes (${mineActive.length})`}>
                        <RequestsTable
                            rows={mineActive}
                            role={profile?.role}
                            onClientOk={clientOk}
                            onClientNo={clientNo}
                            onRemove={removeReq}
                        />
                    </Section>

                    {/* Mécano: suivi */}
                    {isMech && (
                        <>
                            <Section title={`Commandées — mes demandes (${orderedMine.length})`}>
                                <RequestsTable rows={orderedMine} role={profile?.role} onArrived={markArrived} />
                            </Section>

                            <Section title={`Arrivées — mes demandes (${arrivedMine.length})`}>
                                <RequestsTable rows={arrivedMine} role={profile?.role} onDelivered={markDelivered} />
                            </Section>
                        </>
                    )}
                </Container>
            </main>
        </>
    )
}
