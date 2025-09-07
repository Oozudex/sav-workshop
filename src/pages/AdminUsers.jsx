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
    getAuth, createUserWithEmailAndPassword, sendEmailVerification,
    sendPasswordResetEmail, updateProfile
} from 'firebase/auth'

const ROLES = [
    { value: 'staff', label: 'Équipe' },
    { value: 'mechanic', label: 'Mécano' },
    { value: 'buyer', label: 'Acheteur' },
    { value: 'admin', label: 'Admin' },
]
const roleLabel = (r) => ({ admin: 'Admin', staff: 'Équipe', mechanic: 'Mécano', buyer: 'Acheteur' }[r] || r || '—')

export default function AdminUsers() {
    const { profile } = useAuth(s => ({ profile: s.profile }))

    // liste
    const [users, setUsers] = useState([])
    // création
    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [role, setRole] = useState('staff')
    const [invite, setInvite] = useState(true)
    const [loadingCreate, setLoadingCreate] = useState(false)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)
    // édition
    const [editingId, setEditingId] = useState(null)
    const [draft, setDraft] = useState({ displayName: '', role: 'staff', isActive: true })
    const [savingId, setSavingId] = useState(null)
    const [busyId, setBusyId] = useState(null) // pour reset/désactiver/supprimer

    useEffect(() => {
        const qRef = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
        return onSnapshot(qRef, snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, [])

    /* ------------------- CRÉATION ------------------- */
    async function handleCreate(e) {
        e.preventDefault()
        setErr(null); setMsg(null)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("Email invalide")
        if (!displayName.trim()) return setErr("Nom affiché requis")

        setLoadingCreate(true)
        const secName = 'admin-secondary'
        let secApp
        try {
            // App secondaire pour ne pas te déconnecter
            const options = getApp().options
            secApp = getApps().find(a => a.name === secName) || initializeApp(options, secName)
            const secAuth = getAuth(secApp)

            const tempPwd = Math.random().toString(36).slice(2) + 'A9!'
            const cred = await createUserWithEmailAndPassword(secAuth, email.trim(), tempPwd)
            await updateProfile(cred.user, { displayName })

            await setDoc(doc(db, 'users', cred.user.uid), {
                displayName,
                email: email.trim(),
                role,
                isActive: true,
                createdAt: serverTimestamp(),
                createdBy: profile?.uid || 'admin'
            })

            try { await sendEmailVerification(cred.user) } catch { }
            if (invite) {
                const mainAuth = getAuth()
                try { await sendPasswordResetEmail(mainAuth, email.trim()) } catch { }
            }

            setMsg(`Utilisateur créé : ${displayName} (${email.trim()})`)
            setEmail(''); setDisplayName(''); setRole('staff'); setInvite(true)
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
        setDraft({ displayName: u.displayName || '', role: u.role || 'staff', isActive: !!u.isActive })
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
                    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <h1 className="font-heading text-xl">Administration — Utilisateurs</h1>
                        <div className="text-sm text-gray-500 dark:text-neutral-400">Accès : Admin & Acheteur</div>
                    </header>

                    {/* Form création */}
                    <div className="rounded-2xl border bg-white p-4 border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
                        <h2 className="text-sm font-semibold mb-3">Créer un utilisateur</h2>
                        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{err}</div>}
                        {msg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3">{msg}</div>}

                        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium">Nom affiché</label>
                                <input className="Input mt-1" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Prénom Nom" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium">Email</label>
                                <input type="email" className="Input mt-1" value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@exemple.com" />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Rôle</label>
                                <select className="Input mt-1" value={role} onChange={e => setRole(e.target.value)}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-3 flex items-center gap-2">
                                <input id="invite" type="checkbox" className="h-4 w-4" checked={invite} onChange={e => setInvite(e.target.checked)} />
                                <label htmlFor="invite" className="text-sm">Envoyer un email pour définir le mot de passe</label>
                            </div>
                            <div className="md:col-span-2 flex items-center justify-end gap-2">
                                <button type="submit" disabled={loadingCreate}
                                    className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-60
                                   dark:bg-white dark:text-black">
                                    {loadingCreate ? 'Création…' : 'Créer l’utilisateur'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Liste + édition */}
                    <div className="rounded-2xl border bg-white p-4 border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
                        <h2 className="text-sm font-semibold mb-3">Utilisateurs existants</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-gray-600 dark:text-neutral-400">
                                    <tr>
                                        <th className="py-2 pr-4">Nom</th>
                                        <th className="py-2 pr-4">Email</th>
                                        <th className="py-2 pr-4">Rôle</th>
                                        <th className="py-2 pr-4">Actif</th>
                                        <th className="py-2 pr-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => {
                                        const isEditing = editingId === u.id
                                        return (
                                            <tr key={u.id} className="border-t border-gray-100 dark:border-neutral-800">
                                                <td className="py-2 pr-4">
                                                    {isEditing
                                                        ? <input className="Input h-9" value={draft.displayName} onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))} />
                                                        : (u.displayName || '—')}
                                                </td>
                                                <td className="py-2 pr-4">{u.email || '—'}</td>
                                                <td className="py-2 pr-4">
                                                    {isEditing
                                                        ? (
                                                            <select className="Input h-9" value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}>
                                                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                            </select>
                                                        )
                                                        : roleLabel(u.role)}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {isEditing
                                                        ? (
                                                            <label className="inline-flex items-center gap-2">
                                                                <input type="checkbox" className="h-4 w-4"
                                                                    checked={!!draft.isActive}
                                                                    onChange={e => setDraft(d => ({ ...d, isActive: e.target.checked }))} />
                                                                <span>{draft.isActive ? 'Oui' : 'Non'}</span>
                                                            </label>
                                                        )
                                                        : (u.isActive ? 'Oui' : 'Non')}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {!isEditing ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            <button onClick={() => startEdit(u)}
                                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
                                                                Éditer
                                                            </button>
                                                            <button onClick={() => resetPassword(u)} disabled={busyId === u.id || !u.email}
                                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-60">
                                                                Reset MDP
                                                            </button>
                                                            <button onClick={() => toggleActive(u)} disabled={busyId === u.id}
                                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
                                                                {u.isActive ? 'Désactiver' : 'Réactiver'}
                                                            </button>
                                                            <button onClick={() => removeUserDoc(u)} disabled={busyId === u.id}
                                                                className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20">
                                                                Supprimer (Firestore)
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            <button onClick={() => cancelEdit()}
                                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
                                                                Annuler
                                                            </button>
                                                            <button onClick={() => saveEdit(u)} disabled={savingId === u.id}
                                                                className="px-2.5 py-1.5 rounded-lg bg-black text-white hover:opacity-90 dark:bg-white dark:text-black disabled:opacity-60">
                                                                {savingId === u.id ? 'Enregistrement…' : 'Enregistrer'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {users.length === 0 && (
                                        <tr><td colSpan={5} className="py-4 text-gray-500 dark:text-neutral-400">Aucun utilisateur pour le moment.</td></tr>
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
