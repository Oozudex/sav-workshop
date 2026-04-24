import { useEffect, useState, useMemo, useRef } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, getDocs,
} from 'firebase/firestore'
import { GLOBAL_ROLES } from '../lib/constants'

const STATUS = {
  pending: { label: 'En attente', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  accepted: { label: 'Accepté', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  refused: { label: 'Refusé', bg: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── TransfertForm ────────────────────────────────────────────────────────── */
function TransfertForm({ onSubmit, onClose, fromMagasinId, fromMagasinNom, magasins, acheteurMode }) {
  const [form, setForm] = useState({
    modele: '', taille: '', couleur: '', codeChrono: '', quantite: 1,
    toMagasinId: '', fromMagasinIdAcheteur: '', commentaire: '',
  })
  const [saving, setSaving] = useState(false)

  const toMagasins = acheteurMode
    ? magasins.filter(m => m.id !== form.fromMagasinIdAcheteur)
    : magasins.filter(m => m.id !== fromMagasinId)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const effectiveFromId = acheteurMode ? form.fromMagasinIdAcheteur : fromMagasinId
    const effectiveFromNom = acheteurMode
      ? magasins.find(m => m.id === form.fromMagasinIdAcheteur)?.nom || ''
      : fromMagasinNom
    if (!form.modele.trim() || !form.toMagasinId || !effectiveFromId) return
    setSaving(true)
    try {
      const toMagasin = magasins.find(m => m.id === form.toMagasinId)
      await onSubmit({
        modele: form.modele.trim(),
        taille: form.taille.trim() || null,
        couleur: form.couleur.trim() || null,
        codeChrono: form.codeChrono.trim() || null,
        quantite: parseInt(form.quantite) || 1,
        commentaire: form.commentaire.trim() || null,
        toMagasinId: form.toMagasinId,
        toMagasinNom: toMagasin?.nom || '',
        fromMagasinId: effectiveFromId,
        fromMagasinNom: effectiveFromNom,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const canSubmit = form.modele.trim() && form.toMagasinId && (acheteurMode ? form.fromMagasinIdAcheteur : true)

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {acheteurMode ? 'Créer un transfert' : 'Nouvelle demande de transfert'}
          </span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {acheteurMode && (
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasin envoyeur *</span>
              <select className="Input h-11 text-sm" value={form.fromMagasinIdAcheteur} onChange={e => setF('fromMagasinIdAcheteur', e.target.value)} required>
                <option value="">— Sélectionner le magasin qui envoie</option>
                {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
              {acheteurMode ? 'Magasin receveur *' : 'Magasin demandé *'}
            </span>
            <select className="Input h-11 text-sm" value={form.toMagasinId} onChange={e => setF('toMagasinId', e.target.value)} required>
              <option value="">— Sélectionner {acheteurMode ? 'le magasin qui reçoit' : 'un magasin'}</option>
              {toMagasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Modèle *</span>
            <input className="Input h-11 text-sm" value={form.modele} onChange={e => setF('modele', e.target.value)} placeholder="Ex : SUMMIT 700" required autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Taille *</span>
              <input className="Input h-11 text-sm" value={form.taille} onChange={e => setF('taille', e.target.value)} placeholder="Ex : L, XL, 54 cm…" required />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur *</span>
              <input className="Input h-11 text-sm" value={form.couleur} onChange={e => setF('couleur', e.target.value)} placeholder="Ex : Noir / Bleu" required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Code chrono *</span>
              <input className="Input h-11 text-sm font-mono tracking-wide" value={form.codeChrono} onChange={e => setF('codeChrono', e.target.value)} placeholder="0-284803" required />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Quantité</span>
              <input type="number" min="1" max="99" className="Input h-11 text-sm" value={form.quantite} onChange={e => setF('quantite', e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Commentaire</span>
            <textarea className="Input resize-none h-20 text-sm leading-relaxed" placeholder="Informations supplémentaires, urgence, client en attente…" value={form.commentaire} onChange={e => setF('commentaire', e.target.value)} />
          </label>
          {acheteurMode && (
            <div className="rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 px-4 py-3">
              <p className="text-xs text-violet-700 dark:text-violet-300">
                Les deux magasins recevront une notification pour ce transfert.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
            <button type="submit" disabled={saving || !canSubmit}
              className="h-9 px-5 rounded-lg text-xs font-semibold disabled:opacity-50 bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              {saving ? 'Envoi…' : acheteurMode ? 'Créer le transfert' : 'Envoyer la demande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── ReponseModal ─────────────────────────────────────────────────────────── */
function ReponseModal({ transfert: t, onClose, onReponse }) {
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)
  const [conformiteAccepted, setConformiteAccepted] = useState(false)

  async function submit(status) {
    setSaving(true)
    try { await onReponse(t.id, status, commentaire.trim() || null); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Répondre à la demande</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.modele}</p>
            {(t.taille || t.couleur || t.codeChrono) && (
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                {[t.taille, t.couleur, t.codeChrono].filter(Boolean).join(' · ')}
                {t.quantite > 1 && ` · ×${t.quantite}`}
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-neutral-500">
              Demandé par <span className="font-semibold text-gray-700 dark:text-neutral-300">{t.fromMagasinNom}</span>
            </p>
            {t.commentaire && (
              <p className="text-xs text-gray-400 dark:text-neutral-500 italic border-l-2 border-gray-200 dark:border-neutral-700 pl-2 mt-1">{t.commentaire}</p>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Commentaire</span>
            <textarea className="Input resize-none h-20 text-sm leading-relaxed"
              placeholder="Ex : Le vélo est disponible, il sera envoyé lundi…"
              value={commentaire} onChange={e => setCommentaire(e.target.value)} />
          </label>

          {/* Case conformité — obligatoire pour accepter */}
          <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-gray-200 dark:border-neutral-700 p-3 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
            <input
              type="checkbox"
              checked={conformiteAccepted}
              onChange={e => setConformiteAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-teal-600"
            />
            <span className="text-xs text-gray-600 dark:text-neutral-400 leading-relaxed">
              Je m'engage à la conformité du transfert : le vélo est correctement protégé et tous les accessoires sont inclus dans l'envoi.
            </span>
          </label>
          {!conformiteAccepted && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center -mt-2">
              Cochez la case ci-dessus pour pouvoir accepter le transfert.
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={() => submit('refused')} disabled={saving}
              className="flex-1 h-10 rounded-xl text-sm font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors">
              ✕ Refuser
            </button>
            <button onClick={() => submit('accepted')} disabled={saving || !conformiteAccepted}
              className="flex-1 h-10 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              ✓ Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── TransfertCard ────────────────────────────────────────────────────────── */
function TransfertCard({ t, canRespond, canVeloArrive, canValidateRefus, isUnread, onReponse, onVeloArrive, onValidateRefus }) {
  const s = STATUS[t.status] || STATUS.pending

  return (
    <div className={[
      'bg-white dark:bg-neutral-900 rounded-xl border p-4 space-y-3 transition-all',
      isUnread
        ? 'border-teal-300 dark:border-teal-500/50 shadow-sm shadow-teal-100 dark:shadow-teal-500/10'
        : 'border-gray-200 dark:border-neutral-800',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
            )}
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.modele}</p>
            {t.quantite > 1 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">×{t.quantite}</span>
            )}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg}`}>{s.label}</span>
            {t.createdByAcheteur && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                Acheteur
              </span>
            )}
          </div>
          {(t.taille || t.couleur || t.codeChrono) && (
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
              {[t.taille, t.couleur, t.codeChrono].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-neutral-500 shrink-0">{fmtDate(t.createdAt)}</p>
      </div>

      {/* Notification acheteur */}
      {t.createdByAcheteur && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 px-3 py-2">
          <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
            Transfert initié par l'acheteur
          </p>
        </div>
      )}

      {/* Trajet */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-gray-700 dark:text-neutral-200">{t.fromMagasinNom}</span>
        <svg className="h-3.5 w-3.5 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <span className="font-medium text-gray-700 dark:text-neutral-200">{t.toMagasinNom}</span>
      </div>

      {t.commentaire && (
        <p className="text-xs text-gray-400 dark:text-neutral-500 italic border-l-2 border-gray-200 dark:border-neutral-700 pl-2">{t.commentaire}</p>
      )}

      {t.reponseCommentaire && (
        <div className="rounded-lg bg-gray-50 dark:bg-neutral-800 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Réponse</p>
          <p className="text-xs text-gray-600 dark:text-neutral-300">{t.reponseCommentaire}</p>
        </div>
      )}

      {/* Actions */}
      {canRespond && t.status === 'pending' && (
        <button onClick={() => onReponse(t)}
          className="w-full h-8 rounded-lg text-xs font-semibold border border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-500/30 dark:text-teal-400 dark:hover:bg-teal-500/10 transition-colors">
          Répondre à cette demande
        </button>
      )}

      {canVeloArrive && (
        <button onClick={() => onVeloArrive(t)}
          className="w-full h-8 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          ✓ Vélo arrivé — clôturer le transfert
        </button>
      )}

      {canValidateRefus && t.status === 'refused' && (
        <button onClick={() => onValidateRefus(t)}
          className="w-full h-8 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
          ✓ Valider le refus — supprimer la demande
        </button>
      )}
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function Transfert() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const isAcheteur = profile?.role === 'acheteur'

  const canCreate = profile?.role === 'velo' || isAcheteur

  const [tab, setTab] = useState(isGlobal ? 'toutes' : 'recues')
  const [transferts, setTransferts] = useState([])
  const [magasins, setMagasins] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [activeReponse, setActiveReponse] = useState(null)

  const prevTab = useRef(tab)
  useEffect(() => {
    if (tab === 'envoyees' && prevTab.current !== 'envoyees') {
      const unread = envoyees.filter(t => t.readByFrom === false)
      if (unread.length > 0) {
        Promise.all(unread.map(t => updateDoc(doc(db, 'transferts', t.id), { readByFrom: true })))
      }
    }
    if (tab === 'recues' && prevTab.current !== 'recues') {
      const unread = recues.filter(t => t.readByTo === false)
      if (unread.length > 0) {
        Promise.all(unread.map(t => updateDoc(doc(db, 'transferts', t.id), { readByTo: true })))
      }
    }
    prevTab.current = tab
  })

  useEffect(() => {
    getDocs(collection(db, 'magasins')).then(snap => {
      setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    if (!profile) return
    const q = query(collection(db, 'transferts'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setTransferts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [profile])

  const recues = useMemo(() => transferts.filter(t => t.toMagasinId === effectiveMagasinId), [transferts, effectiveMagasinId])
  const envoyees = useMemo(() => transferts.filter(t => t.fromMagasinId === effectiveMagasinId), [transferts, effectiveMagasinId])

  const pendingRecues = recues.filter(t => t.status === 'pending').length
  // Notifs non lues pour le magasin receveur (transferts acheteur)
  const unreadRecues = recues.filter(t => t.readByTo === false).length
  // Réponses non lues pour le magasin envoyeur
  const unreadResponses = envoyees.filter(t => t.readByFrom === false && t.status !== 'pending').length
  // Nouveaux transferts acheteur non lus pour le magasin envoyeur
  const unreadAcheteurEnvoyees = envoyees.filter(t => t.readByFrom === false && t.createdByAcheteur === true && t.status === 'pending').length

  const magasinNom = magasins.find(m => m.id === effectiveMagasinId)?.nom || ''

  async function handleCreate(data) {
    const docData = {
      ...data,
      type: 'velo',
      status: 'pending',
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    if (isAcheteur) {
      docData.createdByAcheteur = true
      docData.readByFrom = false
      docData.readByTo = false
    } else {
      docData.readByFrom = true
    }
    await addDoc(collection(db, 'transferts'), docData)
  }

  async function handleReponse(id, status, commentaire) {
    await updateDoc(doc(db, 'transferts', id), {
      status,
      reponseCommentaire: commentaire ?? null,
      respondedBy: user.uid,
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      readByFrom: false,
    })
  }

  async function handleVeloArrive(t) {
    if (!confirm(`Confirmer la réception du "${t.modele}" ? Le transfert sera supprimé.`)) return
    await deleteDoc(doc(db, 'transferts', t.id))
  }

  async function handleValidateRefus(t) {
    if (!confirm(`Valider le refus et supprimer la demande pour "${t.modele}" ?`)) return
    await deleteDoc(doc(db, 'transferts', t.id))
  }

  function canRespondToTransfert(t) {
    return profile?.role === 'velo' && t.toMagasinId === effectiveMagasinId
  }

  function canVeloArrive(t) {
    return profile?.role === 'velo' && t.fromMagasinId === effectiveMagasinId && t.status === 'accepted'
  }

  function canValidateRefus(t) {
    return t.fromMagasinId === effectiveMagasinId && t.status === 'refused'
  }

  const tabs = [
    ...(isGlobal
      ? [{ key: 'toutes', label: 'Tous les transferts', badge: 0 }]
      : []
    ),
    { key: 'recues', label: 'Reçues', badge: pendingRecues },
    { key: 'envoyees', label: 'Envoyées', badge: unreadResponses + unreadAcheteurEnvoyees },
  ]

  const displayed = tab === 'toutes' ? transferts : tab === 'recues' ? recues : envoyees

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Transferts vélo</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Demandes de transfert de vélos entre magasins</p>
            </div>
            {canCreate && (isAcheteur || effectiveMagasinId) && (
              <button onClick={() => setShowForm(true)}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                + {isAcheteur ? 'Créer un transfert' : 'Nouvelle demande'}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={['h-9 px-4 text-xs font-semibold border-b-2 transition-colors',
                  tab === t.key
                    ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                {t.label}
                {t.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-bold">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {isGlobal && tab === 'toutes' && transferts.length > 0 && (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">
              {transferts.length} transfert{transferts.length > 1 ? 's' : ''} au total — lecture seule
            </p>
          )}

          {/* Bannière réponses non lues (envoyées) */}
          {tab === 'envoyees' && unreadResponses > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30">
              <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
              <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                {unreadResponses} réponse{unreadResponses > 1 ? 's' : ''} à consulter
              </p>
            </div>
          )}

          {/* Bannière transferts acheteur non lus (envoyées) */}
          {tab === 'envoyees' && unreadAcheteurEnvoyees > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30">
              <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
              <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                {unreadAcheteurEnvoyees} transfert{unreadAcheteurEnvoyees > 1 ? 's' : ''} initié{unreadAcheteurEnvoyees > 1 ? 's' : ''} par l'acheteur — des vélos sont à envoyer
              </p>
            </div>
          )}

          {/* Bannière transferts acheteur non lus (reçues) */}
          {tab === 'recues' && unreadRecues > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30">
              <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
              <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                {unreadRecues} transfert{unreadRecues > 1 ? 's' : ''} initié{unreadRecues > 1 ? 's' : ''} par l'acheteur — des vélos sont attendus
              </p>
            </div>
          )}

          {/* Liste */}
          {displayed.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
              {tab === 'recues' ? 'Aucune demande reçue.' : tab === 'envoyees' ? 'Aucune demande envoyée.' : 'Aucun transfert.'}
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map(t => (
                <TransfertCard
                  key={t.id}
                  t={t}
                  canRespond={canRespondToTransfert(t)}
                  canVeloArrive={canVeloArrive(t)}
                  canValidateRefus={canValidateRefus(t)}
                  isUnread={
                    (t.fromMagasinId === effectiveMagasinId && t.readByFrom === false) ||
                    (t.toMagasinId === effectiveMagasinId && t.readByTo === false)
                  }
                  onReponse={setActiveReponse}
                  onVeloArrive={handleVeloArrive}
                  onValidateRefus={handleValidateRefus}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <TransfertForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
          fromMagasinId={effectiveMagasinId}
          fromMagasinNom={magasinNom}
          magasins={magasins}
          acheteurMode={isAcheteur}
        />
      )}

      {activeReponse && (
        <ReponseModal
          transfert={activeReponse}
          onClose={() => setActiveReponse(null)}
          onReponse={handleReponse}
        />
      )}
    </div>
  )
}
