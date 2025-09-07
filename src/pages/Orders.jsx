import { useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
    addDoc, collection, deleteDoc, doc, onSnapshot,
    orderBy, query, serverTimestamp, updateDoc
} from 'firebase/firestore'

export default function Orders() {
    const { profile, user } = useAuth(s => ({ profile: s.profile, user: s.user }))
    const canDelete = profile?.role === 'admin' || profile?.role === 'buyer' || profile?.role === 'mechanic'
    const canEdit = canDelete || profile?.role === 'staff' || profile?.role === 'mechanic'

    const [orders, setOrders] = useState([])
    const [q, setQ] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState(makeForm())

    // live
    useEffect(() => {
        const qRef = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
        return onSnapshot(qRef, snap => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, [])

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase()
        if (!needle) return orders
        return orders.filter(o => (
            [
                o.customerName, o.customerPhone, o.reference,
                o.createdByName, o.comment
            ].filter(Boolean).join(' ').toLowerCase().includes(needle)
        ))
    }, [orders, q])

    function openNew() {
        setForm(makeForm({ createdByUid: user?.uid, createdByName: profile?.displayName || user?.email || '—' }))
        setShowForm(true)
    }

    async function saveOrder(e) {
        e.preventDefault()
        if (!form.customerName.trim()) return alert('Nom requis')
        const price = parseFloat((form.price || '0').toString().replace(',', '.')) || 0
        const data = {
            customerName: form.customerName.trim(),
            customerPhone: form.customerPhone?.trim() || null,
            orderDate: form.orderDate || null,     // yyyy-mm-dd
            reference: form.reference?.trim() || null,
            price,
            createdByName: form.createdByName || null,
            createdByUid: form.createdByUid || user?.uid,
            comment: form.comment?.trim() || null,
            receivedAt: form.receivedAt || null,
            calledAt: form.calledAt || null,
            completedAt: form.completedAt || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'orders'), data)
        setShowForm(false)
    }

    async function mark(order, field) {
        const now = new Date().toISOString()
        const patch = { updatedAt: serverTimestamp() }
        if (field === 'receivedAt') patch.receivedAt = now
        if (field === 'calledAt') patch.calledAt = now
        if (field === 'completedAt') patch.completedAt = now
        await updateDoc(doc(db, 'orders', order.id), patch)
    }

    async function updateComment(order, text) {
        await updateDoc(doc(db, 'orders', order.id), {
            comment: text || null, updatedAt: serverTimestamp(),
        })
    }

    async function remove(order) {
        if (!canDelete) return
        if (!confirm(`Supprimer la commande de ${order.customerName || '—'} ?`)) return
        await deleteDoc(doc(db, 'orders', order.id))
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />

            <main className="flex-1 p-4">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h1 className="font-heading text-xl">Commandes client</h1>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <input
                                className="Input w-full sm:w-80"
                                placeholder="Recherche (nom, tél, réf, …)"
                                value={q} onChange={e => setQ(e.target.value)}
                            />
                            {canEdit && (
                                <button onClick={openNew}
                                    className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black">
                                    Nouvelle
                                </button>
                            )}
                            <CSVImport onImport={(rows) => bulkImport(rows, { user, profile, setMsg: () => { } })} />
                        </div>
                    </div>

                    {/* Tableau */}
                    <div className="overflow-x-auto rounded-2xl border bg-white dark:bg-neutral-900/80 dark:border-neutral-800">
                        <table className="w-full text-sm">
                            {/* Largeurs stables = pas de chevauchement */}
                            <colgroup><col style={{ width: 180 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 100 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 260 }} /><col style={{ width: 520 }} /><col style={{ width: 140 }} /></colgroup>
                            <thead className="sticky top-0 z-10 bg-white/90 dark:bg-neutral-900/90 backdrop-blur text-left text-gray-600 dark:text-neutral-400">
                                <tr>
                                    <th className="py-2 px-3">Client</th>
                                    <th className="py-2 px-3">Tél</th>
                                    <th className="py-2 px-3">Date cmd</th>
                                    <th className="py-2 px-3">Réf</th>
                                    <th className="py-2 px-3 text-right">Prix</th>
                                    <th className="py-2 px-3">Par</th>
                                    <th className="py-2 px-3">Statut</th>
                                    <th className="py-2 px-3">Commentaire</th>
                                    <th className="py-2 px-3">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filtered.map((o) => (
                                    <tr key={o.id} className="border-t border-gray-100 dark:border-neutral-800 hover:bg-black/5 dark:hover:bg-white/5 align-top">
                                        <td className="py-3 px-3 whitespace-nowrap">{o.customerName || '—'}</td>
                                        <td className="py-3 px-3 whitespace-nowrap">{o.customerPhone || '—'}</td>
                                        <td className="py-3 px-3 whitespace-nowrap">{fmtDate(o.orderDate)}</td>
                                        <td className="py-3 px-3 whitespace-nowrap font-mono text-xs">{o.reference || '—'}</td>
                                        <td className="py-3 px-3 whitespace-nowrap text-right tabular-nums">{fmtPrice(o.price)}</td>
                                        <td className="py-3 px-3 whitespace-nowrap">{o.createdByName || '—'}</td>

                                        {/* Statut + progression + petites dates */}
                                        <td className="py-3 px-3">
                                            <OrderStatus order={o} />
                                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 space-x-2">
                                                {o.receivedAt && <span>Réception&nbsp;: {fmtShort(o.receivedAt)}</span>}
                                                {o.calledAt && <span>Appel&nbsp;: {fmtShort(o.calledAt)}</span>}
                                            </div>
                                        </td>

                                        {/* Commentaire (beau, auto-save) */}
                                        <td className="py-3 px-3 align-top">
                                            <CommentCell
                                                value={o.comment || ''}
                                                canEdit={canEdit}
                                                onSave={(v) => updateComment(o, v)}
                                            />
                                        </td>

                                        {/* Actions compactes */}
                                        <td className="py-3 px-3">
                                            <div className="flex items-center gap-2">
                                                <NextActionButton order={o} onAction={(field) => mark(o, field)} disabled={!canEdit} size="sm" />
                                                {canDelete && (
                                                    <IconButton
                                                        title="Supprimer"
                                                        variant="danger"
                                                        onClick={() => remove(o)}
                                                    >
                                                        <TrashIcon className="h-4 w-4" />
                                                    </IconButton>
                                                )}
                                            </div>
                                        </td>

                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="py-6 text-center text-gray-500 dark:text-neutral-400">Aucune commande.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal création */}
            {showForm && (
                <Modal onClose={() => setShowForm(false)} title="Nouvelle commande">
                    <form onSubmit={saveOrder} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Nom du client *">
                            <input className="Input" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} autoFocus />
                        </Field>
                        <Field label="Téléphone">
                            <input className="Input" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
                        </Field>
                        <Field label="Date de commande">
                            <input type="date" className="Input" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} />
                        </Field>
                        <Field label="Référence">
                            <input className="Input" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
                        </Field>
                        <Field label="Prix (€)">
                            <input className="Input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                        </Field>
                        <Field label="Fait par">
                            <input className="Input" value={form.createdByName} onChange={e => setForm({ ...form, createdByName: e.target.value })} />
                        </Field>
                        <div className="md:col-span-2">
                            <Field label="Commentaire">
                                <textarea rows={3} className="Input" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} />
                            </Field>
                        </div>
                        <div className="md:col-span-2 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setShowForm(false)}
                                className="px-3 py-2 rounded-xl border border-gray-300 hover:bg-gray-50
                                 dark:border-neutral-700 dark:hover:bg-neutral-800">
                                Annuler
                            </button>
                            <button type="submit" className="px-3 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black">
                                Créer
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}

