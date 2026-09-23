import { useEffect, useRef, useState } from 'react'
import StatusBadge from './StatusBadge'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import {
    collection, addDoc, onSnapshot, query, orderBy,
    serverTimestamp, doc, updateDoc, arrayUnion,
    deleteDoc, getDocs, writeBatch, runTransaction
} from 'firebase/firestore'
import { BIKE_TYPES, PRIORITIES, CAN_DELETE_ROLES } from '../lib/constants'
import { useStaff } from '../lib/useStaff'
import { commentExcerpt, withCommentEdited, withCommentRemoved } from '../lib/ticketHistory'

export default function TicketModal({ ticket, role, onClose, onDelete }) {
    const overlayRef = useRef(null)
    const urgent = ticket.priority === 'Urgent'
    const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))

    const myRole = role || profile?.role
    // Les règles Firestore limitent déjà l'édition aux comptes du magasin du ticket
    const canEdit = !!myRole
    const canAdmin = CAN_DELETE_ROLES.includes(myRole)

    // Seuls les employés du rayon vélo du magasin du ticket utilisent l'outil SAV
    const users = useStaff(ticket.magasinId, 'velo')

    // --- Edition
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [draft, setDraft] = useState(makeDraft(ticket))
    useEffect(() => { setDraft(makeDraft(ticket)) }, [ticket?.id])

    // --- Commentaires
    const [comments, setComments] = useState([])
    const [commentText, setCommentText] = useState('')
    const [commentAuthor, setCommentAuthor] = useState('')
    const [authorError, setAuthorError] = useState(false)
    const [sendingComment, setSendingComment] = useState(false)
    const [editingCommentId, setEditingCommentId] = useState(null)
    const [editingText, setEditingText] = useState('')

    // --- N° de suivi SAV (fournisseur)
    const [tracking, setTracking] = useState(ticket.trackingNumber || '')
    const [savingTracking, setSavingTracking] = useState(false)
    useEffect(() => { setTracking(ticket.trackingNumber || '') }, [ticket?.id, ticket?.trackingNumber])

    // --- Suppression
    const [deleting, setDeleting] = useState(false)

    // --- Toast
    const [toast, setToast] = useState(null)
    useEffect(() => {
        if (!toast) return
        const t = setTimeout(() => setToast(null), 3000)
        return () => clearTimeout(t)
    }, [toast])

    // Fermer
    function onOverlayClick(e) { if (e.target === overlayRef.current) onClose?.() }
    useEffect(() => {
        const fn = (e) => e.key === 'Escape' && onClose?.()
        window.addEventListener('keydown', fn)
        return () => window.removeEventListener('keydown', fn)
    }, [onClose])

    // Live comments
    useEffect(() => {
        if (!ticket?.id) return
        const q = query(collection(db, 'tickets', ticket.id, 'comments'), orderBy('createdAt', 'asc'))
        return onSnapshot(q, snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, [ticket?.id])

    // --- Actions
    function copyTracking() {
        navigator.clipboard.writeText(ticket.trackingNumber)
        setToast('Numéro de suivi copié ✓')
    }

    function copyBikeInfo() {
        const lines = []
        const bike = [ticket.bikeType, ticket.bikeBrand, ticket.bikeModel].filter(Boolean).join(' ')
        if (bike) lines.push(`Vélo : ${bike}`)
        if (ticket.serialNumber) lines.push(`N° de série : ${ticket.serialNumber}`)
        if (ticket.purchaseDate) lines.push(`Date d'achat : ${formatDateYMD(ticket.purchaseDate)}`)
        lines.push(`Garantie : ${ticket.underWarranty ? 'Oui' : 'Non'}`)
        if (ticket.issueDescription) lines.push(`\nProblème signalé :\n${ticket.issueDescription}`)
        if (ticket.accessoriesLeft) lines.push(`\nAccessoires laissés :\n${ticket.accessoriesLeft}`)
        navigator.clipboard.writeText(lines.join('\n'))
        setToast('Vous avez bien copié les infos du vélo ✓')
    }

    function copyComments() {
        if (!comments.length) return
        const text = comments.map(c => {
            const date = c.createdAt?.seconds
                ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                : '—'
            return `${date} ${(c.author || '—').split(' ')[0]} : ${c.text}`
        }).join('\n')
        navigator.clipboard.writeText(text)
        setToast("Vous avez bien copié l'historique des commentaires ✓")
    }

    async function submitComment(e) {
        e?.preventDefault?.()
        const text = commentText.trim()
        if (!text || !user || sendingComment) return
        if (!commentAuthor) { setAuthorError(true); return }
        setAuthorError(false)
        setSendingComment(true)
        try {
            const ref = await addDoc(collection(db, 'tickets', ticket.id, 'comments'), {
                text, createdAt: serverTimestamp(), createdBy: user.uid, author: commentAuthor,
            })
            await updateDoc(doc(db, 'tickets', ticket.id), {
                updatedAt: serverTimestamp(),
                history: arrayUnion({ at: new Date().toISOString(), by: commentAuthor, action: 'comment', note: commentExcerpt(text), commentId: ref.id }),
            })
            setCommentText('')
            setCommentAuthor('')
        } catch (err) {
            console.error('submitComment error', err)
        } finally {
            setSendingComment(false)
        }
    }

    function startEditComment(c) {
        setEditingCommentId(c.id)
        setEditingText(c.text || '')
    }

    async function saveComment(c) {
        const text = editingText.trim()
        if (!text || text === c.text) { setEditingCommentId(null); return }
        const ticketRef = doc(db, 'tickets', ticket.id)
        try {
            await runTransaction(db, async tx => {
                const snap = await tx.get(ticketRef)
                tx.update(doc(ticketRef, 'comments', c.id), { text, editedAt: serverTimestamp() })
                tx.update(ticketRef, { history: withCommentEdited(snap.data()?.history, c, text), updatedAt: serverTimestamp() })
            })
            setEditingCommentId(null)
            setToast('Commentaire modifié ✓')
        } catch (err) {
            alert('Modification impossible : ' + (err.message || 'inconnue'))
        }
    }

    async function removeComment(c) {
        if (!confirm(`Supprimer le commentaire de ${c.author || '—'} ?`)) return
        const ticketRef = doc(db, 'tickets', ticket.id)
        try {
            await runTransaction(db, async tx => {
                const snap = await tx.get(ticketRef)
                tx.delete(doc(ticketRef, 'comments', c.id))
                tx.update(ticketRef, { history: withCommentRemoved(snap.data()?.history, c), updatedAt: serverTimestamp() })
            })
            setToast('Commentaire supprimé ✓')
        } catch (err) {
            alert('Suppression impossible : ' + (err.message || 'inconnue'))
        }
    }

    async function handleDelete(e) {
        e?.stopPropagation?.()
        if (deleting) return
        if (!canAdmin) return
        if (!confirm('Supprimer ce ticket ? Cette action est irréversible.')) return
        try {
            setDeleting(true)
            await deleteTicketWithSubs(ticket.id)
            try { await onDelete?.() } catch { }
            onClose?.()
        } catch (err) {
            console.error('DELETE ERROR', err)
            alert('Suppression impossible : ' + (err?.message || 'inconnue'))
        } finally {
            setDeleting(false)
        }
    }

    function onChange(k, v) { setDraft(d => ({ ...d, [k]: v })) }

    async function saveTracking(e) {
        e?.preventDefault?.()
        const value = tracking.trim()
        if (value === (ticket.trackingNumber || '')) return
        setSavingTracking(true)
        try {
            await updateDoc(doc(db, 'tickets', ticket.id), {
                trackingNumber: value || null,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    by: profile?.displayName || user?.email || '—',
                    action: 'suivi',
                    note: value ? `N° de suivi SAV : ${value}` : 'N° de suivi SAV retiré',
                }),
            })
            setToast(value ? 'Numéro de suivi enregistré ✓' : 'Numéro de suivi retiré ✓')
        } catch (err) {
            console.error('TRACKING ERROR', err)
            alert("Impossible d'enregistrer le numéro de suivi : " + (err.message || 'inconnu'))
        } finally {
            setSavingTracking(false)
        }
    }

    async function saveEdits() {
        if (!canEdit) return
        setSaving(true)
        try {
            const after = diff(sanitizeDraft(makeDraft(ticket)), sanitizeDraft(draft))
            if (Object.keys(after).length === 0) { setEditing(false); setSaving(false); return }
            const FIELD_LABELS = {
                customerName: 'client', customerPhone: 'téléphone', bikeType: 'type vélo', bikeBrand: 'marque',
                bikeModel: 'modèle', serialNumber: 'n° série', purchaseDate: "date d'achat",
                underWarranty: 'garantie', issueDescription: 'problème', accessoriesLeft: 'accessoires',
                priority: 'priorité', dueDate: 'date prévue', createdByName: 'créé par',
            }
            const note = Object.keys(after).map(k => FIELD_LABELS[k] || k).join(', ')
            await updateDoc(doc(db, 'tickets', ticket.id), {
                ...after,
                updatedAt: serverTimestamp(),
                history: arrayUnion({
                    at: new Date().toISOString(),
                    by: profile?.displayName || user?.email || '—',
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
            className="fixed inset-0 z-[300] flex items-start justify-center p-4 pt-[5vh] bg-black/50 backdrop-blur-sm overflow-y-auto"
        >
            <div className="relative w-full max-w-4xl flex flex-col overflow-hidden
                            rounded-2xl shadow-2xl border
                            bg-white border-gray-200
                            dark:bg-neutral-900 dark:border-neutral-800">

                {/* ── HEADER ── */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b
                                border-gray-100 dark:border-neutral-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono font-semibold text-gray-400 dark:text-neutral-500 shrink-0">
                            #{ticket.ticketNumber || ticket.id.slice(0, 8)}
                        </span>
                        <StatusBadge status={ticket.status} />
                        {urgent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full
                                             bg-red-50 text-red-600 border border-red-200
                                             dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 shrink-0">
                                ⚡ Urgent
                            </span>
                        )}
                        {editing ? (
                            <div className="flex items-center gap-2 min-w-0">
                                <input className="Input h-8 !w-44 text-sm" placeholder="Nom du client" aria-label="Nom du client"
                                    value={draft.customerName} onChange={e => onChange('customerName', e.target.value)} />
                                <input className="Input h-8 !w-36 text-sm" type="tel" placeholder="Téléphone" aria-label="Téléphone"
                                    value={draft.customerPhone || ''} onChange={e => onChange('customerPhone', e.target.value)} />
                            </div>
                        ) : (
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {ticket.customerName || 'Client inconnu'}
                                {ticket.customerPhone && (
                                    <>
                                        <span className="text-gray-400 dark:text-neutral-500"> - </span>
                                        <a href={`tel:${ticket.customerPhone.replace(/\s/g, '')}`} title="Appeler le client"
                                            className="font-medium text-gray-700 dark:text-neutral-300 hover:underline underline-offset-2">
                                            {ticket.customerPhone}
                                        </a>
                                    </>
                                )}
                            </h3>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {canEdit && !editing && (
                            <Btn onClick={() => { setDraft(makeDraft(ticket)); setEditing(true) }}>Modifier</Btn>
                        )}
                        {editing && <>
                            <Btn onClick={() => { setDraft(makeDraft(ticket)); setEditing(false) }}>Annuler</Btn>
                            <Btn onClick={saveEdits} disabled={saving} primary>
                                {saving ? 'Enregistrement…' : 'Enregistrer'}
                            </Btn>
                        </>}
                        {canAdmin && (
                            <Btn onClick={handleDelete} disabled={deleting} danger>
                                {deleting ? '…' : 'Supprimer'}
                            </Btn>
                        )}
                        <button
                            onClick={onClose}
                            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                                       dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4">

                    {/* ── Commentaires (en haut, pleine largeur) ── */}
                    <div className="md:col-span-12">
                        <Card title="Commentaires" action={comments.length > 0 && <CopyBtn onClick={copyComments} label="Copier l'historique" />}>
                            <form onSubmit={submitComment} className="space-y-1.5 mb-3">
                                <div className="flex gap-2 items-center">
                                    {users.length > 0 ? (
                                        <select
                                            value={commentAuthor}
                                            onChange={e => { setCommentAuthor(e.target.value); setAuthorError(false) }}
                                            className={`h-9 px-2 rounded-xl border text-xs font-medium bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 shrink-0 w-32 ${authorError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-neutral-700'}`}
                                        >
                                            <option value="">— Auteur</option>
                                            {users.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}
                                        </select>
                                    ) : (
                                        <input
                                            value={commentAuthor}
                                            onChange={e => { setCommentAuthor(e.target.value); setAuthorError(false) }}
                                            placeholder="Votre nom"
                                            className={`Input h-9 w-32 shrink-0 ${authorError ? 'border-red-400 dark:border-red-500' : ''}`}
                                        />
                                    )}
                                    <input
                                        value={commentText}
                                        onChange={e => setCommentText(e.target.value)}
                                        placeholder="Ajouter un commentaire…"
                                        className="Input flex-1 h-9"
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!commentText.trim() || sendingComment}
                                        className="h-9 px-4 rounded-xl bg-gray-900 text-white text-sm font-medium shrink-0
                                                   hover:bg-gray-700 disabled:opacity-40 transition-colors
                                                   dark:bg-white dark:text-black dark:hover:bg-gray-100"
                                    >
                                        Envoyer
                                    </button>
                                </div>
                                {authorError && (
                                    <p className="text-xs text-red-500 dark:text-red-400">Veuillez sélectionner la personne qui a écrit le commentaire.</p>
                                )}
                            </form>
                            <div className="max-h-56 overflow-y-auto space-y-3">
                                {comments.length === 0 && (
                                    <p className="text-xs text-gray-400 dark:text-neutral-500 py-1">Aucun commentaire.</p>
                                )}
                                {comments.slice().reverse().map(c => (
                                    <div key={c.id} className="group flex gap-3">
                                        <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300
                                                         text-xs font-semibold grid place-items-center shrink-0">
                                            {(c.author || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-0.5">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-neutral-300">{c.author || '—'}</span>
                                                <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                                                    {formatTS(c.createdAt)}{c.editedAt ? ' · modifié' : ''}
                                                </span>
                                                {canEdit && editingCommentId !== c.id && (
                                                    <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => startEditComment(c)}
                                                            className="text-[11px] px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800">
                                                            Modifier
                                                        </button>
                                                        <button type="button" onClick={() => removeComment(c)}
                                                            className="text-[11px] px-1.5 py-0.5 rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                                                            Supprimer
                                                        </button>
                                                    </span>
                                                )}
                                            </div>
                                            {editingCommentId === c.id ? (
                                                <div className="space-y-1.5">
                                                    <textarea rows={2} className="Input text-sm" value={editingText} autoFocus
                                                        onChange={e => setEditingText(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveComment(c) }
                                                            if (e.key === 'Escape') { e.stopPropagation(); setEditingCommentId(null) }
                                                        }} />
                                                    <div className="flex gap-2">
                                                        <Btn primary onClick={() => saveComment(c)} disabled={!editingText.trim()}>Enregistrer</Btn>
                                                        <Btn onClick={() => setEditingCommentId(null)}>Annuler</Btn>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">{c.text}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* ── Colonne gauche ── */}
                    <div className="md:col-span-7 space-y-4">

                        <Card title="Vélo">
                            <Grid>
                                <Field label="Type">
                                    {editing
                                        ? <select className="Input" value={draft.bikeType || 'VTT'} onChange={e => onChange('bikeType', e.target.value)}>
                                            {BIKE_TYPES.map(v => <option key={v}>{v}</option>)}
                                        </select>
                                        : <Val>{ticket.bikeType}</Val>}
                                </Field>
                                <Field label="Marque">
                                    {editing
                                        ? <input className="Input" value={draft.bikeBrand || ''} onChange={e => onChange('bikeBrand', e.target.value)} />
                                        : <Val>{ticket.bikeBrand}</Val>}
                                </Field>
                                <Field label="Modèle">
                                    {editing
                                        ? <input className="Input" value={draft.bikeModel || ''} onChange={e => onChange('bikeModel', e.target.value)} />
                                        : <Val>{ticket.bikeModel}</Val>}
                                </Field>
                                <Field label="N° de série">
                                    {editing
                                        ? <input className="Input" value={draft.serialNumber || ''} onChange={e => onChange('serialNumber', e.target.value)} />
                                        : <Val>{ticket.serialNumber}</Val>}
                                </Field>
                                <Field label="Date d'achat">
                                    {editing
                                        ? <input type="date" className="Input" value={draft.purchaseDate || ''} onChange={e => onChange('purchaseDate', e.target.value)} />
                                        : <Val>{formatDateYMD(ticket.purchaseDate)}</Val>}
                                </Field>
                                <Field label="Garantie">
                                    {editing
                                        ? <label className="inline-flex items-center gap-2 h-10">
                                            <input type="checkbox" className="h-4 w-4" checked={!!draft.underWarranty} onChange={e => onChange('underWarranty', e.target.checked)} />
                                            <span className="text-sm">Oui</span>
                                        </label>
                                        : <Val>{ticket.underWarranty ? 'Oui' : 'Non'}</Val>}
                                </Field>
                            </Grid>
                        </Card>

                        <Card title="Problème" action={<CopyBtn onClick={copyBikeInfo} label="Copier infos vélo" />}>
                            <div className="space-y-3">
                                <Field label="Problème signalé" vertical>
                                    {editing
                                        ? <textarea rows={4} className="Input" value={draft.issueDescription || ''} onChange={e => onChange('issueDescription', e.target.value)} />
                                        : <p className="text-sm text-gray-900 dark:text-neutral-100 leading-relaxed whitespace-pre-wrap">
                                            {ticket.issueDescription || '—'}
                                        </p>}
                                </Field>
                                <Field label="Accessoires laissés" vertical>
                                    {editing
                                        ? <textarea rows={2} className="Input" value={draft.accessoriesLeft || ''} onChange={e => onChange('accessoriesLeft', e.target.value)} />
                                        : <Val>{ticket.accessoriesLeft}</Val>}
                                </Field>
                            </div>
                        </Card>
                    </div>

                    {/* ── Colonne droite ── */}
                    <div className="md:col-span-5 space-y-4">

                        <Card title="Suivi">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-[11px] font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Statut</p>
                                    <StatusBadge status={ticket.status} />
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-neutral-500 text-right">Pour changer de statut,<br />déplace le ticket dans le tableau.</p>
                            </div>
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[11px] font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide">N° de suivi SAV</p>
                                    {ticket.trackingNumber && <CopyBtn onClick={copyTracking} label="Copier" />}
                                </div>
                                <form onSubmit={saveTracking} className="flex gap-2">
                                    <input
                                        className="Input h-9 flex-1 font-mono placeholder:font-sans placeholder:text-xs"
                                        value={tracking}
                                        onChange={e => setTracking(e.target.value)}
                                        placeholder="Numéro donné par le fournisseur"
                                        disabled={!canEdit}
                                    />
                                    <Btn
                                        onClick={saveTracking}
                                        primary
                                        disabled={!canEdit || savingTracking || tracking.trim() === (ticket.trackingNumber || '')}
                                    >
                                        {savingTracking ? '…' : 'Enregistrer'}
                                    </Btn>
                                </form>
                                <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-1">
                                    Permet de retrouver le ticket depuis la recherche à la réception d'un colis.
                                </p>
                            </div>
                            <Grid>
                                <Field label="Priorité">
                                    {editing
                                        ? <select className="Input" value={draft.priority || 'Normal'} onChange={e => onChange('priority', e.target.value)}>
                                            {PRIORITIES.map(v => <option key={v}>{v}</option>)}
                                        </select>
                                        : <Val urgent={urgent}>{ticket.priority || 'Normal'}</Val>}
                                </Field>
                                <Field label="Date prévue">
                                    {editing
                                        ? <input type="date" className="Input" value={draft.dueDate || ''} onChange={e => onChange('dueDate', e.target.value)} />
                                        : <Val>{formatDateYMD(ticket.dueDate)}</Val>}
                                </Field>
                                <Field label="Créé par">
                                    {editing
                                        ? users.length > 0
                                            ? <select className="Input" value={draft.createdByName || ''} onChange={e => onChange('createdByName', e.target.value)}>
                                                <option value="">— Sélectionner</option>
                                                {users.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}
                                            </select>
                                            : <input className="Input" placeholder="Votre nom" value={draft.createdByName || ''} onChange={e => onChange('createdByName', e.target.value)} />
                                        : <Val>{ticket.createdByName}</Val>}
                                </Field>
                            </Grid>
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="text-gray-400 dark:text-neutral-500 mb-0.5">Créé</p>
                                    <p className="text-gray-700 dark:text-neutral-300">{formatTS(ticket.createdAt)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 dark:text-neutral-500 mb-0.5">Mis à jour</p>
                                    <p className="text-gray-700 dark:text-neutral-300">{formatTS(ticket.updatedAt)}</p>
                                </div>
                            </div>
                        </Card>

                        <Card title="Historique">
                            <div className="max-h-52 overflow-y-auto space-y-0.5">
                                {(ticket.history || []).length === 0 && (
                                    <p className="text-xs text-gray-400 dark:text-neutral-500 py-2">Aucun événement.</p>
                                )}
                                {(ticket.history || []).slice().reverse().map((h, i) => (
                                    <div key={i} className="flex gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800">
                                        <span className="text-gray-400 dark:text-neutral-500 shrink-0 w-32">{formatTS(h.at)}</span>
                                        <span className="text-gray-500 dark:text-neutral-400 shrink-0">{h.action}</span>
                                        <span className="text-gray-700 dark:text-neutral-300 truncate">{h.note}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                </div>

                {/* Toast */}
                {toast && (
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2
                                    flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg
                                    bg-emerald-500 text-white text-sm font-medium
                                    animate-fade-in whitespace-nowrap z-10">
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {toast}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ── UI helpers ── */
function Btn({ onClick, disabled, primary, danger, children }) {
    const base = 'h-8 px-3 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50'
    const style = primary
        ? 'bg-gray-900 text-white border-transparent hover:bg-gray-700 dark:bg-white dark:text-black dark:border-transparent dark:hover:bg-gray-100'
        : danger
            ? 'text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10'
            : 'text-gray-700 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800'
    return <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${style}`}>{children}</button>
}

function CopyBtn({ onClick, label }) {
    return (
        <button type="button" onClick={onClick}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors
                       text-gray-500 border-gray-200 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300
                       dark:text-neutral-400 dark:border-neutral-700 dark:hover:text-neutral-100 dark:hover:bg-neutral-800">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {label}
        </button>
    )
}

function Card({ title, children, action }) {
    return (
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800
                            bg-gray-50/50 dark:bg-neutral-800/30">
                <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                    <span className="text-xs font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
                </div>
                {action}
            </div>
            <div className="p-4">{children}</div>
        </div>
    )
}

function Grid({ children }) {
    return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
}

function Field({ label, children, vertical = false }) {
    return (
        <div className={vertical ? 'col-span-2 space-y-1' : 'space-y-0.5'}>
            <p className="text-[11px] font-medium text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{label}</p>
            {children}
        </div>
    )
}

function Val({ children, urgent }) {
    if (urgent) return (
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full
                         bg-red-50 text-red-600 border border-red-200
                         dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
            {children || '—'}
        </span>
    )
    return <p className="text-sm text-gray-900 dark:text-neutral-100">{children || '—'}</p>
}

/* ── Data helpers ── */
function makeDraft(t) {
    return {
        customerName: t.customerName || '', customerPhone: t.customerPhone || '',
        bikeType: t.bikeType || 'VTT', bikeBrand: t.bikeBrand || '',
        bikeModel: t.bikeModel || '', serialNumber: t.serialNumber || '',
        purchaseDate: t.purchaseDate || '', underWarranty: !!t.underWarranty,
        issueDescription: t.issueDescription || '', accessoriesLeft: t.accessoriesLeft || '',
        priority: t.priority || 'Normal', dueDate: t.dueDate || '', createdByName: t.createdByName || '',
    }
}

function sanitizeDraft(d) {
    const n = { ...d }
        ;['customerPhone', 'bikeBrand', 'bikeModel', 'serialNumber',
            'purchaseDate', 'issueDescription', 'accessoriesLeft', 'dueDate', 'createdByName']
            .forEach(k => { if (n[k] === '') n[k] = null })
    return n
}

function diff(base, compare) {
    const changed = {}
    for (const k of Object.keys(base)) {
        if (JSON.stringify(base[k]) !== JSON.stringify(compare[k])) changed[k] = compare[k]
    }
    return changed
}

function formatTS(ts) {
    try {
        if (!ts) return '—'
        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString('fr-FR')
        if (typeof ts === 'string') return new Date(ts).toLocaleString('fr-FR')
        if (ts instanceof Date) return ts.toLocaleString('fr-FR')
        return '—'
    } catch { return '—' }
}

function formatDateYMD(ymd) {
    if (!ymd) return '—'
    try { return new Date(ymd).toLocaleDateString('fr-FR') } catch { return ymd }
}

async function deleteAllDocs(colRef) {
    const snap = await getDocs(colRef)
    if (snap.empty) return
    let batch = writeBatch(db), count = 0
    const commits = []
    snap.forEach(d => {
        batch.delete(d.ref); count++
        if (count >= 450) { commits.push(batch.commit()); batch = writeBatch(db); count = 0 }
    })
    if (count) commits.push(batch.commit())
    await Promise.all(commits)
}

async function deleteTicketWithSubs(ticketId) {
    const tRef = doc(db, 'tickets', ticketId)
    await deleteAllDocs(collection(tRef, 'comments')).catch(() => { })
    await deleteAllDocs(collection(tRef, 'history')).catch(() => { })
    await deleteDoc(tRef)
}
