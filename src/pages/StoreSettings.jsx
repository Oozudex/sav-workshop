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
import { STAFF_POSTES, STAFF_POSTE_LABELS, GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import { useMagasin } from '../store/useMagasin'

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function createAuthAccount(email, displayName) {
  const secName = 'secondary-app'
  let secApp
  try {
    const options = getApp().options
    secApp = getApps().find(a => a.name === secName) || initializeApp(options, secName)
    const secAuth = getAuth(secApp)
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
      try { connectAuthEmulator(secAuth, 'http://localhost:9099', { disableWarnings: true }) } catch {}
    }
    const tempPwd = Math.random().toString(36).slice(2) + 'A9!'
    const cred = await createUserWithEmailAndPassword(secAuth, email, tempPwd)
    await updateProfile(cred.user, { displayName })
    return cred.user.uid
  } finally {
    if (secApp) { try { await deleteApp(secApp) } catch {} }
  }
}

export default function StoreSettings() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const isGlobal       = GLOBAL_ROLES.includes(profile?.role)
  const isDirecteurGen = profile?.role === 'directeurgen'
  const canManageRayons = isGlobal || profile?.role === 'directeurmag'
  const { selectedId: globalSelectedId, setSelectedId: setGlobalSelectedId } = useMagasin()

  const magasinId = isGlobal ? globalSelectedId : profile?.magasinId

  const [magasins,    setMagasins]    = useState([])
  const [magasinInfo, setMagasinInfo] = useState(null)
  const [directeurs,  setDirecteurs]  = useState([])

  // Rayons
  const [rayons,          setRayons]          = useState([])
  const [selectedRayonId, setSelectedRayonId] = useState(null)
  const [showNewRayon,    setShowNewRayon]    = useState(false)
  const [newRayonNom,     setNewRayonNom]     = useState('')
  const [newRayonType,    setNewRayonType]    = useState(RAYON_TYPES[0])
  const [newRayonEmail,   setNewRayonEmail]   = useState('')
  const [rayonLoading,    setRayonLoading]    = useState(false)
  const [rayonErr,        setRayonErr]        = useState(null)
  const [rayonMsg,        setRayonMsg]        = useState(null)

  // Staff (sous rayon sélectionné)
  const [staff,     setStaff]     = useState([])
  const [nom,       setNom]       = useState('')
  const [poste,     setPoste]     = useState(STAFF_POSTES[0])
  const [adding,    setAdding]    = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [editDraft, setEditDraft] = useState({})

  // Directeurs de magasin
  const [dmName,      setDmName]      = useState('')
  const [dmEmail,     setDmEmail]     = useState('')
  const [dmMagasinId, setDmMagasinId] = useState('')
  const [dmLoading,   setDmLoading]   = useState(false)
  const [dmMsg,       setDmMsg]       = useState(null)
  const [dmErr,       setDmErr]       = useState(null)
  const [editDirId,   setEditDirId]   = useState(null)
  const [editDirDraft,setEditDirDraft]= useState({})

  // Rayons — édition
  const [editRayonId,   setEditRayonId]   = useState(null)
  const [editRayonDraft,setEditRayonDraft]= useState({})

  // Acheteurs (directeurgen uniquement)
  const [acheteurs,         setAcheteurs]         = useState([])
  const [showNewAcheteur,   setShowNewAcheteur]   = useState(false)
  const [acheteurNom,       setAcheteurNom]       = useState('')
  const [acheteurEmail,     setAcheteurEmail]     = useState('')
  const [acheteurRayonsSel, setAcheteurRayonsSel] = useState([])
  const [acheteurLoading,   setAcheteurLoading]   = useState(false)
  const [acheteurMsg,       setAcheteurMsg]       = useState(null)
  const [acheteurErr,       setAcheteurErr]       = useState(null)
  const [editAcheteurId,    setEditAcheteurId]    = useState(null)
  const [editAcheteurDraft, setEditAcheteurDraft] = useState({})

  // Nouveau magasin
  const [showNewMagasin,    setShowNewMagasin]    = useState(false)
  const [newMagasinNom,     setNewMagasinNom]     = useState('')
  const [newMagasinLoading, setNewMagasinLoading] = useState(false)
  const [newMagasinErr,     setNewMagasinErr]     = useState(null)

  useEffect(() => {
    if (!isGlobal) return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMagasins(list)
      if (!globalSelectedId && list.length > 0) setGlobalSelectedId(list[0].id)
    })
  }, [isGlobal])

  useEffect(() => {
    if (!isDirecteurGen) return
    const q = query(collection(db, 'users'), where('role', '==', 'directeurmag'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setDirecteurs(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isGlobal])

  useEffect(() => {
    if (!magasinId) return
    return onSnapshot(doc(db, 'magasins', magasinId), snap => {
      setMagasinInfo(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [magasinId])

  useEffect(() => {
    if (!magasinId) return
    setSelectedRayonId(null)
    const q = query(collection(db, 'magasins', magasinId, 'rayons'), orderBy('type', 'asc'))
    return onSnapshot(q, snap => setRayons(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [magasinId])

  useEffect(() => {
    if (!magasinId || !selectedRayonId) { setStaff([]); return }
    const q = query(collection(db, 'magasins', magasinId, 'rayons', selectedRayonId, 'staff'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [magasinId, selectedRayonId])

  useEffect(() => {
    if (profile?.role !== 'directeurgen') return
    const q = query(collection(db, 'users'), where('role', '==', 'acheteur'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setAcheteurs(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [profile?.role])

  /* Acheteurs CRUD */
  async function createAcheteur(e) {
    e.preventDefault()
    setAcheteurErr(null); setAcheteurMsg(null)
    if (!acheteurNom.trim()) return setAcheteurErr('Le nom est requis')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acheteurEmail)) return setAcheteurErr('Email invalide')
    setAcheteurLoading(true)
    try {
      const uid = await createAuthAccount(acheteurEmail.trim(), acheteurNom.trim())
      await setDoc(doc(db, 'users', uid), {
        displayName: acheteurNom.trim(),
        email:       acheteurEmail.trim(),
        role:        'acheteur',
        rayons:      acheteurRayonsSel,
        isActive:    true,
        createdAt:   serverTimestamp(),
        createdBy:   user.uid,
      })
      try { await sendPasswordResetEmail(getAuth(), acheteurEmail.trim()) } catch {}
      setAcheteurMsg(`Acheteur créé · email de définition du mot de passe envoyé à ${acheteurEmail.trim()}`)
      setAcheteurNom(''); setAcheteurEmail(''); setAcheteurRayonsSel([])
      setShowNewAcheteur(false)
    } catch (err) {
      const map = { 'auth/email-already-in-use': 'Cet email existe déjà.', 'auth/invalid-email': 'Email invalide.' }
      setAcheteurErr(map[err.code] || err.message)
    } finally {
      setAcheteurLoading(false)
    }
  }

  async function saveAcheteur(a) {
    await updateDoc(doc(db, 'users', a.id), {
      displayName: editAcheteurDraft.displayName?.trim() || a.displayName,
      rayons:      editAcheteurDraft.rayons ?? a.rayons ?? [],
      updatedAt:   serverTimestamp(),
    })
    setEditAcheteurId(null)
  }

  async function deleteAcheteur(a) {
    if (!confirm(`Supprimer l'acheteur "${a.displayName}" ?`)) return
    await deleteDoc(doc(db, 'users', a.id))
  }

  function toggleRayonInDraft(rayon) {
    setEditAcheteurDraft(v => {
      const list = v.rayons ?? []
      return { ...v, rayons: list.includes(rayon) ? list.filter(r => r !== rayon) : [...list, rayon] }
    })
  }

  /* Créer un magasin */
  async function createMagasin(e) {
    e.preventDefault()
    if (!newMagasinNom.trim()) return
    setNewMagasinLoading(true)
    setNewMagasinErr(null)
    try {
      const ref = await addDoc(collection(db, 'magasins'), {
        nom: newMagasinNom.trim(),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      setGlobalSelectedId(ref.id)
      setNewMagasinNom('')
      setShowNewMagasin(false)
    } catch (err) {
      setNewMagasinErr(err.message)
    } finally {
      setNewMagasinLoading(false)
    }
  }

  /* Modifier / supprimer un directeur */
  async function saveDirecteur(d) {
    await updateDoc(doc(db, 'users', d.id), {
      displayName: editDirDraft.displayName?.trim() || d.displayName,
      magasinId:   editDirDraft.magasinId || d.magasinId,
      updatedAt:   serverTimestamp(),
    })
    setEditDirId(null)
  }

  async function deleteDirecteur(d) {
    if (!confirm(`Supprimer le directeur "${d.displayName}" ?`)) return
    await deleteDoc(doc(db, 'users', d.id))
  }

  /* Modifier / supprimer un rayon */
  async function saveRayon(r) {
    await updateDoc(doc(db, 'magasins', magasinId, 'rayons', r.id), {
      nom:       editRayonDraft.nom?.trim() || r.nom,
      type:      editRayonDraft.type || r.type,
      updatedAt: serverTimestamp(),
    })
    if (r.uid) {
      await updateDoc(doc(db, 'users', r.uid), {
        displayName: editRayonDraft.nom?.trim() || r.nom,
        role:        editRayonDraft.type || r.type,
        updatedAt:   serverTimestamp(),
      })
    }
    setEditRayonId(null)
  }

  async function deleteRayon(r) {
    if (!confirm(`Supprimer le rayon "${r.nom}" ?`)) return
    if (r.uid) await deleteDoc(doc(db, 'users', r.uid))
    await deleteDoc(doc(db, 'magasins', magasinId, 'rayons', r.id))
    if (selectedRayonId === r.id) setSelectedRayonId(null)
  }

  /* Créer un rayon */
  async function createRayon(e) {
    e.preventDefault()
    if (!newRayonNom.trim()) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newRayonEmail)) return setRayonErr('Email invalide')
    setRayonLoading(true); setRayonErr(null); setRayonMsg(null)
    try {
      const uid = await createAuthAccount(newRayonEmail.trim(), newRayonNom.trim())
      const rayonRef = await addDoc(collection(db, 'magasins', magasinId, 'rayons'), {
        nom:       newRayonNom.trim(),
        type:      newRayonType,
        email:     newRayonEmail.trim(),
        uid,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      })
      await setDoc(doc(db, 'users', uid), {
        displayName: newRayonNom.trim(),
        email:       newRayonEmail.trim(),
        role:        newRayonType,
        magasinId,
        rayonId:     rayonRef.id,
        isActive:    true,
        createdAt:   serverTimestamp(),
        createdBy:   user.uid,
      })
      try { await sendPasswordResetEmail(getAuth(), newRayonEmail.trim()) } catch {}
      setRayonMsg(`Rayon créé · email de définition du mot de passe envoyé à ${newRayonEmail.trim()}`)
      setNewRayonNom(''); setNewRayonEmail(''); setNewRayonType(RAYON_TYPES[0])
      setShowNewRayon(false)
    } catch (err) {
      const map = { 'auth/email-already-in-use': 'Cet email existe déjà.', 'auth/invalid-email': 'Email invalide.' }
      setRayonErr(map[err.code] || err.message)
    } finally {
      setRayonLoading(false)
    }
  }

  /* Créer un directeur de magasin */
  async function createDirecteurmag(e) {
    e.preventDefault()
    setDmErr(null); setDmMsg(null)
    if (!dmName.trim()) return setDmErr('Le nom est requis')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dmEmail)) return setDmErr('Email invalide')
    if (!dmMagasinId) return setDmErr('Sélectionne un magasin')
    setDmLoading(true)
    try {
      const uid = await createAuthAccount(dmEmail.trim(), dmName.trim())
      await setDoc(doc(db, 'users', uid), {
        displayName: dmName.trim(),
        email:       dmEmail.trim(),
        role:        'directeurmag',
        magasinId:   dmMagasinId,
        isActive:    true,
        createdAt:   serverTimestamp(),
        createdBy:   user.uid,
      })
      try { await sendPasswordResetEmail(getAuth(), dmEmail.trim()) } catch {}
      setDmMsg(`Compte créé · email de définition du mot de passe envoyé à ${dmEmail.trim()}`)
      setDmName(''); setDmEmail('')
    } catch (err) {
      const map = { 'auth/email-already-in-use': 'Cet email existe déjà.', 'auth/invalid-email': 'Email invalide.' }
      setDmErr(map[err.code] || err.message)
    } finally {
      setDmLoading(false)
    }
  }

  /* Staff CRUD */
  async function addMember(e) {
    e.preventDefault()
    if (!nom.trim() || !selectedRayonId) return
    setAdding(true)
    try {
      await addDoc(collection(db, 'magasins', magasinId, 'rayons', selectedRayonId, 'staff'), {
        nom: nom.trim(), poste, actif: true,
        magasinId,
        rayonId: selectedRayonId,
        createdAt: serverTimestamp(), createdBy: user.uid,
      })
      setNom(''); setPoste(STAFF_POSTES[0])
    } finally { setAdding(false) }
  }

  function startEdit(s) { setEditId(s.id); setEditDraft({ nom: s.nom, poste: s.poste, actif: s.actif }) }

  async function saveEdit(s) {
    await updateDoc(doc(db, 'magasins', magasinId, 'rayons', selectedRayonId, 'staff', s.id), {
      nom: editDraft.nom?.trim() || s.nom,
      poste: editDraft.poste,
      actif: !!editDraft.actif,
      updatedAt: serverTimestamp(),
    })
    setEditId(null)
  }

  async function removeMember(s) {
    if (!confirm(`Supprimer "${s.nom}" ?`)) return
    await deleteDoc(doc(db, 'magasins', magasinId, 'rayons', selectedRayonId, 'staff', s.id))
  }

  const selectedRayon = rayons.find(r => r.id === selectedRayonId)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 p-5">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
                {isDirecteurGen ? 'Admin' : 'Paramètres magasin'}
              </h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                {isDirecteurGen ? "Gestion des magasins et de l'équipe" : "Gestion des équipes par rayon"}
              </p>
            </div>
            {isDirecteurGen && (
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

          {/* Acheteurs (directeurgen uniquement) */}
          {profile?.role === 'directeurgen' && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Acheteurs</span>
                </div>
                <button
                  onClick={() => { setShowNewAcheteur(v => !v); setAcheteurErr(null); setAcheteurMsg(null) }}
                  className="h-6 px-2.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors"
                >
                  + Nouvel acheteur
                </button>
              </div>
              <div className="p-4 space-y-4">
                {acheteurErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{acheteurErr}</p>}
                {acheteurMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{acheteurMsg}</p>}

                {showNewAcheteur && (
                  <form onSubmit={createAcheteur} className="p-3 rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/30 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                        <input className="Input" value={acheteurNom} onChange={e => setAcheteurNom(e.target.value)} placeholder="Prénom Nom" autoFocus />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                        <input type="email" className="Input" value={acheteurEmail} onChange={e => setAcheteurEmail(e.target.value)} placeholder="acheteur@exemple.com" />
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rayons attitrés</span>
                      <div className="flex flex-wrap gap-2">
                        {RAYON_TYPES.map(r => (
                          <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded accent-gray-900"
                              checked={acheteurRayonsSel.includes(r)}
                              onChange={e => setAcheteurRayonsSel(v => e.target.checked ? [...v, r] : v.filter(x => x !== r))}
                            />
                            <span className="text-xs text-gray-700 dark:text-neutral-300">{RAYON_TYPE_LABELS[r]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowNewAcheteur(false)}
                        className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">
                        Annuler
                      </button>
                      <button type="submit" disabled={acheteurLoading || !acheteurNom.trim() || !acheteurEmail.trim()}
                        className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                        {acheteurLoading ? 'Création…' : 'Créer'}
                      </button>
                    </div>
                  </form>
                )}

                {acheteurs.length > 0 && (
                  <div className="border border-gray-100 dark:border-neutral-800 rounded-xl overflow-hidden">
                    {acheteurs.map(a => (
                      <div key={a.id} className="flex items-start gap-3 px-3 py-2.5 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                        <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-neutral-800 grid place-items-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-semibold text-gray-600 dark:text-neutral-300">
                            {a.displayName?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        {editAcheteurId === a.id ? (
                          <div className="flex-1 space-y-2">
                            <input
                              className="Input h-8 text-xs w-full"
                              value={editAcheteurDraft.displayName}
                              onChange={e => setEditAcheteurDraft(v => ({ ...v, displayName: e.target.value }))}
                            />
                            <div className="flex flex-wrap gap-2">
                              {RAYON_TYPES.map(r => (
                                <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded accent-gray-900"
                                    checked={(editAcheteurDraft.rayons ?? []).includes(r)}
                                    onChange={() => toggleRayonInDraft(r)}
                                  />
                                  <span className="text-xs text-gray-700 dark:text-neutral-300">{RAYON_TYPE_LABELS[r]}</span>
                                </label>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveAcheteur(a)}
                                className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">OK</button>
                              <button onClick={() => setEditAcheteurId(null)}
                                className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">✕</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-white">{a.displayName || '—'}</p>
                              <p className="text-[11px] text-gray-400 dark:text-neutral-500">{a.email}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(a.rayons?.length > 0) ? a.rayons.map(r => (
                                  <span key={r} className="h-5 px-1.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
                                    {RAYON_TYPE_LABELS[r] || r}
                                  </span>
                                )) : (
                                  <span className="text-[11px] text-gray-300 dark:text-neutral-600 italic">Aucun rayon</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => { setEditAcheteurId(a.id); setEditAcheteurDraft({ displayName: a.displayName, rayons: a.rayons ?? [] }) }}
                                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => deleteAcheteur(a)}
                                className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
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

                {acheteurs.length === 0 && !showNewAcheteur && (
                  <p className="text-xs text-gray-400 dark:text-neutral-500 text-center py-2">Aucun acheteur créé.</p>
                )}
              </div>
            </div>
          )}

          {/* Directeurs de magasin (directeurgen uniquement) */}
          {isDirecteurGen && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Directeurs de magasin</span>
              </div>
              <div className="p-4 space-y-4">
                {dmErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{dmErr}</p>}
                {dmMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{dmMsg}</p>}
                <form onSubmit={createDirecteurmag} className="grid grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                    <input className="Input" value={dmName} onChange={e => setDmName(e.target.value)} placeholder="Prénom Nom" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                    <input type="email" className="Input" value={dmEmail} onChange={e => setDmEmail(e.target.value)} placeholder="directeur@exemple.com" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin</span>
                    <select className="Input" value={dmMagasinId} onChange={e => setDmMagasinId(e.target.value)}>
                      <option value="">— Sélectionner</option>
                      {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                    </select>
                  </label>
                  <div className="col-span-3 flex justify-end">
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
                          {editDirId === d.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input className="Input h-8 text-xs flex-1" value={editDirDraft.displayName}
                                onChange={e => setEditDirDraft(v => ({ ...v, displayName: e.target.value }))} />
                              <select className="Input h-8 text-xs w-40" value={editDirDraft.magasinId}
                                onChange={e => setEditDirDraft(v => ({ ...v, magasinId: e.target.value }))}>
                                <option value="">— Magasin</option>
                                {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                              </select>
                              <button onClick={() => saveDirecteur(d)}
                                className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">OK</button>
                              <button onClick={() => setEditDirId(null)}
                                className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">✕</button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white">{d.displayName || '—'}</p>
                                <p className="text-[11px] text-gray-400 dark:text-neutral-500">{d.email} · {mag?.nom || d.magasinId}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => { setEditDirId(d.id); setEditDirDraft({ displayName: d.displayName, magasinId: d.magasinId }) }}
                                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button onClick={() => deleteDirecteur(d)}
                                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
                                  </svg>
                                </button>
                              </div>
                            </>
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
                <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Magasins</span>
              </div>
              <div className="p-4">
                {magasins.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-neutral-500">Aucun magasin créé.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {magasins.map(m => (
                      <button key={m.id} onClick={() => setGlobalSelectedId(m.id)}
                        className={['h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                          globalSelectedId === m.id
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                            : 'text-gray-600 border border-gray-200 hover:bg-gray-50 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800',
                        ].join(' ')}>
                        {m.nom}
                      </button>
                    ))}
                  </div>
                )}
                {showNewMagasin && (
                  <form onSubmit={createMagasin} className="mt-3 space-y-2">
                    {newMagasinErr && <p className="text-xs text-red-600">{newMagasinErr}</p>}
                    <div className="flex gap-2">
                      <input className="Input h-8 text-xs flex-1" placeholder="Nom du magasin"
                        value={newMagasinNom} onChange={e => setNewMagasinNom(e.target.value)} autoFocus />
                      <button type="submit" disabled={newMagasinLoading || !newMagasinNom.trim()}
                        className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                        {newMagasinLoading ? 'Création…' : 'Créer'}
                      </button>
                      <button type="button" onClick={() => setShowNewMagasin(false)}
                        className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {!magasinId ? (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-neutral-500">
                {isGlobal ? 'Crée ou sélectionne un magasin.' : 'Aucun magasin associé à votre compte.'}
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

              {/* Rayons */}
              {canManageRayons && (
                <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Rayons</span>
                    </div>
                    <button onClick={() => { setShowNewRayon(v => !v); setRayonErr(null); setRayonMsg(null) }}
                      className="h-6 px-2.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                      + Nouveau rayon
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {rayonErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{rayonErr}</p>}
                    {rayonMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{rayonMsg}</p>}

                    {showNewRayon && (
                      <form onSubmit={createRayon} className="grid grid-cols-3 gap-3 p-3 rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/30">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom du rayon</span>
                          <input className="Input h-8 text-xs" placeholder="Ex: Rayon Vélo" value={newRayonNom} onChange={e => setNewRayonNom(e.target.value)} autoFocus />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Type</span>
                          <select className="Input h-8 text-xs" value={newRayonType} onChange={e => setNewRayonType(e.target.value)}>
                            {RAYON_TYPES.map(t => <option key={t} value={t}>{RAYON_TYPE_LABELS[t]}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email de connexion</span>
                          <input type="email" className="Input h-8 text-xs" placeholder="rayon@exemple.com" value={newRayonEmail} onChange={e => setNewRayonEmail(e.target.value)} />
                        </label>
                        <div className="col-span-3 flex justify-end gap-2">
                          <button type="button" onClick={() => setShowNewRayon(false)}
                            className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">
                            Annuler
                          </button>
                          <button type="submit" disabled={rayonLoading || !newRayonNom.trim() || !newRayonEmail.trim()}
                            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                            {rayonLoading ? 'Création…' : 'Créer'}
                          </button>
                        </div>
                      </form>
                    )}

                    {rayons.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-neutral-500 text-center py-2">Aucun rayon créé.</p>
                    ) : (
                      <div className="border border-gray-100 dark:border-neutral-800 rounded-xl overflow-hidden">
                        {rayons.map(r => (
                          <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                            {editRayonId === r.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input className="Input h-8 text-xs flex-1" value={editRayonDraft.nom}
                                  onChange={e => setEditRayonDraft(v => ({ ...v, nom: e.target.value }))} />
                                <select className="Input h-8 text-xs w-36" value={editRayonDraft.type}
                                  onChange={e => setEditRayonDraft(v => ({ ...v, type: e.target.value }))}>
                                  {RAYON_TYPES.map(t => <option key={t} value={t}>{RAYON_TYPE_LABELS[t]}</option>)}
                                </select>
                                <button onClick={() => saveRayon(r)}
                                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">OK</button>
                                <button onClick={() => setEditRayonId(null)}
                                  className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">✕</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => setSelectedRayonId(r.id === selectedRayonId ? null : r.id)}
                                  className="flex-1 flex items-center gap-2 text-left">
                                  <span className={['h-6 px-2 rounded-md text-[11px] font-semibold transition-colors',
                                    selectedRayonId === r.id
                                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                                      : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400',
                                  ].join(' ')}>
                                    {RAYON_TYPE_LABELS[r.type] || r.type}
                                  </span>
                                  <span className="text-xs font-medium text-gray-900 dark:text-white">{r.nom}</span>
                                  <span className="text-[11px] text-gray-400 dark:text-neutral-500">{r.email}</span>
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => { setEditRayonId(r.id); setEditRayonDraft({ nom: r.nom, type: r.type }) }}
                                    className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button onClick={() => deleteRayon(r)}
                                    className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors">
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
                </div>
              )}

              {/* Équipe du rayon sélectionné */}
              {selectedRayonId && (
                <>
                  <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">
                        Équipe — {selectedRayon?.nom}
                      </span>
                    </div>
                    <form onSubmit={addMember} className="p-4 flex items-end gap-3">
                      <label className="block space-y-1 flex-1">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                        <input className="Input" placeholder="Prénom Nom" value={nom} onChange={e => setNom(e.target.value)} />
                      </label>
                      <label className="block space-y-1 w-40">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Poste</span>
                        <select className="Input" value={poste} onChange={e => setPoste(e.target.value)}>
                          {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
                        </select>
                      </label>
                      <button type="submit" disabled={adding || !nom.trim()}
                        className="h-10 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 shrink-0
                                   bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                        {adding ? 'Ajout…' : 'Ajouter'}
                      </button>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Membres</span>
                      </div>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {staff.length}
                      </span>
                    </div>
                    {staff.length === 0 ? (
                      <p className="px-4 py-6 text-xs text-gray-400 dark:text-neutral-500 text-center">Aucun membre. Ajoutez-en un ci-dessus.</p>
                    ) : (
                      <div>
                        {staff.map(s => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                            <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-neutral-800 grid place-items-center shrink-0">
                              <span className="text-xs font-semibold text-gray-600 dark:text-neutral-300">
                                {s.nom?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            {editId === s.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input className="Input h-8 text-xs flex-1" value={editDraft.nom}
                                  onChange={e => setEditDraft(d => ({ ...d, nom: e.target.value }))} />
                                <select className="Input h-8 text-xs w-36" value={editDraft.poste}
                                  onChange={e => setEditDraft(d => ({ ...d, poste: e.target.value }))}>
                                  {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
                                </select>
                                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-neutral-400 shrink-0">
                                  <input type="checkbox" className="h-3.5 w-3.5" checked={!!editDraft.actif}
                                    onChange={e => setEditDraft(d => ({ ...d, actif: e.target.checked }))} />
                                  Actif
                                </label>
                                <button onClick={() => saveEdit(s)}
                                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">OK</button>
                                <button onClick={() => setEditId(null)}
                                  className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">✕</button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 dark:text-white">{s.nom}</p>
                                  <p className="text-[11px] text-gray-400 dark:text-neutral-500">{STAFF_POSTE_LABELS[s.poste] || s.poste}</p>
                                </div>
                                {!s.actif && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">Inactif</span>
                                )}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => startEdit(s)}
                                    className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button onClick={() => removeMember(s)}
                                    className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors">
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
            </>
          )}
        </div>
      </main>
    </div>
  )
}
