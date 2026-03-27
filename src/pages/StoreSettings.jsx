import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, setDoc, where,
} from 'firebase/firestore'
import { getApp, getApps, initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth'
import { STAFF_POSTES, STAFF_POSTE_LABELS, GLOBAL_ROLES } from '../lib/constants'
import { useMagasin } from '../store/useMagasin'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function StoreSettings() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const { selectedId: globalSelectedId, setSelectedId: setGlobalSelectedId } = useMagasin()

  // Pour les rôles globaux : liste des magasins + sélection
  const [magasins, setMagasins] = useState([])

  // Magasin courant résolu :
  // - vendeur / directeurmag → leur magasin du profil
  // - acheteur / directeurgen → sélecteur (partagé avec la navbar via useMagasin)
  const magasinId = isGlobal ? globalSelectedId : profile?.magasinId

  const [magasinInfo, setMagasinInfo] = useState(null)
  const [staff, setStaff]             = useState([])
  const [nom, setNom]                 = useState('')
  const [poste, setPoste]             = useState('vendeur')
  const [adding, setAdding]           = useState(false)
  const [editId, setEditId]           = useState(null)
  const [editDraft, setEditDraft]     = useState({})

  // Directeurs de magasin (rôles globaux)
  const [directeurs, setDirecteurs]   = useState([])
  const [dmName, setDmName]           = useState('')
  const [dmEmail, setDmEmail]         = useState('')
  const [dmMagasinId, setDmMagasinId] = useState('')
  const [dmLoading, setDmLoading]     = useState(false)
  const [dmMsg, setDmMsg]             = useState(null)
  const [dmErr, setDmErr]             = useState(null)

  // Chargement des magasins (pour les rôles globaux)
  useEffect(() => {
    if (!isGlobal) return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMagasins(list)
      if (!globalSelectedId && list.length > 0) setGlobalSelectedId(list[0].id)
    })
  }, [isGlobal])

  // Chargement des directeurs de magasin
  useEffect(() => {
    if (!isGlobal) return
    const q = query(collection(db, 'users'), where('role', '==', 'directeurmag'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setDirecteurs(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isGlobal])

  // Chargement des infos du magasin courant
  useEffect(() => {
    if (!magasinId) return
    return onSnapshot(doc(db, 'magasins', magasinId), snap => {
      setMagasinInfo(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [magasinId])

  // Chargement de l'équipe
  useEffect(() => {
    if (!magasinId) return
    const q = query(collection(db, 'magasins', magasinId, 'staff'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [magasinId])

  /* Ajouter un membre */
  async function addMember(e) {
    e.preventDefault()
    if (!nom.trim() || !magasinId) return
    setAdding(true)
    try {
      await addDoc(collection(db, 'magasins', magasinId, 'staff'), {
        nom: nom.trim(),
        poste,
        actif: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      setNom('')
      setPoste('vendeur')
    } finally {
      setAdding(false)
    }
  }

  /* Éditer un membre */
  function startEdit(s) {
    setEditId(s.id)
    setEditDraft({ nom: s.nom, poste: s.poste, actif: s.actif })
  }

  async function saveEdit(s) {
    await updateDoc(doc(db, 'magasins', magasinId, 'staff', s.id), {
      nom: editDraft.nom?.trim() || s.nom,
      poste: editDraft.poste,
      actif: !!editDraft.actif,
      updatedAt: serverTimestamp(),
    })
    setEditId(null)
  }

  /* Supprimer un membre */
  async function removeMember(s) {
    if (!confirm(`Supprimer "${s.nom}" de l'équipe ?`)) return
    await deleteDoc(doc(db, 'magasins', magasinId, 'staff', s.id))
  }

  /* Créer un directeur de magasin */
  async function createDirecteurmag(e) {
    e.preventDefault()
    setDmErr(null); setDmMsg(null)
    if (!dmName.trim()) return setDmErr('Le nom est requis')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dmEmail)) return setDmErr('Email invalide')
    if (!dmMagasinId) return setDmErr('Sélectionne un magasin')
    setDmLoading(true)
    const secName = 'admin-secondary'
    let secApp
    try {
      const options = getApp().options
      secApp = getApps().find(a => a.name === secName) || initializeApp(options, secName)
      const secAuth = getAuth(secApp)
      if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
        try { connectAuthEmulator(secAuth, 'http://localhost:9099', { disableWarnings: true }) } catch {}
      }
      const tempPwd = Math.random().toString(36).slice(2) + 'A9!'
      const cred = await createUserWithEmailAndPassword(secAuth, dmEmail.trim(), tempPwd)
      await updateProfile(cred.user, { displayName: dmName.trim() })
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: dmName.trim(),
        email: dmEmail.trim(),
        role: 'directeurmag',
        magasinId: dmMagasinId,
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      try { await sendPasswordResetEmail(getAuth(), dmEmail.trim()) } catch {}
      setDmMsg(`Compte créé · email de définition du mot de passe envoyé à ${dmEmail.trim()}`)
      setDmName(''); setDmEmail('')
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Cet email existe déjà.',
        'auth/invalid-email': 'Email invalide.',
      }
      setDmErr(map[err.code] || err.message)
    } finally {
      setDmLoading(false)
      if (secApp) { try { await deleteApp(secApp) } catch {} }
    }
  }

  /* Créer un magasin (rôles globaux) */
  const [showNewMagasin, setShowNewMagasin] = useState(false)
  const [newMagasinNom, setNewMagasinNom]   = useState('')

  async function createMagasin(e) {
    e.preventDefault()
    if (!newMagasinNom.trim()) return
    const ref = await addDoc(collection(db, 'magasins'), {
      nom: newMagasinNom.trim(),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
    setGlobalSelectedId(ref.id)
    setNewMagasinNom('')
    setShowNewMagasin(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 p-5">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Admin</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Gestion des magasins et de l'équipe</p>
            </div>
            {isGlobal && (
              <button
                onClick={() => setShowNewMagasin(v => !v)}
                className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors
                           bg-gray-900 text-white hover:bg-gray-700
                           dark:bg-white dark:text-black dark:hover:bg-gray-100"
              >
                + Nouveau magasin
              </button>
            )}
          </div>

          {/* Section directeurs de magasin (rôles globaux) */}
          {isGlobal && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Directeurs de magasin</span>
              </div>
              <div className="p-4 space-y-4">
                {dmErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{dmErr}</p>}
                {dmMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{dmMsg}</p>}
                <form onSubmit={createDirecteurmag} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                    <input className="Input" value={dmName} onChange={e => setDmName(e.target.value)} placeholder="Prénom Nom" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                    <input type="email" className="Input" value={dmEmail} onChange={e => setDmEmail(e.target.value)} placeholder="directeur@exemple.com" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin</span>
                    <select className="Input" value={dmMagasinId} onChange={e => setDmMagasinId(e.target.value)}>
                      <option value="">— Sélectionner</option>
                      {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                    </select>
                  </label>
                  <div className="md:col-span-3 flex justify-end">
                    <button type="submit" disabled={dmLoading}
                      className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                      {dmLoading ? 'Création…' : 'Créer le directeur'}
                    </button>
                  </div>
                </form>

                {directeurs.length > 0 && (
                  <div className="border border-gray-100 dark:border-neutral-800 rounded-xl overflow-hidden">
                    {directeurs.map(d => {
                      const mag = magasins.find(m => m.id === d.magasinId)
                      return (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                          <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-neutral-800 grid place-items-center shrink-0">
                            <span className="text-[10px] font-semibold text-gray-600 dark:text-neutral-300">
                              {d.displayName?.[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-white">{d.displayName || '—'}</p>
                            <p className="text-[11px] text-gray-400 dark:text-neutral-500">{d.email} · {mag?.nom || d.magasinId}</p>
                          </div>
                          {!d.isActive && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">Inactif</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sélecteur de magasin (rôles globaux) */}
          {isGlobal && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Magasin</span>
              </div>
              <div className="p-4">
                {magasins.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-neutral-500">Aucun magasin créé.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {magasins.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setGlobalSelectedId(m.id)}
                        className={[
                          'h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                          globalSelectedId === m.id
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                            : 'text-gray-600 border border-gray-200 hover:bg-gray-50 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800',
                        ].join(' ')}
                      >
                        {m.nom}
                      </button>
                    ))}
                  </div>
                )}
                {showNewMagasin && (
                  <form onSubmit={createMagasin} className="flex items-center gap-2 mt-3">
                    <input
                      className="Input h-8 text-xs flex-1"
                      placeholder="Nom du magasin"
                      value={newMagasinNom}
                      onChange={e => setNewMagasinNom(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newMagasinNom.trim()}
                      className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50
                                 bg-gray-900 text-white hover:bg-gray-700
                                 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                    >
                      Créer
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewMagasin(false)}
                      className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400"
                    >
                      Annuler
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {!magasinId ? (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-neutral-500">
                {isGlobal ? 'Crée ou sélectionne un magasin pour gérer son équipe.' : 'Aucun magasin associé à votre compte.'}
              </p>
            </div>
          ) : (
            <>
              {/* Infos magasin */}
              {magasinInfo && (
                <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                    <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Informations</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Nom</p>
                      <p className="text-sm text-gray-900 dark:text-white">{magasinInfo.nom}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Créé le</p>
                      <p className="text-sm text-gray-900 dark:text-white">{fmtDate(magasinInfo.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ajouter un membre */}
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Ajouter un membre</span>
                </div>
                <form onSubmit={addMember} className="p-4 flex items-end gap-3">
                  <label className="block space-y-1 flex-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                    <input
                      className="Input"
                      placeholder="Prénom Nom"
                      value={nom}
                      onChange={e => setNom(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 w-40">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Poste</span>
                    <select className="Input" value={poste} onChange={e => setPoste(e.target.value)}>
                      {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={adding || !nom.trim()}
                    className="h-10 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 shrink-0
                               bg-gray-900 text-white hover:bg-gray-700
                               dark:bg-white dark:text-black dark:hover:bg-gray-100"
                  >
                    {adding ? 'Ajout…' : 'Ajouter'}
                  </button>
                </form>
              </div>

              {/* Liste de l'équipe */}
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                    <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Équipe</span>
                  </div>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {staff.length}
                  </span>
                </div>

                {staff.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-gray-400 dark:text-neutral-500 text-center">
                    Aucun membre dans l'équipe. Ajoutez-en un ci-dessus.
                  </p>
                ) : (
                  <div>
                    {staff.map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                        {/* Avatar initiales */}
                        <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-neutral-800 grid place-items-center shrink-0">
                          <span className="text-xs font-semibold text-gray-600 dark:text-neutral-300">
                            {s.nom?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>

                        {editId === s.id ? (
                          /* Mode édition */
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              className="Input h-8 text-xs flex-1"
                              value={editDraft.nom}
                              onChange={e => setEditDraft(d => ({ ...d, nom: e.target.value }))}
                            />
                            <select
                              className="Input h-8 text-xs w-36"
                              value={editDraft.poste}
                              onChange={e => setEditDraft(d => ({ ...d, poste: e.target.value }))}
                            >
                              {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-neutral-400 shrink-0">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={!!editDraft.actif}
                                onChange={e => setEditDraft(d => ({ ...d, actif: e.target.checked }))}
                              />
                              Actif
                            </label>
                            <button
                              onClick={() => saveEdit(s)}
                              className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          /* Mode lecture */
                          <>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-white">{s.nom}</p>
                              <p className="text-[11px] text-gray-400 dark:text-neutral-500">{STAFF_POSTE_LABELS[s.poste] || s.poste}</p>
                            </div>
                            {!s.actif && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                                Inactif
                              </span>
                            )}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => startEdit(s)}
                                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                                           dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => removeMember(s)}
                                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50
                                           dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