/* ===================== Helpers format ===================== */
function fmtDate(d) {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR') } catch { return d }
}
function fmtShort(d) {
    if (!d) return '—'
    try {
        const x = new Date(d)
        const dd = x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        const hh = x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        return `${dd} ${hh}`
    } catch { return d }
}
function fmtPrice(n) {
    const v = Number(n || 0)
    return v
        ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
        : '—'
}

/* ===================== Statut & actions ===================== */
function statusKey(o) {
    if (o.completedAt) return 'completed'
    if (o.calledAt) return 'called'
    if (o.receivedAt) return 'received'
    return 'pending'
}

function OrderStatus({ order }) {
    const key = statusKey(order)
    const map = {
        pending: { label: 'En attente', cls: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-300' },
        received: { label: 'Reçu', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-300' },
        called: { label: 'Appelé', cls: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-300' },
        completed: { label: 'Terminé', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300' },
    }
    const step = { pending: 0, received: 1, called: 2, completed: 3 }[key]
    return (
        <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded-full text-xs border ${map[key].cls}`}>{map[key].label}</span>
            <div className="h-1.5 flex-1 min-w-[90px] max-w-[130px] rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
                <div className="h-full bg-white/80 dark:bg-white" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
        </div>
    )
}

function NextActionButton({ order, onAction, disabled, size = 'md' }) {
    const key = statusKey(order)
    if (key === 'completed') return null
    const cfg = {
        pending: { field: 'receivedAt', label: 'Réceptionner' },
        received: { field: 'calledAt', label: 'Appeler le client' },
        called: { field: 'completedAt', label: 'Terminer' },
    }[key]
    return (
        <button
            onClick={() => onAction(cfg.field)}
            disabled={disabled}
            className={`rounded-lg border border-gray-300 hover:bg-gray-50                 
                dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-60
                 ${size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-1.5'}`}>
            {cfg.label}
        </button>
    )
}

/* ===================== UI helpers ===================== */
/* ---------- Textarea auto-hauteur + styles dark soyeux ---------- */
function AutoTextarea({ value, onChange, disabled, placeholder = '' }) {
    const [v, setV] = useState(value)
    const ref = useRef(null)
    useEffect(() => setV(value), [value])
    useEffect(() => {
        if (!ref.current) return
        ref.current.style.height = 'auto'
        ref.current.style.height = Math.min(ref.current.scrollHeight, 180) + 'px'
    }, [v])
    return (
        <textarea
            ref={ref}
            rows={1}
            disabled={disabled}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => { if (v !== value) onChange?.(v) }}
            placeholder={placeholder}
            className={[
                'Input w-full !resize-none !overflow-hidden !min-h-[40px]',
                '!bg-neutral-800/40 !text-neutral-100 !placeholder-neutral-400',
                '!border !border-white/10 focus:!border-white/20',
                'rounded-xl px-3 py-2 outline-none shadow-inner focus:shadow-none',
                disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-neutral-800/50'
            ].join(' ')}
        />
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

function Modal({ title, children, onClose }) {
    return (
        <div className="fixed inset-0 z-50 p-4 grid place-items-center bg-black/40 backdrop-blur">
            <div className="w-full max-w-2xl rounded-3xl border bg-white dark:bg-neutral-900 dark:border-neutral-800">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-neutral-800">
                    <div className="font-semibold">{title}</div>
                    <button onClick={onClose}
                        className="px-3 py-1.5 rounded-xl border border-gray-300 hover:bg-gray-50
                             dark:border-neutral-700 dark:hover:bg-neutral-800">
                        Fermer
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    )
}

/* ===================== Import CSV (optionnel) ===================== */
function CSVImport({ onImport }) {
    const inputRef = useRef(null)
    function choose() { inputRef.current?.click() }
    async function handleFile(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const text = await file.text()
        const rows = parseCSV(text)
        if (!rows.length) return alert('CSV vide ou entêtes manquantes')
        onImport?.(rows)
        e.target.value = ''
    }
    return (
        <>
            <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <button onClick={choose}
                className="h-10 px-3 rounded-xl border text-sm
                         border-gray-300 hover:bg-gray-50
                         dark:border-neutral-700 dark:hover:bg-neutral-800">
                Import CSV
            </button>
        </>
    )
}

function parseCSV(text) {
    const delim = text.indexOf(';') > -1 ? ';' : ','
    const lines = text.split(/\r?\n/).filter(l => l.trim().length)
    if (lines.length <= 1) return []
    const headers = lines[0].split(delim).map(h => h.trim().toLowerCase())
    const idx = (names) => headers.findIndex(h => names.includes(h))
    const iName = idx(['nom', 'name', 'client', 'client name'])
    const iPhone = idx(['tel', 'téléphone', 'telephone', 'phone'])
    const iDate = idx(['date', 'date commande', 'datecmd', 'order date'])
    const iRef = idx(['ref', 'réf', 'reference', 'référence'])
    const iPrice = idx(['prix', 'price'])
    const iBy = idx(['par', 'fait par', 'created by', 'auteur'])
    const iCom = idx(['commentaire', 'comment'])
    const rows = []
    for (let li = 1; li < lines.length; li++) {
        const cols = lines[li].split(delim).map(c => c.trim())
        if (!cols.length) continue
        rows.push({
            customerName: cols[iName] || '',
            customerPhone: cols[iPhone] || '',
            orderDate: cols[iDate] || '',
            reference: cols[iRef] || '',
            price: parseFloat((cols[iPrice] || '0').replace(',', '.')) || 0,
            createdByName: cols[iBy] || '',
            comment: cols[iCom] || '',
        })
    }
    return rows
}

async function bulkImport(rows, { user, profile }) {
    if (!rows?.length) return
    try {
        for (const r of rows) {
            await addDoc(collection(db, 'orders'), {
                ...r,
                createdByUid: user?.uid || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                receivedAt: null, calledAt: null, completedAt: null,
            })
        }
        alert(`${rows.length} lignes importées`)
    } catch (e) {
        console.error('import error', e)
        alert("Erreur à l'import : " + (e.message || 'inconnu'))
    }
}

// Crée un objet formulaire “commande client”
function makeForm(seed = {}) {
    return {
        customerName: '',          // Nom du client
        customerPhone: '',         // Téléphone
        orderDate: '',             // yyyy-mm-dd
        reference: '',             // Référence
        price: '',                 // Prix saisi (string, on parse au save)
        createdByName: seed.createdByName || '',
        createdByUid: seed.createdByUid ?? null,
        comment: '',

        // Étapes de suivi (timestamps ISO, null par défaut)
        receivedAt: null,
        calledAt: null,
        completedAt: null,
    }
}

/* ---------- Cellule de commentaire avec autosave + indicateur ---------- */
function CommentCell({ value, canEdit, onSave }) {
    const [v, setV] = useState(value)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState(null)

    useEffect(() => setV(value), [value])

    // autosave débouncé
    useEffect(() => {
        if (v === value) return
        if (!canEdit) return
        setSaving(true)
        const t = setTimeout(async () => {
            try { await onSave?.(v) } finally {
                setSaving(false)
                setSavedAt(Date.now())
            }
        }, 600) // 600ms après la dernière frappe
        return () => clearTimeout(t)
    }, [v, value, canEdit, onSave])

    return (
        <div className="flex flex-col gap-1">
            <AutoTextarea
                value={v}
                onChange={setV}
                disabled={!canEdit}
                placeholder="Commentaire…"
            />
            <div className="h-4 text-[11px] text-right">
                {saving ? (
                    <span className="text-neutral-400">Enregistrement…</span>
                ) : savedAt ? (
                    <span className="text-neutral-500">Enregistré</span>
                ) : null}
            </div>
        </div>
    )
}

/* ------------ IconButton générique ------------ */
function IconButton({ title, onClick, variant = 'default', children }) {
    const base =
        "h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors"
    const variants = {
        default: "border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800",
        danger: "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20",
    }
    return (
        <button title={title} aria-label={title} onClick={onClick} className={`${base} ${variants[variant]}`}>
            {children}
        </button>
    )
}

/* ------------ Icône poubelle (SVG) ------------ */
function TrashIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 6h18" strokeLinecap="round" />
            <path d="M8 6V4.8c0-.995.805-1.8 1.8-1.8h4.4c.995 0 1.8.805 1.8 1.8V6" />
            <path d="M19 6l-1 13a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8L5 6" />
            <path d="M10 10v7M14 10v7" strokeLinecap="round" />
        </svg>
    )
}
