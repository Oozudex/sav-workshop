import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, getDocs,
} from 'firebase/firestore'
import { GLOBAL_ROLES } from '../lib/constants'
import {
  TRANSFER_STATUS, TRANSFER_STEPS, myTransferRole, otherReadField, readField,
  transferNextStep, transferProgress, transferSides, transferStatus,
} from '../lib/transferts'

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const LABEL = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'
const HELP_KEY = 'transferts.aideMasquee'

function getTs(ts) {
  if (!ts) return null
  if (ts.toDate) return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function fmtDate(ts) {
  const d = getTs(ts)
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtShort(ts) {
  const d = getTs(ts)
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null
}

const details = t => [t.taille, t.couleur, t.codeChrono].filter(Boolean).join(' · ')

/* ── Petits éléments communs ─────────────────────────────────────────────────── */
function BikeIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="16" r="3.5" /><circle cx="18.5" cy="16" r="3.5" />
      <path d="M5.5 16l4-8h6l3 8M9.5 8L12 16h-6.5M15.5 8l-1.5-3h-2.5" />
    </svg>
  )
}

function StatusPill({ t }) {
  const s = TRANSFER_STATUS[transferStatus(t)]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${s.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  )
}

function CloseBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  )
}

function Modal({ title, onClose, children, size = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className={`w-full ${size} rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl`}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <CloseBtn onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

// Trajet du vélo : magasin qui envoie → magasin qui reçoit (« vous » mis en avant)
function Route({ senderNom, receiverNom, me }) {
  const side = (label, nom, isMe, right) => (
    <div className={`min-w-0 ${right ? 'text-right' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-neutral-500">{label}</p>
      <p className={`text-sm font-semibold truncate ${nom ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-neutral-600'}`}>
        {nom || 'À choisir'}
      </p>
      {isMe && <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-px rounded bg-gray-900 text-white dark:bg-white dark:text-black">VOUS</span>}
    </div>
  )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-gray-50 dark:bg-neutral-800/50 px-3 py-2.5">
      {side('Envoie le vélo', senderNom, me === 'sender', false)}
      <div className="flex items-center gap-1 text-gray-400 dark:text-neutral-500" aria-hidden>
        <BikeIcon className="h-5 w-5" />
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
      </div>
      {side('Reçoit le vélo', receiverNom, me === 'receiver', true)}
    </div>
  )
}

// Frise des 4 étapes avec leur date
function Steps({ t }) {
  const done = transferProgress(t)
  const refused = transferStatus(t) === 'refused'
  const dates = [t.createdAt, t.respondedAt, t.shippedAt, t.completedAt]
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Avancement du transfert">
      {TRANSFER_STEPS.map((st, i) => {
        const failed = refused && i === 1
        const ok = i < done && !failed
        return (
          <li key={st.key} className="min-w-0 space-y-1" aria-current={i === done ? 'step' : undefined}>
            <span className={`block h-1 rounded-full ${failed ? 'bg-red-500' : ok ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-neutral-700'}`} />
            <p className={`text-[10px] font-semibold truncate ${failed ? 'text-red-600 dark:text-red-400' : ok ? 'text-gray-700 dark:text-neutral-200' : 'text-gray-400 dark:text-neutral-500'}`}>
              {failed ? 'Refusé' : st.label}
            </p>
            {(ok || failed) && fmtShort(dates[i]) && <p className="text-[10px] text-gray-400 dark:text-neutral-500 -mt-0.5">{fmtShort(dates[i])}</p>}
          </li>
        )
      })}
    </ol>
  )
}

/* ── Comment ça marche ───────────────────────────────────────────────────────── */
function HowItWorks({ onHide }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Comment se passe un transfert ?</p>
        <button onClick={onHide} className="text-[11px] font-medium text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200">Masquer</button>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3">
        {TRANSFER_STEPS.map((st, i) => (
          <li key={st.key} className="flex sm:flex-col gap-2.5 sm:gap-1.5">
            <span className="h-6 w-6 shrink-0 grid place-items-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-black text-[11px] font-bold">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{st.label}</p>
              <p className="text-[11px] leading-snug text-gray-500 dark:text-neutral-400">{st.help}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ── TransfertForm ────────────────────────────────────────────────────────── */
function TransfertForm({ onSubmit, onClose, fromMagasinId, fromMagasinNom, magasins, acheteurMode }) {
  const [form, setForm] = useState({
    modele: '', taille: '', couleur: '', codeChrono: '', quantite: 1,
    toMagasinId: '', fromMagasinIdAcheteur: '', commentaire: '',
  })
  const [saving, setSaving] = useState(false)

  // Vendeur : il choisit le magasin qui a le vélo (to) ; acheteur : envoyeur (from) et receveur (to)
  const senderChoices = acheteurMode ? magasins : magasins.filter(m => m.id !== fromMagasinId)
  const receiverChoices = magasins.filter(m => m.id !== form.fromMagasinIdAcheteur)
  const nom = id => magasins.find(m => m.id === id)?.nom || ''

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const effectiveFromId = acheteurMode ? form.fromMagasinIdAcheteur : fromMagasinId
    const effectiveFromNom = acheteurMode ? nom(form.fromMagasinIdAcheteur) : fromMagasinNom
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSubmit({
        modele: form.modele.trim(),
        taille: form.taille.trim() || null,
        couleur: form.couleur.trim() || null,
        codeChrono: form.codeChrono.trim() || null,
        quantite: parseInt(form.quantite) || 1,
        commentaire: form.commentaire.trim() || null,
        toMagasinId: form.toMagasinId,
        toMagasinNom: nom(form.toMagasinId),
        fromMagasinId: effectiveFromId,
        fromMagasinNom: effectiveFromNom,
      })
      onClose()
    } finally { setSaving(false) }
  }

  const canSubmit = form.modele.trim() && form.taille.trim() && form.couleur.trim() && form.codeChrono.trim()
    && form.toMagasinId && (acheteurMode ? form.fromMagasinIdAcheteur : true)

  return (
    <Modal title={acheteurMode ? 'Organiser un transfert' : 'Demander un vélo à un autre magasin'} onClose={onClose} size="max-w-lg">
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {/* Trajet */}
        <div className="space-y-3">
          {acheteurMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className={LABEL}>Magasin qui envoie *</span>
                <select className="Input h-11 text-sm" value={form.fromMagasinIdAcheteur} onChange={e => setF('fromMagasinIdAcheteur', e.target.value)} required>
                  <option value="">— Choisir</option>
                  {senderChoices.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className={LABEL}>Magasin qui reçoit *</span>
                <select className="Input h-11 text-sm" value={form.toMagasinId} onChange={e => setF('toMagasinId', e.target.value)} required>
                  <option value="">— Choisir</option>
                  {receiverChoices.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className={LABEL}>Magasin qui a le vélo *</span>
              <select className="Input h-11 text-sm" value={form.toMagasinId} onChange={e => setF('toMagasinId', e.target.value)} required>
                <option value="">— Choisir le magasin à qui le demander</option>
                {senderChoices.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
          )}
          <Route
            senderNom={acheteurMode ? nom(form.fromMagasinIdAcheteur) : nom(form.toMagasinId)}
            receiverNom={acheteurMode ? nom(form.toMagasinId) : fromMagasinNom}
            me={acheteurMode ? null : 'receiver'} />
        </div>

        <label className="block space-y-1.5">
          <span className={LABEL}>Modèle *</span>
          <input className="Input h-11 text-sm" value={form.modele} onChange={e => setF('modele', e.target.value)} placeholder="Ex. SUMMIT 700" required autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className={LABEL}>Taille *</span>
            <input className="Input h-11 text-sm" value={form.taille} onChange={e => setF('taille', e.target.value)} placeholder="Ex. L, 54 cm" required />
          </label>
          <label className="space-y-1.5">
            <span className={LABEL}>Couleur *</span>
            <input className="Input h-11 text-sm" value={form.couleur} onChange={e => setF('couleur', e.target.value)} placeholder="Ex. Noir / Bleu" required />
          </label>
          <label className="space-y-1.5">
            <span className={LABEL}>Code chrono *</span>
            <input className="Input h-11 text-sm font-mono tracking-wide" value={form.codeChrono} onChange={e => setF('codeChrono', e.target.value)} placeholder="0-284803" required />
          </label>
          <label className="space-y-1.5">
            <span className={LABEL}>Quantité</span>
            <input type="number" min="1" max="99" className="Input h-11 text-sm" value={form.quantite} onChange={e => setF('quantite', e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className={LABEL}>Commentaire</span>
          <textarea className="Input resize-none h-20 text-sm leading-relaxed" placeholder="Client en attente, urgence, précisions…" value={form.commentaire} onChange={e => setF('commentaire', e.target.value)} />
        </label>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          {acheteurMode
            ? 'Les deux magasins sont prévenus. Le magasin qui envoie confirme d’abord qu’il a bien le vélo.'
            : 'Le magasin choisi est prévenu et vous répond. S’il accepte, il vous envoie le vélo.'}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
          <button type="submit" disabled={saving || !canSubmit}
            className="h-9 px-5 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
            {saving ? 'Envoi…' : acheteurMode ? 'Créer le transfert' : 'Envoyer la demande'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Recap({ t }) {
  const s = transferSides(t)
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 p-3.5 space-y-1">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.modele}{t.quantite > 1 && ` ×${t.quantite}`}</p>
      {details(t) && <p className="text-xs text-gray-500 dark:text-neutral-400">{details(t)}</p>}
      <p className="text-xs text-gray-500 dark:text-neutral-400">
        {s.senderNom} → <span className="font-semibold text-gray-700 dark:text-neutral-200">{s.receiverNom}</span>
        {s.byAcheteur && ' · demandé par l’acheteur'}
      </p>
      {t.commentaire && <p className="text-xs text-gray-500 dark:text-neutral-400 italic border-l-2 border-gray-200 dark:border-neutral-700 pl-2 mt-1">{t.commentaire}</p>}
    </div>
  )
}

/* ── Réponse du magasin qui a le vélo ─────────────────────────────────────── */
function ReponseModal({ transfert: t, onClose, onReponse }) {
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(status) {
    if (status === 'refused' && !commentaire.trim()) return
    setSaving(true)
    try { await onReponse(t, status, commentaire.trim() || null); onClose() }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Avez-vous ce vélo ?" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-4">
        <Recap t={t} />
        <label className="block space-y-1.5">
          <span className={LABEL}>Message pour {transferSides(t).receiverNom}</span>
          <textarea className="Input resize-none h-20 text-sm leading-relaxed"
            placeholder="Ex. Disponible, envoi lundi · ou : vendu ce matin, désolé"
            value={commentaire} onChange={e => setCommentaire(e.target.value)} />
          <span className="block text-[11px] text-gray-400 dark:text-neutral-500">Obligatoire pour un refus : expliquez pourquoi.</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => submit('refused')} disabled={saving || !commentaire.trim()}
            title={commentaire.trim() ? '' : 'Écrivez la raison du refus'}
            className="flex-1 h-10 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors">
            Refuser
          </button>
          <button onClick={() => submit('accepted')} disabled={saving}
            className="flex-1 h-10 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
            Accepter
          </button>
        </div>
        <p className="text-[11px] text-center text-gray-400 dark:text-neutral-500">En acceptant, vous vous engagez à envoyer le vélo.</p>
      </div>
    </Modal>
  )
}

/* ── Envoi du vélo ────────────────────────────────────────────────────────── */
function ShipModal({ transfert: t, onClose, onShip }) {
  const [conforme, setConforme] = useState(false)
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true)
    try { await onShip(t); onClose() } finally { setSaving(false) }
  }
  return (
    <Modal title="Marquer le vélo comme envoyé" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-4">
        <Recap t={t} />
        <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-gray-200 dark:border-neutral-700 p-3 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
          <input type="checkbox" checked={conforme} onChange={e => setConforme(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gray-900 dark:accent-white" />
          <span className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">
            Je m’engage à la conformité du transfert : le vélo est correctement protégé et tous les accessoires sont inclus dans l’envoi.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
          <button onClick={submit} disabled={saving || !conforme}
            className="h-9 px-5 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {saving ? 'Enregistrement…' : 'Vélo envoyé'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── TransfertCard ────────────────────────────────────────────────────────── */
const ACTION_LABELS = { respond: 'Répondre', ship: 'Vélo envoyé', receive: 'Vélo reçu', close: 'Classer la demande' }

function TransfertCard({ t, magasinId, canAct, isAcheteur, isUnread, onAction }) {
  const s = transferSides(t)
  const next = transferNextStep(t, { magasinId, canAct, isAcheteur })
  const showButton = next.action && (next.mine || next.action === 'receive')

  return (
    <div className={[
      'bg-white dark:bg-neutral-900 rounded-2xl border p-4 space-y-3 transition-all',
      next.mine ? 'border-gray-900 dark:border-white/70' : isUnread ? 'border-blue-300 dark:border-blue-500/50' : 'border-gray-200 dark:border-neutral-800',
    ].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isUnread && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" title="Nouveau" />}
            <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{t.modele}</p>
            {t.quantite > 1 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">×{t.quantite}</span>
            )}
          </div>
          {details(t) && <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{details(t)}</p>}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusPill t={t} />
          <span className="text-[10px] text-gray-400 dark:text-neutral-500">
            {s.byAcheteur ? 'Demandé par l’acheteur' : myTransferRole(t, magasinId) === 'receiver' ? 'Votre demande' : `Demandé par ${s.receiverNom}`}
          </span>
        </div>
      </div>

      <Route senderNom={s.senderNom} receiverNom={s.receiverNom} me={myTransferRole(t, magasinId)} />
      <Steps t={t} />

      {t.commentaire && (
        <p className="text-xs text-gray-500 dark:text-neutral-400 italic border-l-2 border-gray-200 dark:border-neutral-700 pl-2">{t.commentaire}</p>
      )}
      {t.reponseCommentaire && (
        <div className="rounded-lg bg-gray-50 dark:bg-neutral-800 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Réponse de {s.senderNom}</p>
          <p className="text-xs text-gray-700 dark:text-neutral-300">{t.reponseCommentaire}</p>
        </div>
      )}

      {/* Prochaine étape : à qui c'est le tour, et le bouton qui va avec */}
      <div className={['flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl px-3 py-2.5',
        next.mine ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-50 text-gray-600 dark:bg-neutral-800/60 dark:text-neutral-300'].join(' ')}>
        <p className="flex-1 text-xs font-medium leading-snug">{next.text}</p>
        {showButton && (
          <button onClick={() => onAction(next.action, t)}
            className={['shrink-0 h-8 px-3 rounded-lg text-xs font-semibold transition-colors',
              next.mine
                ? 'bg-white text-gray-900 hover:bg-gray-100 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
                : 'border border-gray-300 text-gray-700 hover:bg-white dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-900'].join(' ')}>
            {ACTION_LABELS[next.action]}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── CompletedTransfertRow ────────────────────────────────────────────────── */
function CompletedTransfertRow({ t }) {
  const s = transferSides(t)
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.modele}</p>
          {t.quantite > 1 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">×{t.quantite}</span>
          )}
          {s.byAcheteur && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Acheteur</span>}
        </div>
        {details(t) && <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{details(t)}</p>}
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400 truncate">
          {s.senderNom} <span className="text-gray-300 dark:text-neutral-600">→</span> {s.receiverNom}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtDate(t.completedAt || t.createdAt)}</p>
        <StatusPill t={t} />
      </div>
    </div>
  )
}

/* ── RealisesTab ──────────────────────────────────────────────────────────── */
function RealisesTab({ completed }) {
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState('') // '' = tous, 'YYYY-MM'

  const availableMonths = useMemo(() => {
    const set = new Set()
    completed.forEach(t => {
      const d = getTs(t.completedAt || t.createdAt)
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    })
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 24)
  }, [completed])

  const filtered = useMemo(() => {
    return completed.filter(t => {
      if (search) {
        const q = search.toLowerCase()
        if (!t.modele?.toLowerCase().includes(q) &&
            !t.fromMagasinNom?.toLowerCase().includes(q) &&
            !t.toMagasinNom?.toLowerCase().includes(q) &&
            !t.codeChrono?.toLowerCase().includes(q)) return false
      }
      if (filterMonth) {
        const d = getTs(t.completedAt || t.createdAt)
        if (!d) return false
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (key !== filterMonth) return false
      }
      return true
    })
  }, [completed, search, filterMonth])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="Input h-8 text-xs flex-1 min-w-36"
          placeholder="Rechercher modèle, magasin, code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="Input h-8 text-xs sm:!w-48"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
        >
          <option value="">Tous les mois</option>
          {availableMonths.map(m => {
            const [y, mo] = m.split('-')
            return <option key={m} value={m}>{MOIS[parseInt(mo) - 1]} {y}</option>
          })}
        </select>
        {(search || filterMonth) && (
          <button
            onClick={() => { setSearch(''); setFilterMonth('') }}
            className="h-8 px-3 rounded-lg text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-700"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
        {filtered.length} transfert{filtered.length !== 1 ? 's' : ''} réalisé{filtered.length !== 1 ? 's' : ''}
        {filterMonth || search ? ' (filtré)' : ' au total'}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
          Aucun transfert réalisé trouvé.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {filtered.map(t => <CompletedTransfertRow key={t.id} t={t} />)}
        </div>
      )}
    </div>
  )
}

/* ── StatCard ─────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color = 'teal', trend }) {
  const cls = {
    teal:   { wrap: 'from-teal-50 to-teal-100/50 dark:from-teal-500/10 dark:to-teal-500/5 border-teal-200 dark:border-teal-500/30', val: 'text-teal-700 dark:text-teal-300' },
    blue:   { wrap: 'from-blue-50 to-blue-100/50 dark:from-blue-500/10 dark:to-blue-500/5 border-blue-200 dark:border-blue-500/30', val: 'text-blue-700 dark:text-blue-300' },
    violet: { wrap: 'from-violet-50 to-violet-100/50 dark:from-violet-500/10 dark:to-violet-500/5 border-violet-200 dark:border-violet-500/30', val: 'text-violet-700 dark:text-violet-300' },
    amber:  { wrap: 'from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border-amber-200 dark:border-amber-500/30', val: 'text-amber-700 dark:text-amber-300' },
  }[color]
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${cls.wrap} border p-4 space-y-1`}>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${cls.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-neutral-500">{sub}</p>}
      {trend !== undefined && trend !== null && (
        <p className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs N-1
        </p>
      )}
    </div>
  )
}

/* ── BarChart ─────────────────────────────────────────────────────────────── */
function BarChart({ data, labelKey = 'label', aKey = 'current', bKey = 'previous' }) {
  const max = Math.max(...data.map(d => Math.max(d[aKey] || 0, d[bKey] || 0)), 1)
  return (
    <div className="flex items-end gap-1.5 h-32 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <div className="w-full flex items-end justify-center gap-px h-24">
            <div
              className="w-[46%] bg-teal-500 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d[aKey] || 0) / max) * 100}%`, minHeight: d[aKey] > 0 ? '3px' : '0' }}
              title={`${d[aKey] || 0}`}
            />
            <div
              className="w-[46%] bg-gray-200 dark:bg-neutral-600 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d[bKey] || 0) / max) * 100}%`, minHeight: d[bKey] > 0 ? '3px' : '0' }}
              title={`${d[bKey] || 0}`}
            />
          </div>
          <span className="text-[8px] text-gray-400 dark:text-neutral-500 leading-none truncate w-full text-center">{d[labelKey]}</span>
        </div>
      ))}
    </div>
  )
}

/* ── StatistiquesTab ──────────────────────────────────────────────────────── */
function StatistiquesTab({ completed }) {
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()

  const [periode, setPeriode] = useState('annee')
  const [selectedYear, setSelectedYear] = useState(thisYear)
  const [selectedMonth, setSelectedMonth] = useState(thisMonth)

  const availableYears = useMemo(() => {
    const set = new Set()
    completed.forEach(t => {
      const d = getTs(t.completedAt || t.createdAt)
      if (d) set.add(d.getFullYear())
    })
    return [...set].sort((a, b) => b - a)
  }, [completed])

  const filtered = useMemo(() => {
    return completed.filter(t => {
      const d = getTs(t.completedAt || t.createdAt)
      if (!d) return false
      switch (periode) {
        case 'mois':  return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth
        case 'annee': return d.getFullYear() === selectedYear
        case 'ytd':   return d.getFullYear() === thisYear
        case 'tout':  return true
        default:      return true
      }
    })
  }, [completed, periode, selectedYear, selectedMonth, thisYear])

  const totalThisYear = useMemo(() =>
    completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === thisYear }).length
  , [completed, thisYear])

  const totalLastYear = useMemo(() =>
    completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === thisYear - 1 }).length
  , [completed, thisYear])

  const totalThisMonth = useMemo(() =>
    completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === thisYear && d?.getMonth() === thisMonth }).length
  , [completed, thisYear, thisMonth])

  const yoyGrowth = totalLastYear > 0
    ? Math.round((totalThisYear - totalLastYear) / totalLastYear * 100)
    : null

  const avgPerMonth = thisMonth >= 0
    ? (totalThisYear / Math.max(thisMonth + 1, 1)).toFixed(1)
    : '0'

  const monthlyComparison = useMemo(() =>
    MOIS_COURTS.map((label, m) => ({
      label,
      current:  completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === thisYear && d?.getMonth() === m }).length,
      previous: completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === thisYear - 1 && d?.getMonth() === m }).length,
    }))
  , [completed, thisYear])

  const avgDelay = useMemo(() => {
    const withDates = filtered.filter(t => t.completedAt && t.createdAt)
    if (withDates.length === 0) return null
    const totalMs = withDates.reduce((sum, t) => {
      const created   = getTs(t.createdAt)
      const completed = getTs(t.completedAt)
      if (!created || !completed) return sum
      return sum + Math.max(0, completed.getTime() - created.getTime())
    }, 0)
    return totalMs / withDates.length / 86400000
  }, [filtered])

  const avgDelayAll = useMemo(() => {
    const withDates = completed.filter(t => t.completedAt && t.createdAt)
    if (withDates.length === 0) return null
    const totalMs = withDates.reduce((sum, t) => {
      const created   = getTs(t.createdAt)
      const comp      = getTs(t.completedAt)
      if (!created || !comp) return sum
      return sum + Math.max(0, comp.getTime() - created.getTime())
    }, 0)
    return totalMs / withDates.length / 86400000
  }, [completed])

  function fmtDelay(days) {
    if (days === null) return '—'
    if (days < 1) return '< 1 j'
    return `${days.toFixed(1)} j`
  }

  const storeStats = useMemo(() => {
    const map = {}
    filtered.forEach(t => {
      const { senderNom } = transferSides(t)
      if (senderNom) map[senderNom] = (map[senderNom] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [filtered])

  const maxStore = storeStats[0]?.[1] || 1

  const showTable = periode === 'annee' || periode === 'ytd'
  const tableYear = periode === 'ytd' ? thisYear : selectedYear

  const monthlyTable = useMemo(() => {
    if (!showTable) return null
    return MOIS.map((label, m) => {
      const curr = completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === tableYear && d?.getMonth() === m }).length
      const prev = completed.filter(t => { const d = getTs(t.completedAt || t.createdAt); return d?.getFullYear() === tableYear - 1 && d?.getMonth() === m }).length
      return { label, curr, prev, diff: curr - prev }
    })
  }, [completed, showTable, tableYear])

  const tableTotals = monthlyTable
    ? { curr: monthlyTable.reduce((s, r) => s + r.curr, 0), prev: monthlyTable.reduce((s, r) => s + r.prev, 0), diff: monthlyTable.reduce((s, r) => s + r.diff, 0) }
    : null

  return (
    <div className="space-y-5">

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total réalisés" value={completed.length} sub="Depuis le début" color="blue" />
        <StatCard label="Cette année" value={totalThisYear} sub={String(thisYear)} color="teal" trend={yoyGrowth} />
        <StatCard label="Ce mois" value={totalThisMonth} sub={`${MOIS[thisMonth]} ${thisYear}`} color="violet" />
        <StatCard label="Moy. / mois" value={avgPerMonth} sub={`Sur ${thisYear}`} color="amber" />
        <div className="col-span-2 lg:col-span-4 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-neutral-800/60 dark:to-neutral-800/30 border border-gray-200 dark:border-neutral-700 p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">Délai moyen de livraison</p>
            <p className="text-xs text-gray-400 dark:text-neutral-500">Entre la demande et la réception du vélo — tous transferts</p>
          </div>
          <p className="text-3xl font-bold text-gray-800 dark:text-neutral-100 shrink-0">{fmtDelay(avgDelayAll)}</p>
        </div>
      </div>

      {/* Comparison chart */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Comparaison N-1</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-neutral-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-teal-500 inline-block" />{thisYear}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gray-300 dark:bg-neutral-600 inline-block" />{thisYear - 1}</span>
          </div>
        </div>
        <BarChart data={monthlyComparison} />
      </div>

      {/* Period filter + store breakdown */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Analyse par période</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="Input h-8 text-xs px-2 !w-auto" value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="mois">Ce mois</option>
              <option value="annee">Par année</option>
              <option value="ytd">Depuis début d'année</option>
              <option value="tout">Tout</option>
            </select>
            {(periode === 'mois' || periode === 'annee') && (
              <select className="Input h-8 text-xs px-2 !w-auto" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {periode === 'mois' && (
              <select className="Input h-8 text-xs px-2 !w-auto" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
                {MOIS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-neutral-800 border-y border-gray-100 dark:border-neutral-800 py-2">
          <div className="flex items-center justify-between pr-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Réalisés</p>
            <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{filtered.length}</p>
          </div>
          <div className="flex items-center justify-between pl-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Délai moyen</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-neutral-100">{fmtDelay(avgDelay)}</p>
          </div>
        </div>

        {storeStats.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasins envoyeurs</p>
            {storeStats.map(([nom, count]) => (
              <div key={nom} className="flex items-center gap-3">
                <p className="text-xs text-gray-600 dark:text-neutral-300 w-28 shrink-0 truncate">{nom}</p>
                <div className="flex-1 h-3.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${(count / maxStore) * 100}%` }} />
                </div>
                <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-6 text-right shrink-0">{count}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly detail table */}
      {showTable && monthlyTable && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Détail mensuel — {tableYear}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Mois</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear}</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear - 1}</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Évol.</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTable.map(({ label, curr, prev, diff }, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-2 text-gray-700 dark:text-neutral-300">{label}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-white">{curr || '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-400 dark:text-neutral-500">{prev || '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${
                      diff > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                      diff < 0 ? 'text-red-500 dark:text-red-400' :
                      'text-gray-300 dark:text-neutral-600'
                    }`}>
                      {curr === 0 && prev === 0 ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 dark:bg-neutral-800/50 font-semibold border-t-2 border-gray-200 dark:border-neutral-700">
                  <td className="px-4 py-2.5 text-gray-800 dark:text-neutral-200">Total</td>
                  <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{tableTotals.curr}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500 dark:text-neutral-400">{tableTotals.prev}</td>
                  <td className={`px-4 py-2.5 text-right ${
                    tableTotals.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                    tableTotals.diff < 0 ? 'text-red-500 dark:text-red-400' :
                    'text-gray-300 dark:text-neutral-600'
                  }`}>
                    {tableTotals.diff > 0 ? `+${tableTotals.diff}` : tableTotals.diff === 0 ? '=' : tableTotals.diff}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function Transfert() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const isAcheteur = profile?.role === 'acheteur'
  const isDirecteurMag = profile?.role === 'directeurmag'
  const canAct = profile?.role === 'velo' // les règles Firestore réservent les réponses au rayon vélo

  const canCreate = profile?.role === 'velo' || isAcheteur
  const canSeeRealises = isAcheteur || isDirecteurMag
  const canSeeStats = isAcheteur

  const [tab, setTab] = useState(null) // null : premier onglet où il y a quelque chose à faire
  const [transferts, setTransferts] = useState([])
  const [magasins, setMagasins] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [modal, setModal] = useState(null) // { kind: 'respond' | 'ship', t }
  const [helpHidden, setHelpHidden] = useState(() => {
    try { return localStorage.getItem(HELP_KEY) === '1' } catch { return false }
  })

  function toggleHelp(hidden) {
    setHelpHidden(hidden)
    try { localStorage.setItem(HELP_KEY, hidden ? '1' : '0') } catch { /* stockage indisponible */ }
  }

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

  const completed = useMemo(() => transferts.filter(t => t.status === 'completed'), [transferts])
  const active = useMemo(() => transferts.filter(t => t.status !== 'completed'), [transferts])

  const actOpts = { magasinId: effectiveMagasinId, canAct, isAcheteur }
  const needs = t => transferNextStep(t, actOpts).mine
  // Ce qui demande une action passe en premier
  const byUrgency = list => [...list].sort((a, b) => needs(b) - needs(a))

  const aEnvoyer = byUrgency(active.filter(t => myTransferRole(t, effectiveMagasinId) === 'sender'))
  const aRecevoir = byUrgency(active.filter(t => myTransferRole(t, effectiveMagasinId) === 'receiver'))
  const tous = byUrgency(active)

  const completedForUser = useMemo(() =>
    isAcheteur
      ? completed
      : completed.filter(t => t.fromMagasinId === effectiveMagasinId || t.toMagasinId === effectiveMagasinId)
  , [completed, isAcheteur, effectiveMagasinId])

  const count = list => list.filter(needs).length
  const tabs = [
    ...(isGlobal ? [{ key: 'tous', label: 'Tous les transferts', badge: count(tous),
      hint: 'Tous les transferts en cours entre magasins.' }] : []),
    ...(effectiveMagasinId ? [
      { key: 'envoyer', label: 'Vélos à envoyer', badge: count(aEnvoyer), list: aEnvoyer,
        hint: 'Les vélos que d’autres magasins vous demandent : répondez, puis envoyez-les.' },
      { key: 'recevoir', label: 'Vélos à recevoir', badge: count(aRecevoir), list: aRecevoir,
        hint: 'Vos demandes et les transferts de l’acheteur : confirmez la réception quand le vélo arrive.' },
    ] : []),
    ...(canSeeRealises ? [{ key: 'realises', label: 'Historique', badge: 0, hint: 'Transferts terminés (vélo reçu).' }] : []),
    ...(canSeeStats ? [{ key: 'stats', label: 'Statistiques', badge: 0 }] : []),
  ]
  const firstWithAction = tabs.find(t => t.badge > 0)?.key
  const currentTab = tabs.some(t => t.key === tab) ? tab : (firstWithAction || tabs[0]?.key)
  const current = tabs.find(t => t.key === currentTab)
  const displayed = currentTab === 'tous' ? tous : current?.list || []
  const isListTab = ['tous', 'envoyer', 'recevoir'].includes(currentTab)

  /* Marque comme lus les transferts affichés du magasin */
  const unreadIds = displayed.filter(t => { const f = readField(t, effectiveMagasinId); return f && t[f] === false }).map(t => t.id).join(',')
  useEffect(() => {
    if (!unreadIds || !canAct) return
    const timer = setTimeout(() => {
      displayed.filter(t => unreadIds.split(',').includes(t.id))
        .forEach(t => updateDoc(doc(db, 'transferts', t.id), { [readField(t, effectiveMagasinId)]: true }).catch(() => {}))
    }, 1500)
    return () => clearTimeout(timer)
  }, [unreadIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const magasinNom = magasins.find(m => m.id === effectiveMagasinId)?.nom || ''
  // L'autre magasin voit la nouveauté (pastille « non lu »)
  const notifyOther = t => { const f = otherReadField(t, effectiveMagasinId); return f ? { [f]: false } : { readByFrom: false, readByTo: false } }

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
      docData.readByTo = false
    }
    await addDoc(collection(db, 'transferts'), docData)
  }

  async function handleReponse(t, status, commentaire) {
    await updateDoc(doc(db, 'transferts', t.id), {
      status,
      reponseCommentaire: commentaire ?? null,
      respondedBy: user.uid,
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...notifyOther(t),
    })
  }

  async function handleShip(t) {
    await updateDoc(doc(db, 'transferts', t.id), {
      status: 'shipped',
      conformite: true,
      shippedBy: user.uid,
      shippedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...notifyOther(t),
    })
  }

  async function handleReceive(t) {
    if (!confirm(`Confirmer la réception de « ${t.modele} » ? Le transfert sera terminé.`)) return
    await updateDoc(doc(db, 'transferts', t.id), {
      status: 'completed',
      completedAt: serverTimestamp(),
      ...(t.respondedAt ? {} : { respondedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
      readByFrom: true,
      readByTo: true,
    })
  }

  async function handleClose(t) {
    if (!confirm(`Classer la demande refusée pour « ${t.modele} » ? Elle sera supprimée.`)) return
    await deleteDoc(doc(db, 'transferts', t.id))
  }

  function onAction(action, t) {
    if (action === 'respond' || action === 'ship') setModal({ kind: action, t })
    else if (action === 'receive') handleReceive(t)
    else if (action === 'close') handleClose(t)
  }

  const isUnread = t => { const f = readField(t, effectiveMagasinId); return !!f && t[f] === false }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Transferts vélo</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                Faire venir un vélo d’un autre magasin{magasinNom ? ` · ${magasinNom}` : ''}
                {helpHidden && <> · <button onClick={() => toggleHelp(false)} className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-neutral-300">Comment ça marche ?</button></>}
              </p>
            </div>
            {canCreate && (isAcheteur || effectiveMagasinId) && (
              <button onClick={() => setShowForm(true)}
                className="h-9 sm:h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                + {isAcheteur ? 'Organiser un transfert' : 'Demander un vélo'}
              </button>
            )}
          </div>

          {!helpHidden && <HowItWorks onHide={() => toggleHelp(true)} />}

          {/* Onglets */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={['h-9 px-3 sm:px-4 -mb-px text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0',
                  currentTab === t.key
                    ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                {t.label}
                {t.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-bold" title="À traiter">{t.badge}</span>
                )}
              </button>
            ))}
          </div>
          {current?.hint && <p className="text-[11px] text-gray-500 dark:text-neutral-400 -mt-1">{current.hint}</p>}

          {currentTab === 'stats' && canSeeStats && <StatistiquesTab completed={completed} />}
          {currentTab === 'realises' && canSeeRealises && <RealisesTab completed={completedForUser} />}

          {isListTab && (
            displayed.length === 0 ? (
              <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700 space-y-1">
                <p className="text-sm font-semibold text-gray-700 dark:text-neutral-300">
                  {currentTab === 'envoyer' ? 'Aucun vélo à envoyer' : currentTab === 'recevoir' ? 'Aucun vélo attendu' : 'Aucun transfert en cours'}
                </p>
                <p className="text-xs text-gray-400 dark:text-neutral-500">
                  {currentTab === 'recevoir' && canCreate ? 'Il vous manque un vélo ? Demandez-le à un autre magasin.' : 'Rien à faire pour le moment.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                {displayed.map(t => (
                  <TransfertCard key={t.id} t={t} magasinId={effectiveMagasinId} canAct={canAct} isAcheteur={isAcheteur}
                    isUnread={isUnread(t)} onAction={onAction} />
                ))}
              </div>
            )
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

      {modal?.kind === 'respond' && <ReponseModal transfert={modal.t} onClose={() => setModal(null)} onReponse={handleReponse} />}
      {modal?.kind === 'ship' && <ShipModal transfert={modal.t} onClose={() => setModal(null)} onShip={handleShip} />}
    </div>
  )
}
