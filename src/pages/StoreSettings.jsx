import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, setDoc, where,
} from 'firebase/firestore'
import { getApp, getApps, initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth'
import { STAFF_POSTES, STAFF_POSTE_LABELS, GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS, DIRECTION_ROLES } from '../lib/constants'
import { useMagasin } from '../store/useMagasin'
import { randomPassword } from '../lib/security'

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
    const tempPwd = randomPassword()
    const cred = await createUserWithEmailAndPassword(secAuth, email, tempPwd)
    await updateProfile(cred.user, { displayName })
    return cred.user.uid
  } finally {
    if (secApp) { try { await deleteApp(secApp) } catch {} }
  }
}

// E-mail pour choisir (ou rechoisir) son mot de passe. Renvoie null si l'envoi est parti, sinon la raison.
const MAIL_ERRORS = {
  'auth/too-many-requests': 'trop d’envois rapprochés, réessaie dans quelques minutes',
  'auth/user-not-found': 'aucun compte de connexion avec cette adresse',
  'auth/invalid-email': 'adresse e-mail invalide',
  'auth/network-request-failed': 'pas de connexion internet',
}
async function sendSetupEmail(email) {
  try {
    await sendPasswordResetEmail(getAuth(), email)
    return null
  } catch (err) {
    return MAIL_ERRORS[err.code] || err.message || 'erreur inconnue'
  }
}
const MAIL_HINT = 'S’il n’arrive pas d’ici quelques minutes : vérifier les spams / la quarantaine, puis « Renvoyer l’e-mail » (icône enveloppe).'

