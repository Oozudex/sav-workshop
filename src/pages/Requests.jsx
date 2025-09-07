import { useEffect, useMemo, useState } from 'react'
import Navbar from '../components/Navbar'
import { db } from '../lib/firebase'
import { useAuth } from '../store/useAuth'
import {
    addDoc, collection, doc, onSnapshot, query, orderBy,
    serverTimestamp, updateDoc, getDocs, where, deleteDoc
} from 'firebase/firestore'

const STATUSES = ['pending', 'approved', 'rejected', 'client_ok', 'client_no', 'ordered', 'delivered']

export default function Requests() {
    const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))

    const [list, setList] = useState([])
    const [q, setQ] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState(makeForm({ requesterUid: user?.uid, requesterName: profile?.displayName || user?.email }))

    // live
    useEffect(() => {
        const qRef = query(
            collection(db, 'purchase_requests'),
            orderBy('createdAt', 'desc')
        )
        return onSnapshot(qRef, snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, [])

    // qui suis-je ?
    const isBuyer = useMemo(() => ['buyer', 'admin'].includes(profile?.role), [profile?.role])
    const isMech = useMemo(() => profile?.role === 'mechanic', [profile?.role])

    // dérivés de la liste
    const pendingAll = useMemo(
        () => list.filter(r => r.status === 'pending' || r.status === 'client_ok'),
        [list]
    )
    const toOrder = useMemo(() => list.filter(r => r.status === 'ordered'), [list])     // À commander
    const mine = useMemo(
        () => list.filter(r =>
            r.requesterUid === user?.uid && !['client_ok', 'ordered', 'delivered'].includes(r.status)
        ),
        [list, user?.uid]
    )
    const myOrdered = useMemo(() => list.filter(r => r.requesterUid === user?.uid && r.status === 'ordered'), [list, user?.uid])
    const toHandle = useMemo(() => list.filter(r => r.status === 'pending'), [list])

    const filteredMine = useMemo(() => filterReqs(mine, q), [mine, q])
    const filteredToHandle = useMemo(() => filterReqs(toHandle, q), [toHandle, q])

    function openForm() { setForm(makeForm({ requesterUid: user?.uid, requesterName: profile?.displayName || user?.email })); setShowForm(true) }

    async function createReq(e) {
        e.preventDefault()
        if (!form.customerName.trim()) return alert('Nom client requis')
        if (!form.bikeModel.trim()) return alert('Modèle requis')
        await addDoc(collection(db, 'purchase_requests'), {
            ...form,
            budget: parseFloat((form.budget || '').toString().replace(',', '.')) || null,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        })
        // notif pour acheteurs (option: envoyer à tous acheteurs/admin – ici on ne cible pas)
        await notifyBuyers({
            type: 'request_created',
            message: `Nouvelle demande : ${form.customerName} — ${form.bikeModel}`,
        })
        setShowForm(false)
    }

    async function approve(req) {
        await notifyMechanics({
            type: 'request_approved',
            message: `OK pour ${req.customerName} — ${req.bikeModel}. Prévenez le client.`,
        })
    }
    async function rejectReq(req) {
        const reason = prompt('Motif du refus ? (optionnel)') || ''
        await notifyMechanics({
            type: 'request_rejected',
            message: `Refusé pour ${req.customerName} — ${req.bikeModel}${reason ? ` : ${reason}` : ''}`,
        })
    }

    async function clientOk(req) {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'client_ok',
            clientConfirmedAt: serverTimestamp(),
            clientConfirmedByUid: user?.uid,
            clientConfirmedByName: profile?.displayName || user?.email,
            updatedAt: serverTimestamp(),
        })
        await notifyBuyers({
            type: 'request_client_ok',
            message: `Client OK — ${req.customerName} pour ${req.bikeModel}. Procéder à la commande.`,
        })
    }

    async function clientNo(req) {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'client_no',
            clientDeclinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        })
        // Optionnel : notifier l’acheteur que le client refuse
        // await notifyBuyers({ type:'request_client_no', message:`Client NON — ${req.customerName} (${req.bikeModel})` })
    }

    async function removeReq(req) {
        if (!confirm('Supprimer cette demande ?')) return
        await deleteDoc(doc(db, 'purchase_requests', req.id))
    }


    async function markNotified(req) {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'notified', notifiedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        // optionnel: notifier acheteur que le client a été prévenu
        await addDoc(collection(db, 'notifications'), {
            toUid: req.approvedByUid || req.requesterUid, // à adapter si on assigne un buyer
            type: 'request_notified',
            message: `Client ${req.customerName} prévenu ( ${req.bikeModel} ).`,
            createdAt: serverTimestamp(),
            read: false
        })
    }

    async function markOrdered(req, { user, profile }) {
        await updateDoc(doc(db, 'purchase_requests', req.id), {
            status: 'ordered',
            orderedAt: serverTimestamp(),
            orderedByUid: user?.uid || null,
            orderedByName: profile?.displayName || user?.email || null,
            updatedAt: serverTimestamp(),
        })
        await notifyMechanics({
            type: 'request_ordered',
            message: `Commande passée : ${req.customerName} — ${req.bikeModel}`,
        })
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />

            <main className="flex-1 p-4">
                <div className="max-w-7xl mx-auto space-y-6">

                    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <h1 className="font-heading text-xl">Demandes vélo</h1>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <input className="Input w-full sm:w-80" placeholder="Recherche (client, modèle, taille…)"
                                value={q} onChange={e => setQ(e.target.value)} />
                            <button onClick={openForm}
                                className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black">
                                Nouvelle demande
                            </button>
                        </div>
                    </header>

                    {/* En attente — toutes (déjà chez toi) */}
                    <Section title={`En attente — toutes (${pendingAll.length})`}>
                        <RequestsTable
                            rows={filterReqs(pendingAll, q)}
                            role={profile?.role}
                            canApprove={isBuyer}
                            onApprove={(r) => approve(r)}
                            onReject={(r) => rejectReq(r)}
                            onMarkOrdered={isBuyer ? (r) => markOrdered(r, { user, profile }) : undefined}
                        />
                    </Section>

                    {/* Acheteur/Admin : À commander (Client OK) */}
                    {isBuyer && (
                        <Section title={`À commander (${toOrder.length})`}>
                            <RequestsTable
                                rows={filterReqs(toOrder, q)}
                                role={profile?.role}
                                onMarkOrdered={(r) => markOrdered(r, { user, profile })}
                            />
                        </Section>
                    )}

                    {/* Mes demandes (tous) */}
                    <Section title={`Mes demandes (${mine.length})`}>
                        <RequestsTable
                            rows={filterReqs ? filterReqs(myOrdered, q) : myOrdered}
                            role={profile?.role}
                            onClientOk={(r) => clientOk(r, { user, profile })}
                            onClientNo={(r) => clientNo(r)}
                            onRemove={(r) => removeReq(r)}
                            onDelivered={(r) => markDelivered(r, { user, profile })}
                        />
                    </Section>

                    {/* Mécano : Commandées — mes demandes (info pour répondre au client) */}
                    {isMech && (
                        <Section title={`Commandées — mes demandes (${myOrdered.length})`}>
                            <RequestsTable rows={filterReqs(myOrdered, q)} role={profile?.role} />
                        </Section>
                    )}
                </div>
            </main>

            {showForm && (
                <Modal onClose={() => setShowForm(false)} title="Nouvelle demande">
                    <form onSubmit={createReq} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Client *">
                            <input className="Input" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} autoFocus />
                        </Field>
                        <Field label="Téléphone">
                            <input className="Input" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
                        </Field>
                        <Field label="Modèle *">
                            <input className="Input" value={form.bikeModel} onChange={e => setForm({ ...form, bikeModel: e.target.value })} />
                        </Field>
                        <Field label="Taille / Couleur">
                            <input className="Input" value={form.sizeColor} onChange={e => setForm({ ...form, sizeColor: e.target.value })} placeholder="ex: M / Noir" />
                        </Field>
                        <Field label="Budget (€)">
                            <input className="Input" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
                        </Field>
                        <div className="md:col-span-2">
                            <Field label="Notes">
                                <textarea rows={3} className="Input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                            </Field>
                        </div>
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 rounded-xl border">Annuler</button>
                            <button type="submit" className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black">Créer</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}

// --- helpers notifs ---
async function notifyUser(uid, payload) {
    await addDoc(collection(db, 'notifications'), {
        toUid: uid, read: false, createdAt: serverTimestamp(), ...payload,
    })
}

async function notifyByRoles(roles, payload) {
    // envoie à tous les users dont le rôle est dans roles
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', roles)))
    await Promise.all(snap.docs.map(d => notifyUser(d.id, payload)))
}
const notifyBuyers = (payload) => notifyByRoles(['buyer', 'admin'], payload)
const notifyMechanics = (payload) => notifyByRoles(['mechanic'], payload)

/* ============ sous-composants ============ */
function RequestsTable({ rows, role, canApprove = false, onApprove, onReject, onClientOk, onClientNo, onRemove, onMarkOrdered }) {
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
                        rows.map(r => (
                            <tr key={r.id} className="border-t border-gray-100 dark:border-neutral-800 hover:bg-black/5 dark:hover:bg-white/5">
                                <td className="py-2 px-3">{r.customerName}</td>
                                <td className="py-2 px-3">{r.customerPhone || '—'}</td>
                                <td className="py-2 px-3">{r.bikeModel}</td>
                                <td className="py-2 px-3">{r.sizeColor || '—'}</td>
                                <td className="py-2 px-3 text-right">{fmtPrice(r.budget)}</td>
                                <td className="py-2 px-3">{r.requesterName || '—'}</td>
                                <td className="py-2 px-3"><StatusChip status={r.status} /></td>
                                <td className="py-2 px-3">
                                    <div className="flex flex-wrap gap-2">
                                        {canApprove && r.status === 'pending' && (
                                            <>
                                                <button onClick={() => onApprove?.(r)} className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20">Valider</button>
                                                <button onClick={() => onReject?.(r)} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20">Refuser</button>
                                            </>
                                        )}

                                        {isMech && r.status === 'approved' && (
                                            <>
                                                <button onClick={() => onClientOk?.(r)} className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20">Client OK</button>
                                                <button onClick={() => onClientNo?.(r)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Client NON</button>
                                            </>
                                        )}

                                        {((role === 'buyer' || role === 'admin') || canDeleteByMech(r)) && (
                                            <button onClick={() => onRemove?.(r)} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20">Supprimer</button>
                                        )}
                                        {isBuyer && r.status === 'client_ok' && (
                                            <button
                                                onClick={() => onMarkOrdered?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50
                                                dark:border-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/20">
                                                Commandée
                                            </button>
                                        )}

                                        {isMech && r.status === 'ordered' && (
                                            <button
                                                onClick={() => onDelivered?.(r)}
                                                className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50
                                                dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                                                Vélo remis
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

/* helpers simples */
function Section({ title, children }) {
    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold opacity-80">{title}</h2>
            {children}
        </section>
    )
}
function StatusChip({ status }) {
    const map = {
        pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-300',
        approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
        rejected: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
        client_ok: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
        client_no: 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-300',
        ordered: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300',
        delivered: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
    }
    const label = {
        pending: 'En attente', approved: 'Validée', rejected: 'Refusée',
        client_ok: 'Client OK', client_no: 'Client NON', ordered: 'Commandée', delivered: 'Remis au client'
    }[status] || status
    return <span className={`inline-block px-2 py-1 rounded-full text-xs border ${map[status]}`}>{label}</span>
}
function fmtPrice(n) {
    const v = Number(n || 0); return v ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v) : '—'
}
function filterReqs(arr, q) {
    const needle = q.trim().toLowerCase()
    if (!needle) return arr
    return arr.filter(r =>
        [r.customerName, r.customerPhone, r.bikeModel, r.sizeColor, r.requesterName]
            .filter(Boolean).join(' ').toLowerCase().includes(needle)
    )
}
function makeForm(seed = {}) {
    return {
        customerName: '', customerPhone: '', bikeModel: '',
        sizeColor: '', budget: '', notes: '',
        requesterUid: seed.requesterUid || null,
        requesterName: seed.requesterName || '',
    }
}

/* Modale & champ réutilisables (déjà présentes ailleurs ? sinon colle-les) */
function Modal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 p-4 grid place-items-center bg-black/40 backdrop-blur">
            <div className="w-full max-w-2xl rounded-3xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
                    <div className="font-semibold">{title}</div>
                    <button onClick={onClose} className="px-3 py-1.5 rounded-xl border border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">Fermer</button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    )
}
function Field({ label, children }) {
    return (
        <label className="block">
            <div className="text-sm mb-1 text-gray-700 dark:text-neutral-300">{label}</div>
            {children}
        </label>
    )
}

async function markDelivered(req, { user, profile }) {
    await updateDoc(doc(db, 'purchase_requests', req.id), {
        status: 'delivered',
        deliveredAt: serverTimestamp(),
        deliveredByUid: user?.uid || null,
        deliveredByName: profile?.displayName || user?.email || null,
        updatedAt: serverTimestamp(),
    })
    await notifyBuyers({
        type: 'request_delivered',
        message: `Vélo remis : ${req.customerName} — ${req.bikeModel}`,
    })
}
