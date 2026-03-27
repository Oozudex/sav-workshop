import { useEffect, useState } from 'react'
import { useAuth } from '../store/useAuth'
import Navbar from '../components/Navbar'
import { db } from '../lib/firebase'
import {
    collection, onSnapshot, query, orderBy,
    setDoc, doc, serverTimestamp, updateDoc, deleteDoc
} from 'firebase/firestore'
import { getApp, getApps, initializeApp, deleteApp } from 'firebase/app'
import {
    getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile
} from 'firebase/auth'
import { ROLES as ROLE_VALUES, ROLE_LABELS } from '../lib/constants'

const ROLES = ROLE_VALUES.map(v => ({ value: v, label: ROLE_LABELS[v] }))
const roleLabel = (r) => ROLE_LABELS[r] || r || '—'
// Rôles nécessitant un magasinId
const STORE_ROLES = ['vendeur', 'directeurmag']

export default function AdminUsers() {
    const { profile } = useAuth(s => ({ profile: s.profile }))

    // liste
    const [users, setUsers] = useState([])
    const [magasins, setMagasins] = useState([])
    // création
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [role, setRole] = useState('directeurmag')
    const [magasinId, setMagasinId] = useState('')
    const [loadingCreate, setLoadingCreate] = useState(false)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)
    // édition
    const [editingId, setEditingId] = useState(null)
    const [draft, setDraft] = useState({ displayName: '', role: 'directeurgen', magasinId: '', isActive: true })
    const [savingId, setSavingId] = useState(null)
    const [busyId, setBusyId] = useState(null)

    useEffect(() => {
        const qRef = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
        return onSnapshot(qRef, snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, [])

    useEffect(() => {
        const qRef = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
        return onSnapshot(qRef, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setMagasins(list)
            if (!magasinId && list.length > 0) setMagasinId(list[0].id)
        })
    }, [])

    /* ------------------- CRÉATION ------------------- */
    async function handleCreate(e) {
        e.preventDefault()
        setErr(null); setMsg(null)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("Email invalide")
        if (!displayName.trim()) return setErr("Nom affiché requis")

        if (password.length < 6) return setErr("Le mot de passe doit contenir au moins 6 caractères")
        if (STORE_ROLES.includes(role) && !magasinId) return setErr("Sélectionne un magasin")

        setLoadingCreate(true)
        const secName = 'admin-secondary'
        let secApp
        try {
            // App secondaire pour ne pas déconnecter l'admin courant
            const options = getApp().options
            secApp = getApps().find(a => a.name === secName) || initializeApp(options, secName)
            const secAuth = getAuth(secApp)

            const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password)
            await updateProfile(cred.user, { displayName })

            await setDoc(doc(db, 'users', cred.user.uid), {
                displayName,
                email: email.trim(),
                role,
                magasinId: STORE_ROLES.includes(role) ? (magasinId || null) : null,
                isActive: true,
                createdAt: serverTimestamp(),
                createdBy: profile?.uid || 'admin'
            })

            setMsg(`Compte créé : ${displayName} (${email.trim()})`)
            setEmail(''); setPassword(''); setDisplayName(''); setRole('directeurmag')
        } catch (e) {
            console.error(e)
            const map = {
                'auth/email-already-in-use': "Cet email existe déjà.",
                'auth/invalid-email': "Email invalide.",
                'auth/operation-not-allowed': "Active Email/Password dans Firebase Auth.",
            }
            setErr(map[e.code] || e.message || 'Erreur inconnue')
        } finally {
            setLoadingCreate(false)
            if (secApp) { try { await deleteApp(secApp) } catch { } }
        }
    }

    /* ------------------- ÉDITION ------------------- */
    function startEdit(u) {
        setEditingId(u.id)
        setDraft({ displayName: u.displayName || '', role: u.role || 'vendeur', magasinId: u.magasinId || '', isActive: !!u.isActive })
    }
    function cancelEdit() {
        setEditingId(null)
    }
    async function saveEdit(u) {
        setSavingId(u.id)
        try {
            await updateDoc(doc(db, 'users', u.id), {
                displayName: draft.displayName || null,
                role: draft.role,
                magasinId: STORE_ROLES.includes(draft.role) ? (draft.magasinId || null) : null,
                isActive: !!draft.isActive,
                updatedAt: serverTimestamp(),
                updatedBy: profile?.uid || 'admin',
            })
            setEditingId(null)
        } catch (e) {
            alert("Échec de la mise à jour : " + (e.message || 'inconnu'))
        } finally {
            setSavingId(null)
        }
    }

    /* ---- Actions rapides : Reset MDP / (Dés)activer / Supprimer doc ---- */
    async function resetPassword(u) {
        setBusyId(u.id)
        try {
            await sendPasswordResetEmail(getAuth(), u.email)
            alert(`Email de réinitialisation envoyé à ${u.email}`)
        } catch (e) {
            alert("Impossible d'envoyer l'email : " + (e.message || 'inconnu'))
        } finally {
            setBusyId(null)
        }
    }

    async function toggleActive(u) {
        setBusyId(u.id)
        try {
            await updateDoc(doc(db, 'users', u.id), {
                isActive: !u.isActive,
                updatedAt: serverTimestamp(),
                updatedBy: profile?.uid || 'admin',
            })
        } catch (e) {
            alert("Échec de la mise à jour : " + (e.message || 'inconnu'))
        } finally {
            setBusyId(null)
        }
    }

    async function removeUserDoc(u) {
        if (!confirm(`Supprimer la fiche Firestore de "${u.displayName || u.email}" ?\n(Le compte Auth restera actif tant qu'il n'est pas supprimé côté serveur.)`)) return
        setBusyId(u.id)
        try {
            await deleteDoc(doc(db, 'users', u.id))
            alert('Fiche Firestore supprimée.')
        } catch (e) {
            alert("Échec de la suppression : " + (e.message || 'inconnu'))
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />

            <main className="flex-1">
                <div className="max-w-6xl mx-auto p-4 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Administration — Comptes</h1>
                            <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Acheteur · Dir. Magasin · Dir. Général</p>
                        </div>
                    </div>

                    {/* Form création */}
                    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Créer un compte</span>
                        </div>
                        <div className="p-4">
                            {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{err}</div>}
                            {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{msg}</div>}

                            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="block space-y-1">
                                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom affiché</span>
                                    <input className="Input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Prénom Nom" />
                                </label>
                                <label className="block space-y-1">
                                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                                    <input type="email" className="Input" value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@exemple.com" />
                                </label>
                                <label className="block space-y-1">
                                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Mot de passe</span>
                                    <input type="password" className="Input" value={password} onChange={e => setPassword(e.target.value)} placeholder="6 caractères min." />
                                </label>
                                <label className="block space-y-1">
                                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rôle</span>
                                    <select className="Input" value={role} onChange={e => setRole(e.target.value)}>
                                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </label>
                                {STORE_ROLES.includes(role) && (
                                    <label className="block space-y-1 md:col-span-2">
                                        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin</span>
                                        <select className="Input" value={magasinId} onChange={e => setMagasinId(e.target.value)}>
                                            <option value="">— Sélectionner un magasin</option>
                                            {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                                        </select>
                                    </label>
                                )}
                                <div className="md:col-span-3 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={loadingCreate}
                                        className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50
                                                   bg-gray-900 text-white hover:bg-gray-700
                                                   dark:bg-white dark:text-black dark:hover:bg-gray-100"
                                    >
                                        {loadingCreate ? 'Création…' : "Créer le compte"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Liste + édition */}
                    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Comptes existants</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="text-left border-b border-gray-100 dark:border-neutral-800">
                                    <tr>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</th>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</th>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rôle</th>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin</th>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Actif</th>
                                        <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => {
                                        const isEditing = editingId === u.id
                                        const magasinNom = magasins.find(m => m.id === u.magasinId)?.nom
                                        return (
                                            <tr key={u.id} className="border-t border-gray-100 dark:border-neutral-800">
                                                <td className="px-4 py-2.5">
                                                    {isEditing
                                                        ? <input className="Input h-8" value={draft.displayName} onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))} />
                                                        : (u.displayName || '—')}
                                                </td>
                                                <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">{u.email || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {isEditing
                                                        ? (
                                                            <select className="Input h-8" value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}>
                                                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                            </select>
                                                        )
                                                        : roleLabel(u.role)}
                                                </td>
                                                <td className="px-4 py-2.5 text-gray-500 dark:text-neutral-400">
                                                    {isEditing && STORE_ROLES.includes(draft.role)
                                                        ? (
                                                            <select className="Input h-8" value={draft.magasinId} onChange={e => setDraft(d => ({ ...d, magasinId: e.target.value }))}>
                                                                <option value="">—</option>
                                                                {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                                                            </select>
                                                        )
                                                        : (magasinNom || '—')}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {isEditing
                                                        ? (
                                                            <label className="inline-flex items-center gap-2">
                                                                <input type="checkbox" className="h-3.5 w-3.5"
                                                                    checked={!!draft.isActive}
                                                                    onChange={e => setDraft(d => ({ ...d, isActive: e.target.checked }))} />
                                                                <span>{draft.isActive ? 'Oui' : 'Non'}</span>
                                                            </label>
                                                        )
                                                        : (u.isActive ? 'Oui' : 'Non')}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {!isEditing ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <button onClick={() => startEdit(u)}
                                                                className="h-7 px-2.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 text-gray-700 dark:text-neutral-300">
                                                                Éditer
                                                            </button>
                                                            <button onClick={() => resetPassword(u)} disabled={busyId === u.id || !u.email}
                                                                className="h-7 px-2.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-60 text-gray-700 dark:text-neutral-300">
                                                                Reset MDP
                                                            </button>
                                                            <button onClick={() => toggleActive(u)} disabled={busyId === u.id}
                                                                className="h-7 px-2.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 text-gray-700 dark:text-neutral-300">
                                                                {u.isActive ? 'Désactiver' : 'Réactiver'}
                                                            </button>
                                                            <button onClick={() => removeUserDoc(u)} disabled={busyId === u.id}
                                                                className="h-7 px-2.5 rounded-lg text-xs border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20">
                                                                Supprimer
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => cancelEdit()}
                                                                className="h-7 px-2.5 rounded-lg text-xs border border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 text-gray-700 dark:text-neutral-300">
                                                                Annuler
                                                            </button>
                                                            <button onClick={() => saveEdit(u)} disabled={savingId === u.id}
                                                                className="h-7 px-2.5 rounded-lg text-xs bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black disabled:opacity-60">
                                                                {savingId === u.id ? '…' : 'Enregistrer'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {users.length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-6 text-xs text-gray-400 dark:text-neutral-500">Aucun compte pour le moment.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    )
}
