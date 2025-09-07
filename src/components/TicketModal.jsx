import { useEffect, useRef, useState } from 'react'
import StatusBadge from './StatusBadge'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
    collection, addDoc, onSnapshot, query, orderBy,
    serverTimestamp, doc, updateDoc, arrayUnion
} from 'firebase/firestore'

const LABELS = {
    New: 'Nouveau',
    Diagnostic: 'Diagnostic',
    WaitingParts: 'En attente pièces',
    WaitingCustomer: 'En attente client',
    InProgress: 'En réparation',
    Ready: 'Prêt à rendre',
    Closed: 'Clôturé',
}
const STATUSES = Object.keys(LABELS)

const CONTACT_PREFS = ['Téléphone', 'Email', 'Indifférent']
const BIKE_TYPES = ['VTT', 'Route', 'Gravel', 'Urbain', 'Enfant']
const PRIORITIES = ['Normal', 'Urgent']

export default function TicketModal({ ticket, role, onClose, onDelete, onMoveTo }) {
    const overlayRef = useRef(null)
    const urgent = ticket.priority === 'Urgent'
    const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))

    // --- Commentaires
    const [comments, setComments] = useState([])
    const [commentText, setCommentText] = useState('')

    // --- Edition
    const myRole = role || profile?.role
    const canAdmin = myRole === 'admin' || myRole === 'buyer'        // buyer = admin
    const canEdit = ['admin', 'buyer', 'staff', 'mechanic'].includes(myRole)
    const canEditAll = ['admin', 'buyer', 'staff'].includes(myRole)    // full édition
    const canEditLimited = ['mechanic'].includes(myRole)                   // limité = mécano seul

    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [draft, setDraft] = useState(makeDraft(ticket))
    useEffect(() => { setDraft(makeDraft(ticket)) }, [ticket?.id])

    function onOverlayClick(e) { if (e.target === overlayRef.current) onClose?.() }
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose?.()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Live comments
    useEffect(() => {
        if (!ticket?.id) return
        const q = query(collection(db, 'tickets', ticket.id, 'comments'), orderBy('createdAt', 'asc'))
        const unsub = onSnapshot(q, snap => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })
        return unsub
    }, [ticket?.id])

    async function submitComment(e) {
        e?.preventDefault?.()
        const text = commentText.trim()
        if (!text) return
        const author = profile?.displayName || user?.email || 'Utilisateur'

        await addDoc(collection(db, 'tickets', ticket.id, 'comments'), {
            text, createdAt: serverTimestamp(), createdBy: user.uid, author,
        })

        const excerpt = text.length > 120 ? text.slice(0, 117) + '…' : text
        await updateDoc(doc(db, 'tickets', ticket.id), {
            updatedAt: serverTimestamp(),
            history: arrayUnion({
                at: new Date().toISOString(),
                by: user.uid,
                action: 'comment',
                note: excerpt,
            }),
        })
        setCommentText('')
    }

    function onChange(k, v) { setDraft(d => ({ ...d, [k]: v })) }

    async function saveEdits() {
        if (!canEdit) return
        setSaving(true)
        try {
            const before = makeDraft(ticket)
            const after = sanitizeDraft(draft)
            const changed = diff(before, after)
            if (Object.keys(changed).length === 0) {
                setEditing(false); setSaving(false); return
            }

            // Note lisible pour l'historique
            const labels = {
                customerName: 'client',
                customerPhone: 'téléphone',
                customerEmail: 'email',
                preferredContact: 'contact préféré',
                bikeType: 'type vélo',
                bikeBrand: 'marque',
                bikeModel: 'modèle',
                serialNumber: 'n° série',
                purchaseDate: "date d'achat",
                underWarranty: 'garantie',
                issueDescription: 'problème',
                accessoriesLeft: 'accessoires',
                priority: 'priorité',
                dueDate: 'date prévue',
                assignedTo: 'assigné à',
            }
            const note = Object.keys(changed)
                .map(k => `${labels[k] || k}`)
                .join(', ')

            await updateDoc(doc(db, 'tickets', ticket.id), {
                ...changed,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    by: user.uid,
                    action: 'edit',
                    note: `Champs modifiés : ${note}`,
                }),
            })

            setEditing(false)
        } catch (e) {
            console.error('SAVE ERROR', e)
            alert("Impossible d'enregistrer : " + (e.message || 'inconnu'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            ref={overlayRef}
            onClick={onOverlayClick}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
            <div className="w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden
                      rounded-3xl shadow-2xl border border-gray-200 bg-white
                      dark:border-white/10 dark:bg-gradient-to-b dark:from-neutral-900 dark:to-neutral-950">

                {/* HEADER */}
                <div className="sticky top-0 z-10 px-5 py-4 border-b
                        bg-white/90 backdrop-blur border-gray-200
                        dark:bg-neutral-900/80 dark:border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="font-heading text-xl tracking-tight text-gray-900 dark:text-white/95">
                                Ticket #{ticket.ticketNumber || ticket.id}
                            </h3>
                            <span className="scale-95"><StatusBadge status={ticket.status} /></span>
                            {urgent && <Chip color="red">⚡ Urgent</Chip>}
                        </div>
                        <div className="flex items-center gap-2">
                            {canEdit && !editing && (
                                <button
                                    onClick={() => { setDraft(makeDraft(ticket)); setEditing(true) }}
                                    className="px-3 py-2 rounded-xl border text-gray-700 hover:bg-gray-50
                             border-gray-300 dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5">
                                    Modifier
                                </button>
                            )}
                            {editing && (
                                <>
                                    <button
                                        onClick={() => { setDraft(makeDraft(ticket)); setEditing(false) }}
                                        className="px-3 py-2 rounded-xl border text-gray-700 hover:bg-gray-50
                               border-gray-300 dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5">
                                        Annuler
                                    </button>
                                    <button
                                        onClick={saveEdits}
                                        disabled={saving}
                                        className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-60
                               dark:bg-white dark:text-black"
                                    >
                                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                                    </button>
                                </>
                            )}
                            {canAdmin && (
                                <button
                                    onClick={onDelete}
                                    className="px-3 py-2 rounded-xl border text-red-600 hover:bg-red-50
                             border-red-200 dark:text-red-300 dark:border-red-500/30 dark:hover:bg-red-500/10">
                                    Supprimer
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="px-3 py-2 rounded-xl border text-gray-700 hover:bg-gray-50
                           border-gray-300 dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
                    {/* Colonne gauche */}
                    <div className="md:col-span-6 space-y-4">
                        <Section title="Client">
                            <FieldRow label="Nom">
                                {editing
                                    ? <input className="Input" value={draft.customerName} onChange={e => onChange('customerName', e.target.value)} />
                                    : <Value>{ticket.customerName}</Value>}
                            </FieldRow>
                            <FieldRow label="Téléphone">
                                {editing
                                    ? <input className="Input" value={draft.customerPhone || ''} onChange={e => onChange('customerPhone', e.target.value)} />
                                    : <Value>{ticket.customerPhone || '—'}</Value>}
                            </FieldRow>
                            <FieldRow label="Email">
                                {editing
                                    ? <input type="email" className="Input" value={draft.customerEmail || ''} onChange={e => onChange('customerEmail', e.target.value)} />
                                    : <Value>{ticket.customerEmail || '—'}</Value>}
                            </FieldRow>
                            <FieldRow label="Contact préféré">
                                {editing
                                    ? (
                                        <select className="Input" value={draft.preferredContact || 'Téléphone'} onChange={e => onChange('preferredContact', e.target.value)}>
                                            {CONTACT_PREFS.map(v => <option key={v}>{v}</option>)}
                                        </select>
                                    )
                                    : <Value>{ticket.preferredContact || '—'}</Value>}
                            </FieldRow>
                        </Section>

                        <Section title="Vélo">
                            <FieldRow label="Type">
                                {editing
                                    ? (
                                        <select className="Input" value={draft.bikeType || 'VTT'} onChange={e => onChange('bikeType', e.target.value)}>
                                            {BIKE_TYPES.map(v => <option key={v}>{v}</option>)}
                                        </select>
                                    )
                                    : <Value>{ticket.bikeType}</Value>}
                            </FieldRow>
                            <FieldRow label="Marque">
                                {editing
                                    ? <input className="Input" value={draft.bikeBrand || ''} onChange={e => onChange('bikeBrand', e.target.value)} />
                                    : <Value>{ticket.bikeBrand || '—'}</Value>}
                            </FieldRow>
                            <FieldRow label="Modèle">
                                {editing
                                    ? <input className="Input" value={draft.bikeModel || ''} onChange={e => onChange('bikeModel', e.target.value)} />
                                    : <Value>{ticket.bikeModel || '—'}</Value>}
                            </FieldRow>
                            <FieldRow label="N° de série">
                                {editing
                                    ? <input className="Input" value={draft.serialNumber || ''} onChange={e => onChange('serialNumber', e.target.value)} />
                                    : <Value>{ticket.serialNumber || '—'}</Value>}
                            </FieldRow>
                            <FieldRow label="Date d’achat">
                                {editing
                                    ? <input type="date" className="Input" value={draft.purchaseDate || ''} onChange={e => onChange('purchaseDate', e.target.value)} />
                                    : <Value>{formatDateYMD(ticket.purchaseDate)}</Value>}
                            </FieldRow>
                            <FieldRow label="Sous garantie">
                                {editing
                                    ? (
                                        <label className="inline-flex items-center gap-2">
                                            <input type="checkbox" className="h-4 w-4" checked={!!draft.underWarranty} onChange={e => onChange('underWarranty', e.target.checked)} />
                                            <span>Oui</span>
                                        </label>
                                    )
                                    : <Value>{ticket.underWarranty ? 'Oui' : 'Non'}</Value>}
                            </FieldRow>
                        </Section>

                        <Section title="Problème">
                            <FieldRow label="Problème signalé" grow>
                                {editing
                                    ? <textarea rows={4} className="Input" value={draft.issueDescription || ''} onChange={e => onChange('issueDescription', e.target.value)} />
                                    : <Block value={ticket.issueDescription || '—'} />}
                            </FieldRow>
                            <FieldRow label="Accessoires laissés" grow>
                                {editing
                                    ? <textarea rows={3} className="Input" value={draft.accessoriesLeft || ''} onChange={e => onChange('accessoriesLeft', e.target.value)} />
                                    : <Value>{ticket.accessoriesLeft || '—'}</Value>}
                            </FieldRow>
                        </Section>
                    </div>

                    {/* Colonne droite */}
                    <div className="md:col-span-6 space-y-4">
                        {/* Statut : inchangé (boutons) */}
                        <Section title="Changer le statut">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {STATUSES.map((s) => {
                                    const active = ticket.status === s
                                    const base = 'px-3 py-2 rounded-xl text-sm border transition'
                                    const inactive =
                                        'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 ' +
                                        'dark:bg-transparent dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5'
                                    const activeCls =
                                        'bg-gray-900 text-white border-gray-900 hover:bg-gray-900 ' +
                                        'dark:bg-white/10 dark:text-white dark:border-white/25 dark:hover:bg-white/10'
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => onMoveTo?.(s)}
                                            aria-pressed={active}
                                            className={`${base} ${active ? activeCls : inactive}`}
                                        >
                                            {LABELS[s]}
                                        </button>
                                    )
                                })}
                            </div>
                        </Section>

                        <Section title="Suivi">
                            <FieldRow label="Priorité">
                                {editing
                                    ? (
                                        <select className="Input" value={draft.priority || 'Normal'} onChange={e => onChange('priority', e.target.value)}>
                                            {PRIORITIES.map(v => <option key={v}>{v}</option>)}
                                        </select>
                                    )
                                    : <Value highlight={urgent}>{ticket.priority || 'Normal'}</Value>}
                            </FieldRow>
                            <FieldRow label="Date prévue (retour)">
                                {editing
                                    ? <input type="date" className="Input" value={draft.dueDate || ''} onChange={e => onChange('dueDate', e.target.value)} />
                                    : <Value>{formatDateYMD(ticket.dueDate)}</Value>}
                            </FieldRow>
                            <FieldRow label="Assigné à">
                                {editing
                                    ? <input className="Input" placeholder="Nom du mécano" value={draft.assignedTo || ''} onChange={e => onChange('assignedTo', e.target.value)} />
                                    : <Value>{ticket.assignedTo || '—'}</Value>}
                            </FieldRow>

                            <div className="grid grid-cols-2 gap-3 text-xs mt-2 text-gray-500 dark:text-neutral-400">
                                <div>
                                    <div className="font-medium text-gray-700 dark:text-neutral-300">Créé</div>
                                    <div>{formatTS(ticket.createdAt)}</div>
                                </div>
                                <div>
                                    <div className="font-medium text-gray-700 dark:text-neutral-300">Mis à jour</div>
                                    <div>{formatTS(ticket.updatedAt)}</div>
                                </div>
                            </div>
                        </Section>

                        <Section title="Historique">
                            <div className="max-h-56 overflow-auto rounded-2xl p-2 text-xs border
                              bg-gray-50 border-gray-200
                              dark:bg-neutral-900/60 dark:border-white/10">
                                {(ticket.history || []).slice().reverse().map((h, i) => (
                                    <div key={i} className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 flex gap-2">
                                        <span className="font-medium w-44 shrink-0 text-gray-700 dark:text-neutral-300">
                                            {formatDate(h.at)}
                                        </span>
                                        <span className="text-gray-500 dark:text-neutral-400">{h.action}</span>
                                        <span className="text-gray-900 dark:text-neutral-100">— {h.note}</span>
                                    </div>
                                ))}
                                {(!ticket.history || ticket.history.length === 0) && (
                                    <div className="text-gray-500 dark:text-neutral-400 px-2 py-1">Aucun événement.</div>
                                )}
                            </div>
                        </Section>
                    </div>

                    {/* Commentaires — pleine largeur */}
                    <div className="md:col-span-12">
                        <Section title="Commentaires">
                            <div className="max-h-56 overflow-auto rounded-2xl p-2 text-sm border
                              bg-gray-50 border-gray-200
                              dark:bg-neutral-900/60 dark:border-white/10">
                                {comments.length === 0 && (
                                    <div className="text-gray-500 dark:text-neutral-400 px-2 py-1">Aucun commentaire.</div>
                                )}
                                {comments.map((c) => (
                                    <div key={c.id} className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5">
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                                            <span className="font-medium text-gray-700 dark:text-neutral-300">{c.author || '—'}</span>
                                            <span>•</span>
                                            <span>{formatTS(c.createdAt)}</span>
                                        </div>
                                        <div className="mt-0.5">{c.text}</div>
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={submitComment} className="mt-2 flex flex-col sm:flex-row gap-2">
                                <textarea
                                    rows={2}
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Écrire un commentaire…"
                                    className="Input flex-1"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 dark:bg-white dark:text-black"
                                    disabled={!commentText.trim()}
                                >
                                    Envoyer
                                </button>
                            </form>
                        </Section>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="px-5 py-3 border-t text-xs flex items-center justify-between
                        text-gray-500 border-gray-200 bg-white/90
                        dark:text-neutral-400 dark:border-white/10 dark:bg-neutral-900/80">
                    <div>ID : {ticket.id}</div>
                    <div>Numéro : {ticket.ticketNumber || '—'}</div>
                </div>
            </div>
        </div>
    )
}

/* ---------- Helpers UI ---------- */
function Chip({ color = 'blue', children }) {
    const light = {
        blue: 'bg-blue-100 text-blue-800 border-blue-300',
        red: 'bg-red-100 text-red-800 border-red-300',
        neutral: 'bg-gray-100 text-gray-800 border-gray-300',
    }
    const dark = {
        blue: 'dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
        red: 'dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25',
        neutral: 'dark:bg-white/10 dark:text-neutral-200 dark:border-white/15',
    }
    return <span className={`text-xs px-2 py-1 rounded-full border ${light[color] || light.neutral} ${dark[color] || dark.neutral}`}>{children}</span>
}

function Section({ title, children }) {
    return (
        <div className="rounded-2xl border bg-white border-gray-200
                    dark:bg-neutral-900/60 dark:border-white/10">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-white/10 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-white/20" />
                <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{title}</h4>
            </div>
            <div className="p-4 space-y-2">{children}</div>
        </div>
    )
}

function FieldRow({ label, children, grow = false }) {
    return (
        <div className={`flex ${grow ? 'items-start' : 'items-center'} justify-between gap-3`}>
            <div className="text-sm text-gray-700 dark:text-neutral-300 min-w-[140px]">{label} :</div>
            <div className={`flex-1 ${grow ? '' : 'text-sm'}`}>{children}</div>
        </div>
    )
}

function Value({ children, highlight = false }) {
    return (
        <div className={[
            'text-sm text-gray-900 dark:text-neutral-100',
            highlight && 'px-2 py-0.5 rounded border bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25'
        ].join(' ')}>
            {children || '—'}
        </div>
    )
}

function Block({ value }) {
    return (
        <p className="text-sm leading-6 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl p-3
                  dark:bg-neutral-900/60 dark:border-white/10 dark:text-neutral-100">
            {value}
        </p>
    )
}

/* ---------- format & data helpers ---------- */
function makeDraft(t) {
    return {
        customerName: t.customerName || '',
        customerPhone: t.customerPhone || '',
        customerEmail: t.customerEmail || '',
        preferredContact: t.preferredContact || 'Téléphone',
        bikeType: t.bikeType || 'VTT',
        bikeBrand: t.bikeBrand || '',
        bikeModel: t.bikeModel || '',
        serialNumber: t.serialNumber || '',
        purchaseDate: t.purchaseDate || '',
        underWarranty: !!t.underWarranty,
        issueDescription: t.issueDescription || '',
        accessoriesLeft: t.accessoriesLeft || '',
        priority: t.priority || 'Normal',
        dueDate: t.dueDate || '',
        assignedTo: t.assignedTo || '',
    }
}

function sanitizeDraft(d) {
    // Vide -> null pour les champs optionnels
    const n = { ...d }
        ;['customerPhone', 'customerEmail', 'bikeBrand', 'bikeModel', 'serialNumber', 'purchaseDate', 'issueDescription', 'accessoriesLeft', 'dueDate', 'assignedTo'].forEach(k => {
            if (n[k] === '') n[k] = null
        })
    return n
}

function diff(before, after) {
    const changed = {}
    for (const k of Object.keys(after)) {
        const a = after[k]; const b = before[k]
        // comparaison strict mais tolère null/'' déjà normalisé dans sanitizeDraft
        if (JSON.stringify(a) !== JSON.stringify(b)) changed[k] = a
    }
    return changed
}

function formatTS(ts) {
    try {
        if (!ts) return '—'
        const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
        return d.toLocaleString('fr-FR')
    } catch { return '—' }
}
function formatDate(iso) {
    try { return new Date(iso).toLocaleString('fr-FR') } catch { return iso || '—' }
}
function formatDateYMD(ymd) {
    if (!ymd) return '—'
    try { return new Date(ymd).toLocaleDateString('fr-FR') } catch { return ymd }
}