// Bouton « Renvoyer l'e-mail » d'un compte
function ResendButton({ email }) {
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')
  async function send() {
    if (!email || state === 'sending') return
    setState('sending')
    const err = await sendSetupEmail(email)
    setError(err || '')
    setState(err ? 'error' : 'sent')
    setTimeout(() => setState('idle'), err ? 6000 : 3000)
  }
  const title = state === 'sent' ? `E-mail envoyé à ${email}`
    : state === 'error' ? `Échec : ${error}` : `Renvoyer l’e-mail de mot de passe à ${email}`
  return (
    <button onClick={send} disabled={!email || state === 'sending'} title={title} aria-label={title}
      className={['h-7 min-w-7 px-1.5 inline-flex items-center justify-center gap-1 rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-50',
        state === 'sent' ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
          : state === 'error' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800'].join(' ')}>
      {state === 'sent' ? '✓ Envoyé' : state === 'error' ? 'Échec' : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      )}
    </button>
  )
}

/* ── Comptes de direction (administrateurs uniquement) ───────────────────── */
const DIRECTION_LABELS = { admin: 'Administrateur', directeurgen: 'Directeur général' }
const DIRECTION_HINTS = {
  admin: 'Tous les droits, dont la création des comptes de direction.',
  directeurgen: 'Voit tous les magasins, gère magasins, acheteurs et directeurs de magasin.',
}

function DirectionSection({ me }) {
  const [comptes, setComptes] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ nom: '', email: '', role: 'directeurgen' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({})

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', 'in', DIRECTION_ROLES))
    return onSnapshot(q, snap => setComptes(snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.role === b.role ? (a.displayName || '').localeCompare(b.displayName || '') : a.role === 'admin' ? -1 : 1))))
  }, [])

  async function create(e) {
    e.preventDefault()
    setErr(null); setMsg(null)
    if (!form.nom.trim()) return setErr('Le nom est requis')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErr('Email invalide')
    setLoading(true)
    try {
      const email = form.email.trim()
      const uid = await createAuthAccount(email, form.nom.trim())
      await setDoc(doc(db, 'users', uid), {
        displayName: form.nom.trim(),
        email,
        role: form.role,
        magasinId: null,
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: me,
      })
      const mailErr = await sendSetupEmail(email)
      if (mailErr) setErr(`${DIRECTION_LABELS[form.role]} créé, mais l’e-mail n’est pas parti (${mailErr}). Utilise « Renvoyer l’e-mail ».`)
      else setMsg(`${DIRECTION_LABELS[form.role]} créé · e-mail pour choisir le mot de passe envoyé à ${email}. ${MAIL_HINT}`)
      setForm({ nom: '', email: '', role: 'directeurgen' })
      setShowNew(false)
    } catch (error) {
      const map = { 'auth/email-already-in-use': 'Cet email existe déjà.', 'auth/invalid-email': 'Email invalide.' }
      setErr(map[error.code] || error.message)
    } finally {
      setLoading(false)
    }
  }

  async function save(c) {
    const role = c.id === me ? c.role : draft.role // on ne change pas son propre rôle
    const others = comptes.filter(x => x.id !== c.id && x.role === 'admin' && x.isActive !== false)
    if (c.role === 'admin' && role !== 'admin' && others.length === 0) return setErr('Il doit rester au moins un administrateur.')
    await updateDoc(doc(db, 'users', c.id), {
      displayName: draft.displayName?.trim() || c.displayName,
      role,
      updatedAt: serverTimestamp(),
    })
    setEditId(null)
  }

  async function remove(c) {
    if (c.id === me) return
    if (!confirm(`Supprimer le compte de ${c.displayName} (${DIRECTION_LABELS[c.role]}) ? Il n'aura plus accès à l'outil.`)) return
    await deleteDoc(doc(db, 'users', c.id))
  }

  const iconBtn = 'h-7 w-7 grid place-items-center rounded-lg text-gray-400 transition-colors'

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-900 dark:bg-white" />
          <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Direction</span>
          <span className="text-[10px] text-gray-400 dark:text-neutral-500 normal-case truncate">· visible des administrateurs uniquement</span>
        </div>
        <button onClick={() => { setShowNew(v => !v); setErr(null); setMsg(null) }}
          className="shrink-0 h-6 px-2.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
          + Nouveau compte
        </button>
      </div>
      <div className="p-4 space-y-4">
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{err}</p>}
        {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{msg}</p>}

        {showNew && (
          <form onSubmit={create} className="p-3 rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                <input className="Input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Prénom Nom" autoFocus />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                <input type="email" className="Input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="prenom.nom@exemple.com" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {['directeurgen', 'admin'].map(r => (
                <label key={r} className={['flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors',
                  form.role === r ? 'border-gray-900 dark:border-white bg-white dark:bg-neutral-900' : 'border-gray-200 dark:border-neutral-700'].join(' ')}>
                  <input type="radio" name="direction-role" className="mt-0.5 accent-gray-900 dark:accent-white" checked={form.role === r} onChange={() => setForm(f => ({ ...f, role: r }))} />
                  <span>
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">{DIRECTION_LABELS[r]}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">{DIRECTION_HINTS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-neutral-400">La personne reçoit un email pour choisir son mot de passe.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)}
                className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">
                Annuler
              </button>
              <button type="submit" disabled={loading || !form.nom.trim() || !form.email.trim()}
                className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                {loading ? 'Création…' : 'Créer le compte'}
              </button>
            </div>
          </form>
        )}

        {comptes.length > 0 && (
          <div className="border border-gray-100 dark:border-neutral-800 rounded-xl overflow-hidden">
            {comptes.map(c => (
              <div key={c.id} className="flex items-start gap-3 px-3 py-2.5 border-b last:border-0 border-gray-100 dark:border-neutral-800">
                <div className={`h-7 w-7 rounded-full grid place-items-center shrink-0 mt-0.5 ${c.role === 'admin' ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                  <span className="text-[10px] font-semibold">{c.displayName?.[0]?.toUpperCase() || '?'}</span>
                </div>
                {editId === c.id ? (
                  <div className="flex-1 min-w-0 space-y-2">
                    <input className="Input h-8 text-xs w-full" value={draft.displayName ?? ''}
                      onChange={e => setDraft(v => ({ ...v, displayName: e.target.value }))} />
                    {c.id !== me && (
                      <select className="Input h-8 text-xs" value={draft.role} onChange={e => setDraft(v => ({ ...v, role: e.target.value }))}>
                        <option value="directeurgen">Directeur général</option>
                        <option value="admin">Administrateur</option>
                      </select>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => save(c)}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">OK</button>
                      <button onClick={() => setEditId(null)}
                        className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{c.displayName || '—'}</p>
                        <span className={`h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold ${c.role === 'admin' ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                          {DIRECTION_LABELS[c.role]}
                        </span>
                        {c.id === me && <span className="text-[10px] font-semibold text-gray-400">· vous</span>}
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-neutral-500 break-all">{c.email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <ResendButton email={c.email} />
                      <button aria-label={`Modifier ${c.displayName}`}
                        onClick={() => { setEditId(c.id); setDraft({ displayName: c.displayName, role: c.role }); setErr(null) }}
                        className={`${iconBtn} hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800`}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {c.id !== me && (
                        <button aria-label={`Supprimer ${c.displayName}`} onClick={() => remove(c)}
                          className={`${iconBtn} hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10`}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StoreSettings() {
  const { user, profile, refreshProfile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile, refreshProfile: s.refreshProfile })))
  const isGlobal        = GLOBAL_ROLES.includes(profile?.role)
  const isDirecteurGen  = profile?.role === 'directeurgen'
  const isDirecteurMag  = profile?.role === 'directeurmag'
  const canManageRayons = isGlobal || isDirecteurMag
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

  // Nouveau directeur magasin (toggle)
  const [showNewDirMag, setShowNewDirMag] = useState(false)

  // Onglet admin (directeurgen uniquement)
  const [adminTab, setAdminTab] = useState('magasins') // 'magasins' | 'personnel'

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
      const mailErr = await sendSetupEmail(acheteurEmail.trim())
      if (mailErr) setAcheteurErr(`Acheteur créé, mais l’e-mail n’est pas parti (${mailErr}). Utilise « Renvoyer l’e-mail ».`)
      else setAcheteurMsg(`Acheteur créé · e-mail pour choisir le mot de passe envoyé à ${acheteurEmail.trim()}. ${MAIL_HINT}`)
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
      if (isDirecteurMag) {
        await updateDoc(doc(db, 'users', user.uid), { magasinId: ref.id })
        await refreshProfile(user.uid)
      } else {
        setGlobalSelectedId(ref.id)
      }
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
      const mailErr = await sendSetupEmail(newRayonEmail.trim())
      if (mailErr) setRayonErr(`Rayon créé, mais l’e-mail n’est pas parti (${mailErr}). Utilise « Renvoyer l’e-mail ».`)
      else setRayonMsg(`Rayon créé · e-mail pour choisir le mot de passe envoyé à ${newRayonEmail.trim()}. ${MAIL_HINT}`)
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
      const mailErr = await sendSetupEmail(dmEmail.trim())
      if (mailErr) setDmErr(`Compte créé, mais l’e-mail n’est pas parti (${mailErr}). Utilise « Renvoyer l’e-mail ».`)
      else setDmMsg(`Compte créé · e-mail pour choisir le mot de passe envoyé à ${dmEmail.trim()}. ${MAIL_HINT}`)
      setDmName(''); setDmEmail(''); setDmMagasinId('')
      setShowNewDirMag(false)
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
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Header */}
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-neutral-800 grid place-items-center shrink-0">
              <svg className="h-6 w-6 text-gray-600 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {isDirecteurGen ? 'Administration' : 'Paramètres magasin'}
              </h1>
              <p className="text-sm text-gray-400 dark:text-neutral-500 mt-0.5">
                {isDirecteurGen
                  ? `${magasins.length} magasin${magasins.length > 1 ? 's' : ''} · ${acheteurs.length} acheteur${acheteurs.length > 1 ? 's' : ''} · ${directeurs.length} directeur${directeurs.length > 1 ? 's' : ''}`
                  : magasinInfo?.nom ?? 'Gestion des rayons et de l\'équipe'}
              </p>
            </div>
          </div>

          {/* Tabs (directeurgen uniquement) */}
          {isDirecteurGen && (
            <div className="flex gap-1 border-b border-gray-200 dark:border-neutral-800">
              {[
                { key: 'magasins',  label: 'Magasins',  count: magasins.length },
                { key: 'personnel', label: 'Personnel',  count: acheteurs.length + directeurs.length },
              ].map(t => (
                <button key={t.key} onClick={() => setAdminTab(t.key)}
                  className={[
                    'h-9 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                    adminTab === t.key
                      ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                  ].join(' ')}>
                  {t.label}
                  {t.count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Direction — onglet Personnel, administrateurs uniquement */}
          {profile?.isAdmin && adminTab === 'personnel' && <DirectionSection me={user.uid} />}

          {/* Acheteurs — onglet Personnel */}
          {isDirecteurGen && adminTab === 'personnel' && (
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
                              <ResendButton email={a.email} />
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

          {/* Directeurs de magasin — onglet Personnel */}
          {isDirecteurGen && adminTab === 'personnel' && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Directeurs de magasin</span>
                </div>
                <button
                  onClick={() => { setShowNewDirMag(v => !v); setDmErr(null); setDmMsg(null) }}
                  className="h-6 px-2.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                  + Nouveau directeur
                </button>
              </div>
              <div className="p-4 space-y-4">
                {dmErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{dmErr}</p>}
                {dmMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20">{dmMsg}</p>}
                {showNewDirMag && (
                <form onSubmit={createDirecteurmag} className="p-3 rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/30 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
                      <input className="Input" value={dmName} onChange={e => setDmName(e.target.value)} placeholder="Prénom Nom" autoFocus />
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
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowNewDirMag(false)}
                      className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-neutral-400">
                      Annuler
                    </button>
                    <button type="submit" disabled={dmLoading}
                      className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                      {dmLoading ? 'Création…' : 'Créer'}
                    </button>
                  </div>
                </form>
                )}
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
                                <ResendButton email={d.email} />
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

          {/* Sélecteur de magasin — onglet Magasins */}
          {(!isDirecteurGen || adminTab === 'magasins') && isGlobal && (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">Magasins</span>
                </div>
                {isDirecteurGen && (
                  <button
                    onClick={() => setShowNewMagasin(v => !v)}
                    className="h-6 px-2.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                    + Nouveau magasin
                  </button>
                )}
              </div>
              <div className="p-4">
                {magasins.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-neutral-500 text-center py-2">Aucun magasin créé.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {magasins.map(m => (
                      <button key={m.id} onClick={() => setGlobalSelectedId(m.id)}
                        className={[
                          'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                          globalSelectedId === m.id
                            ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                            : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600',
                        ].join(' ')}>
                        <span className={[
                          'h-8 w-8 rounded-lg grid place-items-center shrink-0 text-sm font-bold',
                          globalSelectedId === m.id
                            ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                            : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400',
                        ].join(' ')}>
                          {m.nom[0]?.toUpperCase()}
                        </span>
                        <span className={[
                          'text-sm font-medium',
                          globalSelectedId === m.id ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white',
                        ].join(' ')}>
                          {m.nom}
                        </span>
                        {globalSelectedId === m.id && (
                          <svg className="h-4 w-4 text-white dark:text-black ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
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

          {(!isDirecteurGen || adminTab === 'magasins') && (!magasinId ? (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-8">
              {isDirecteurMag ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Créer votre magasin</p>
                    <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">Aucun magasin n'est encore lié à votre compte. Créez-en un pour commencer.</p>
                  </div>
                  {newMagasinErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">{newMagasinErr}</p>}
                  <form onSubmit={createMagasin} className="flex gap-2 max-w-sm mx-auto">
                    <input className="Input h-9 text-xs flex-1" placeholder="Nom du magasin"
                      value={newMagasinNom} onChange={e => setNewMagasinNom(e.target.value)} autoFocus />
                    <button type="submit" disabled={newMagasinLoading || !newMagasinNom.trim()}
                      className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 shrink-0">
                      {newMagasinLoading ? 'Création…' : 'Créer'}
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-neutral-500 text-center">
                  {isGlobal ? 'Crée ou sélectionne un magasin.' : 'Aucun magasin associé à votre compte.'}
                </p>
              )}
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
                                  {r.email && <ResendButton email={r.email} />}
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
          ))}

        </div>
      </main>
    </div>
  )
}
