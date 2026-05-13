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
  pending:   { label: 'En attente', bg: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  accepted:  { label: 'Accepté',    bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  refused:   { label: 'Refusé',     bg: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  completed: { label: 'Réalisé',    bg: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
}

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

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
            {isUnread && <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />}
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

      {t.createdByAcheteur && (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 px-3 py-2">
          <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">Transfert initié par l'acheteur</p>
        </div>
      )}

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

/* ── CompletedTransfertRow ────────────────────────────────────────────────── */
function CompletedTransfertRow({ t }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.modele}</p>
          {t.quantite > 1 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">×{t.quantite}</span>
          )}
          {t.createdByAcheteur && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">Acheteur</span>
          )}
        </div>
        {(t.taille || t.couleur || t.codeChrono) && (
          <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
            {[t.taille, t.couleur, t.codeChrono].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-neutral-400">
          <span>{t.fromMagasinNom}</span>
          <svg className="h-3 w-3 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span>{t.toMagasinNom}</span>
        </div>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtDate(t.completedAt || t.createdAt)}</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">Réalisé</span>
      </div>
    </div>
  )
}

/* ── RealisesTab ──────────────────────────────────────────────────────────── */
function RealisesTab({ completed }) {
  const now = new Date()
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
          className="Input h-8 text-xs"
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
        <div className="space-y-2">
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
      if (t.fromMagasinNom) map[t.fromMagasinNom] = (map[t.fromMagasinNom] || 0) + 1
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
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total réalisés" value={completed.length} sub="Depuis le début" color="blue" />
        <StatCard label="Cette année" value={totalThisYear} sub={String(thisYear)} color="teal" trend={yoyGrowth} />
        <StatCard label="Ce mois" value={totalThisMonth} sub={`${MOIS[thisMonth]} ${thisYear}`} color="violet" />
        <StatCard label="Moy. / mois" value={avgPerMonth} sub={`Sur ${thisYear}`} color="amber" />
        <div className="col-span-2 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-neutral-800/60 dark:to-neutral-800/30 border border-gray-200 dark:border-neutral-700 p-4 flex items-center justify-between gap-4">
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
            <select className="Input h-8 text-xs px-2" value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="mois">Ce mois</option>
              <option value="annee">Par année</option>
              <option value="ytd">Depuis début d'année</option>
              <option value="tout">Tout</option>
            </select>
            {(periode === 'mois' || periode === 'annee') && (
              <select className="Input h-8 text-xs px-2" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {periode === 'mois' && (
              <select className="Input h-8 text-xs px-2" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
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
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const isAcheteur = profile?.role === 'acheteur'
  const isDirecteurMag = profile?.role === 'directeurmag'

  const canCreate = profile?.role === 'velo' || isAcheteur
  const canSeeRealises = isAcheteur || isDirecteurMag
  const canSeeStats = isAcheteur

  const defaultTab = isGlobal ? 'toutes' : 'recues'
  const [tab, setTab] = useState(defaultTab)
  const [transferts, setTransferts] = useState([])
  const [magasins, setMagasins] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [activeReponse, setActiveReponse] = useState(null)

  const prevTab = useRef(tab)
  useEffect(() => {
    if (tab === 'envoyees' && prevTab.current !== 'envoyees') {
      const unread = envoyees.filter(t => t.readByFrom === false)
      if (unread.length > 0)
        Promise.all(unread.map(t => updateDoc(doc(db, 'transferts', t.id), { readByFrom: true })))
    }
    if (tab === 'recues' && prevTab.current !== 'recues') {
      const unread = recues.filter(t => t.readByTo === false)
      if (unread.length > 0)
        Promise.all(unread.map(t => updateDoc(doc(db, 'transferts', t.id), { readByTo: true })))
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

  // Completed = archived transfers (vélo arrivé)
  const completed = useMemo(() => transferts.filter(t => t.status === 'completed'), [transferts])
  // Active = all non-completed
  const active = useMemo(() => transferts.filter(t => t.status !== 'completed'), [transferts])

  const recues = useMemo(() => active.filter(t => t.toMagasinId === effectiveMagasinId), [active, effectiveMagasinId])
  const envoyees = useMemo(() => active.filter(t => t.fromMagasinId === effectiveMagasinId), [active, effectiveMagasinId])

  // Completed visible by directeurmag = their store only; acheteur = all
  const completedForUser = useMemo(() =>
    isAcheteur
      ? completed
      : completed.filter(t => t.fromMagasinId === effectiveMagasinId || t.toMagasinId === effectiveMagasinId)
  , [completed, isAcheteur, effectiveMagasinId])

  const pendingRecues = recues.filter(t => t.status === 'pending').length
  const unreadRecues = recues.filter(t => t.readByTo === false).length
  const unreadResponses = envoyees.filter(t => t.readByFrom === false && t.status !== 'pending').length
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
    if (!confirm(`Confirmer la réception du "${t.modele}" ? Le transfert sera archivé comme réalisé.`)) return
    await updateDoc(doc(db, 'transferts', t.id), {
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      readByFrom: true,
      readByTo: true,
    })
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
    ...(isGlobal ? [{ key: 'toutes', label: 'Tous les transferts', badge: 0 }] : []),
    { key: 'recues', label: 'Reçues', badge: pendingRecues },
    { key: 'envoyees', label: 'Envoyées', badge: unreadResponses + unreadAcheteurEnvoyees },
    ...(canSeeRealises ? [{ key: 'realises', label: 'Réalisés', badge: 0 }] : []),
    ...(canSeeStats ? [{ key: 'stats', label: 'Statistiques', badge: 0 }] : []),
  ]

  const displayed = tab === 'toutes' ? active : tab === 'recues' ? recues : envoyees

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
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={['h-9 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0',
                  tab === t.key
                    ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                {t.label}
                {t.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-bold">{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Stats tab ── */}
          {tab === 'stats' && canSeeStats && (
            <StatistiquesTab completed={completed} />
          )}

          {/* ── Réalisés tab ── */}
          {tab === 'realises' && canSeeRealises && (
            <RealisesTab completed={completedForUser} />
          )}

          {/* ── Active tabs (toutes / recues / envoyees) ── */}
          {(tab === 'toutes' || tab === 'recues' || tab === 'envoyees') && (
            <>
              {isGlobal && tab === 'toutes' && active.length > 0 && (
                <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                  {active.length} transfert{active.length > 1 ? 's' : ''} actif{active.length > 1 ? 's' : ''} — lecture seule
                </p>
              )}

              {tab === 'envoyees' && unreadResponses > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30">
                  <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                    {unreadResponses} réponse{unreadResponses > 1 ? 's' : ''} à consulter
                  </p>
                </div>
              )}

              {tab === 'envoyees' && unreadAcheteurEnvoyees > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30">
                  <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    {unreadAcheteurEnvoyees} transfert{unreadAcheteurEnvoyees > 1 ? 's' : ''} initié{unreadAcheteurEnvoyees > 1 ? 's' : ''} par l'acheteur — des vélos sont à envoyer
                  </p>
                </div>
              )}

              {tab === 'recues' && unreadRecues > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30">
                  <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                    {unreadRecues} transfert{unreadRecues > 1 ? 's' : ''} initié{unreadRecues > 1 ? 's' : ''} par l'acheteur — des vélos sont attendus
                  </p>
                </div>
              )}

              {displayed.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
                  {tab === 'recues' ? 'Aucune demande reçue.' : tab === 'envoyees' ? 'Aucune demande envoyée.' : 'Aucun transfert actif.'}
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
            </>
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
