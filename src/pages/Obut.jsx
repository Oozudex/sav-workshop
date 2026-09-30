// Commandes OBUT : boules de pétanque sur mesure.
// Même suivi que les commandes clients (statuts, étape suivante, historique) ;
// le catalogue (boules, marquages, services) est géré par les acheteurs.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import Navbar from '../components/Navbar'
import CatalogueModal from '../components/obut/CatalogueModal'
import ObutFields from '../components/obut/ObutFields'
import ObutStats from '../components/obut/ObutStats'
import { BTN_PRIMARY, BTN_SECONDARY } from '../components/admin/ui'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import { CAN_DELETE_ROLES, GLOBAL_ROLES } from '../lib/constants'
import { toDate } from '../lib/ticketStats'
import { useStaff } from '../lib/useStaff'
import { formatEuro, parseEuro } from '../lib/orders'
import {
  DEFAULT_CATALOGUE, OBUT_CLOSED_STATUSES, OBUT_NEXT_STEP, OBUT_OPEN_STATUSES, OBUT_STATUSES, OBUT_STATUS_META,
  OBUT_VISIBLE_DAYS, emptyObutForm, isObutListed, isObutOpen, obutClientName, obutFormErrors, obutFormFromCmd,
  obutLines, obutMatches, obutPayload, obutRemaining, obutStatus, obutStatusSince, obutTotal,
} from '../lib/obut'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtYmd(ymd) {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

function sinceLabel(date) {
  const d = toDate(date)
  if (!d) return ''
  const n = Math.floor((Date.now() - d.getTime()) / 86400000)
  return n <= 0 ? "aujourd'hui" : `depuis ${n} j`
}

const todayStr = () => new Date().toLocaleDateString('fr-CA')
const specs = c => [c.diametre, c.strie && `strie ${c.strie}`, c.poids].filter(Boolean).join(' · ')

/* ── Petits composants ────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const meta = OBUT_STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
    </span>
  )
}

function StatusSelect({ value, onChange }) {
  const meta = OBUT_STATUS_META[value]
  return (
    <select value={value} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()} aria-label="Statut"
      className={`max-w-full rounded-lg border text-xs font-medium px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 ${meta.badge}`}>
      {OBUT_STATUSES.map(s => (
        <option key={s} value={s} className="bg-white dark:bg-neutral-900 text-gray-900 dark:text-white">{OBUT_STATUS_META[s].label}</option>
      ))}
    </select>
  )
}

function StatCard({ status, value, active, onClick }) {
  const meta = OBUT_STATUS_META[status]
  return (
    <button onClick={onClick} title={active ? 'Retirer le filtre' : `Afficher : ${meta.label}`}
      className={`text-left rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors min-w-0 bg-white dark:bg-neutral-900 ${active
        ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white'
        : 'border-gray-200 hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide truncate">{meta.label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      <p className="hidden sm:block text-[11px] text-gray-400 dark:text-neutral-500 truncate">{meta.hint}</p>
    </button>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  )
}

function Info({ label, children, full = false }) {
  return (
    <div className={full ? 'col-span-full' : ''}>
      <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm text-gray-900 dark:text-white break-words">{children || '—'}</div>
    </div>
  )
}

function IconBtn({ title, onClick, danger = false, d }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={`h-8 w-8 grid place-items-center rounded-lg text-gray-400 transition-colors ${danger
        ? 'hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10'
        : 'hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800'}`}>
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
    </button>
  )
}
const ICON_CLOSE = 'M6 18L18 6M6 6l12 12'
const ICON_DELETE = 'M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7'

// Fenêtre plein écran sur téléphone, centrée ensuite ; pied de page collé en bas
function Sheet({ onClose, children, footer, closeOnOverlay = true }) {
  const overlayRef = useRef(null)
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div ref={overlayRef} onMouseDown={e => { if (closeOnOverlay && e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 sm:pt-[4vh] overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border shadow-2xl bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800">
        {children}
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t rounded-b-2xl border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Création ─────────────────────────────────────────────────────────────── */
function NewOrder({ catalogue, staff, onSubmit, onClose }) {
  const [form, setForm] = useState(() => emptyObutForm(catalogue, todayStr()))
  const [statut, setStatut] = useState('en_attente')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errors = tried ? obutFormErrors(form) : {}

  async function submit() {
    setTried(true); setError('')
    if (Object.keys(obutFormErrors(form)).length) return
    setBusy(true)
    try { await onSubmit(form, statut); onClose() }
    catch (e) { setError(e.message || 'Enregistrement impossible'); setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} closeOnOverlay={false} footer={<>
      {tried && Object.keys(errors).length > 0 && <p className="text-xs text-red-600 dark:text-red-400 mr-auto">Corrigez les champs en rouge.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
      <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
      <button type="button" onClick={submit} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Créer la commande'}</button>
    </>}>
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Nouvelle commande OBUT</p>
          <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">Les prix viennent du catalogue ; ils restent modifiables pour cette commande.</p>
        </div>
        <IconBtn title="Fermer" onClick={onClose} d={ICON_CLOSE} />
      </div>
      <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
        <ObutFields form={form} setForm={setForm} catalogue={catalogue} staff={staff} errors={errors} autoFocus />
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Statut de départ</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {OBUT_OPEN_STATUSES.map(s => (
              <button key={s} type="button" onClick={() => setStatut(s)} title={OBUT_STATUS_META[s].hint}
                className={['h-9 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                  statut === s ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'].join(' ')}>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${OBUT_STATUS_META[s].dot}`} />
                <span className="truncate">{OBUT_STATUS_META[s].label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

/* ── Fiche commande ───────────────────────────────────────────────────────── */
function OrderSheet({ cmd, catalogue, staff, magasinNom, canDelete, onClose, onChangeStatut, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => obutFormFromCmd(cmd))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const errors = tried ? obutFormErrors(form) : {}

  const status = obutStatus(cmd)
  const meta = OBUT_STATUS_META[status]
  const next = OBUT_NEXT_STEP[status]
  const lines = obutLines(cmd)
  const total = cmd.totalTTC ?? obutTotal(cmd)
  const acompte = parseEuro(cmd.acompte)
  const reste = cmd.resteARegler ?? obutRemaining(cmd)
  const history = (cmd.history || []).slice().reverse()
  const name = obutClientName(cmd)

  useEffect(() => { if (!editing) setForm(obutFormFromCmd(cmd)) }, [cmd, editing])

  async function save() {
    setTried(true)
    if (Object.keys(obutFormErrors(form)).length) return
    setBusy(true)
    try { await onSave(form); setEditing(false); setTried(false) } finally { setBusy(false) }
  }

  return (
    <Sheet onClose={editing ? () => {} : onClose} closeOnOverlay={!editing} footer={editing && <>
      {tried && Object.keys(errors).length > 0 && <p className="text-xs text-red-600 dark:text-red-400 mr-auto">Corrigez les champs en rouge.</p>}
      <button type="button" onClick={() => { setEditing(false); setTried(false) }} className={BTN_SECONDARY}>Annuler</button>
      <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-neutral-500">Commande du {fmtYmd(cmd.dateCommande)}{magasinNom ? ` · ${magasinNom}` : ''}</span>
            <StatusBadge status={status} />
          </div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white break-words">{name || 'Client anonymisé'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && name && (
            <button type="button" onClick={() => setEditing(true)} className={BTN_SECONDARY}>Modifier</button>
          )}
          {canDelete && !editing && (confirmDelete ? (
            <span className="flex items-center gap-1">
              <button type="button" onClick={onDelete} className="h-8 px-2.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Supprimer</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-8 px-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800">Non</button>
            </span>
          ) : <IconBtn title="Supprimer la commande" danger onClick={() => setConfirmDelete(true)} d={ICON_DELETE} />)}
          {!editing && <IconBtn title="Fermer" onClick={onClose} d={ICON_CLOSE} />}
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
        {editing ? (
          <ObutFields form={form} setForm={setForm} catalogue={catalogue} staff={staff} errors={errors} />
        ) : (
          <>
            {/* Suivi : même principe que les commandes clients */}
            <Card title="Suivi">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                {OBUT_STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => onChangeStatut(s)} disabled={s === status} title={OBUT_STATUS_META[s].hint}
                    className={`h-9 sm:h-7 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors border ${s === status
                      ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${OBUT_STATUS_META[s].dot}`} />
                    <span className="truncate">{OBUT_STATUS_META[s].label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                <p className="text-xs text-gray-500 dark:text-neutral-400">{meta.hint} · {sinceLabel(obutStatusSince(cmd))}</p>
                {next && (
                  <button type="button" onClick={() => onChangeStatut(next.to)}
                    className="h-10 sm:h-8 px-3 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                    {next.label} →
                  </button>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <Card title="Client">
                <div className="grid grid-cols-2 gap-x-3 sm:gap-x-5 gap-y-3">
                  <Info label="Nom">{name}</Info>
                  <Info label="Téléphone">
                    {cmd.clientTel && <a href={`tel:${cmd.clientTel.replace(/\s/g, '')}`} className="underline underline-offset-2">{cmd.clientTel}</a>}
                  </Info>
                  <Info label="Vendeur">{cmd.vendeur || cmd.etabliePar}</Info>
                  <Info label="Date de commande">{fmtYmd(cmd.dateCommande)}</Info>
                </div>
              </Card>
              <Card title="Boules">
                <div className="grid grid-cols-3 gap-x-3 sm:gap-x-5 gap-y-3">
                  <Info label="Modèle" full><span className="font-semibold">{cmd.modele}</span></Info>
                  <Info label="Diamètre">{cmd.diametre}</Info>
                  <Info label="Strie">{cmd.strie}</Info>
                  <Info label="Poids">{cmd.poids}</Info>
                  {cmd.marquage && <Info label="Texte à graver" full>« {cmd.marquage} »</Info>}
                </div>
              </Card>
            </div>

            <Card title="Paiement">
              <div className="divide-y divide-gray-100 dark:divide-neutral-800 -my-1">
                {lines.map(l => (
                  <div key={l.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 text-gray-700 dark:text-neutral-300">{l.label}</span>
                    <span className="tabular-nums text-gray-900 dark:text-white whitespace-nowrap">{formatEuro(l.prix)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 p-3">
                <Info label="Total TTC"><span className="font-bold tabular-nums">{formatEuro(total)}</span></Info>
                <Info label="Acompte"><span className="tabular-nums">{acompte ? formatEuro(acompte) : 'Aucun'}</span></Info>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Reste</p>
                  <p className={`text-sm font-bold tabular-nums ${reste > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatEuro(reste)}</p>
                </div>
              </div>
            </Card>

            <Card title="Historique">
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800 sm:divide-y-0">
                {history.length === 0 && <p className="text-xs text-gray-400 dark:text-neutral-500">Commande du {fmtYmd(cmd.dateCommande)}.</p>}
                {history.map((h, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:gap-2 text-xs py-1.5 sm:py-1">
                    <span className="text-gray-400 dark:text-neutral-500 shrink-0 sm:w-36">
                      {toDate(h.at)?.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) || '—'}<span className="sm:hidden"> · {h.by}</span>
                    </span>
                    <span className="text-gray-700 dark:text-neutral-300">{h.note}</span>
                    <span className="hidden sm:block text-gray-400 dark:text-neutral-500 ml-auto shrink-0">{h.by}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ── Téléphone : carte d'une commande ─────────────────────────────────────── */
function OrderCard({ cmd, magasin, onOpen, onChangeStatut }) {
  const total = cmd.totalTTC ?? obutTotal(cmd)
  const reste = cmd.resteARegler ?? obutRemaining(cmd)
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 space-y-2 cursor-pointer active:bg-gray-50 dark:active:bg-neutral-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{obutClientName(cmd) || 'Client anonymisé'}</p>
          <p className="text-[11px] text-gray-400 dark:text-neutral-500">
            {fmtYmd(cmd.dateCommande)}{cmd.clientTel ? ` · ${cmd.clientTel}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{formatEuro(total)}</p>
          {reste > 0 && reste !== total && <p className="text-[11px] text-red-600 dark:text-red-400">reste {formatEuro(reste)}</p>}
        </div>
      </div>
      <p className="text-xs text-gray-700 dark:text-neutral-300 break-words">
        <span className="font-semibold">{cmd.modele}</span>
        {specs(cmd) && <span className="text-gray-400 dark:text-neutral-500"> · {specs(cmd)}</span>}
        {cmd.marquage && <span className="block text-gray-500 dark:text-neutral-400 truncate">Marquage « {cmd.marquage} »</span>}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1" onClick={e => e.stopPropagation()}>
        <StatusSelect value={obutStatus(cmd)} onChange={onChangeStatut} />
        <span className="text-[11px] text-right text-gray-400 dark:text-neutral-500">
          {sinceLabel(obutStatusSince(cmd))}
          {magasin && <span className="block">{magasin}</span>}
        </span>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Obut() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const canDelete = CAN_DELETE_ROLES.includes(profile?.role)
  const magasinId = isGlobal ? selectedId : profile?.magasinId
  const staff = useStaff(magasinId, 'velo')
  const me = profile?.displayName || user?.email || '—'

  const [commandes, setCommandes] = useState([])
  const [magasins, setMagasins] = useState({})
  const [catalogueDocs, setCatalogueDocs] = useState([])
  const [tab, setTab] = useState('open')
  const [filterStatut, setFilterStatut] = useState('')
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showCatalogue, setShowCatalogue] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Catalogue d'origine tant que l'acheteur n'a rien enregistré
  const catalogue = catalogueDocs.length ? catalogueDocs : DEFAULT_CATALOGUE

  useEffect(() => onSnapshot(collection(db, 'obut_catalogue'),
    snap => setCatalogueDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setCatalogueDocs([])), [])

  useEffect(() => {
    if (!isGlobal) return
    return onSnapshot(collection(db, 'magasins'), snap =>
      setMagasins(Object.fromEntries(snap.docs.map(d => [d.id, d.data().nom]))))
  }, [isGlobal])

  useEffect(() => {
    if (!profile || (!isGlobal && !magasinId)) return
    const base = collection(db, 'obut_commandes')
    const qRef = magasinId
      ? query(base, where('magasinId', '==', magasinId), orderBy('dateCommande', 'desc'))
      : query(base, orderBy('dateCommande', 'desc'))
    return onSnapshot(qRef, snap => { setLoadError(''); setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() }))) },
      () => { setCommandes([]); setLoadError('Impossible de charger les commandes OBUT. Réessayez dans un instant.') })
  }, [profile, isGlobal, magasinId])

  const visible = useMemo(() => commandes.filter(c => isObutListed(c)), [commandes])
  const counts = useMemo(() => {
    const c = Object.fromEntries(OBUT_STATUSES.map(s => [s, 0]))
    for (const cmd of visible) c[obutStatus(cmd)]++
    return c
  }, [visible])
  const openCount = visible.filter(isObutOpen).length
  const doneCount = visible.length - openCount

  const filtered = useMemo(() => visible.filter(c => {
    if (tab === 'open' ? !isObutOpen(c) : isObutOpen(c)) return false
    if (filterStatut && obutStatus(c) !== filterStatut) return false
    return obutMatches(c, q)
  }), [visible, tab, filterStatut, q])

  const active = commandes.find(c => c.id === activeId) || null
  const showMagasin = isGlobal && !magasinId
  const hasFilters = q || filterStatut
  const historyEntry = (action, note) => ({ at: new Date().toISOString(), by: me, action, note })

  async function createOrder(form, statut) {
    await addDoc(collection(db, 'obut_commandes'), {
      ...obutPayload(form), statut, magasinId,
      etabliePar: me,
      statutAt: serverTimestamp(), statusDates: { [statut]: serverTimestamp() }, closedAt: null,
      history: [historyEntry('create', `Commande créée · ${OBUT_STATUS_META[statut].label}`)],
      createdBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    setTab('open'); setFilterStatut('')
  }

  async function changeStatut(cmd, statut) {
    if (statut === obutStatus(cmd)) return
    if (statut === 'annule' && !confirm(`Annuler la commande de ${obutClientName(cmd) || 'ce client'} ? Les données du client seront effacées ${OBUT_VISIBLE_DAYS} jours plus tard.`)) return
    await updateDoc(doc(db, 'obut_commandes', cmd.id), {
      statut, statutAt: serverTimestamp(), [`statusDates.${statut}`]: serverTimestamp(),
      closedAt: OBUT_CLOSED_STATUSES.includes(statut) ? serverTimestamp() : null,
      history: arrayUnion(historyEntry('status', `Statut → ${OBUT_STATUS_META[statut].label}`)),
      updatedAt: serverTimestamp(),
    })
  }

  async function saveOrder(cmd, form) {
    await updateDoc(doc(db, 'obut_commandes', cmd.id), {
      ...obutPayload(form),
      history: arrayUnion(historyEntry('edit', 'Commande modifiée')),
      updatedAt: serverTimestamp(),
    })
  }

  async function removeOrder(cmd) {
    await deleteDoc(doc(db, 'obut_commandes', cmd.id))
    setActiveId(null)
  }

  const statusCards = tab === 'open' ? OBUT_OPEN_STATUSES : OBUT_CLOSED_STATUSES
  const tabs = [['open', 'En cours', openCount], ['done', 'Terminées', doneCount], ...(isGlobal ? [['stats', 'Statistiques', null]] : [])]
  const empty = `Aucune commande${hasFilters ? ' pour ces filtres' : tab === 'open' ? ' en cours' : ' terminée'}.`

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-4 sm:p-5">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Commandes OBUT</h1>
              <p className="text-xs sm:text-sm text-gray-400 dark:text-neutral-500 mt-0.5">Boules de pétanque sur mesure</p>
            </div>
            <div className="flex items-center gap-2">
              {isGlobal && (
                <button onClick={() => setShowCatalogue(true)} className={`${BTN_SECONDARY} h-9 sm:h-8 max-sm:flex-1`}>Catalogue et prix</button>
              )}
              <button onClick={() => setShowNew(true)} disabled={!magasinId}
                title={magasinId ? '' : 'Sélectionnez un magasin pour créer une commande'}
                className={`${BTN_PRIMARY} h-9 sm:h-8 px-4 max-sm:flex-1`}>
                + Nouvelle commande
              </button>
            </div>
          </div>

          {/* Onglets */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
            {tabs.map(([k, label, n]) => (
              <button key={k} onClick={() => { setTab(k); setFilterStatut('') }}
                className={`h-9 px-3 -mb-px border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${tab === k
                  ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-300'}`}>
                {label}{n != null && <span className="ml-1 font-medium text-gray-400 dark:text-neutral-500">{n}</span>}
              </button>
            ))}
          </div>

          {loadError && <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>}

          {tab === 'stats' ? (
            <ObutStats commandes={commandes} magasins={Object.entries(magasins).map(([id, nom]) => ({ id, nom }))} />
          ) : (
            <>
              {tab === 'done' && (
                <p className="text-[11px] text-gray-400 dark:text-neutral-500">
                  Les commandes terminées restent affichées {OBUT_VISIBLE_DAYS} jours. Ensuite, les données du client sont effacées (RGPD)
                  et la commande ne sert plus qu’aux statistiques.
                </p>
              )}

              {/* Compteurs cliquables = filtres */}
              <div className={`grid gap-2 sm:gap-3 ${tab === 'open' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
                {statusCards.map(s => (
                  <StatCard key={s} status={s} value={counts[s]} active={filterStatut === s}
                    onClick={() => setFilterStatut(v => v === s ? '' : s)} />
                ))}
              </div>

              {/* Recherche */}
              <div className="flex flex-wrap items-center gap-2">
                <input className="Input h-9 sm:h-8 flex-1 sm:flex-none sm:!w-72 text-xs" value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Rechercher : client, téléphone, modèle, marquage…" />
                {hasFilters && (
                  <button onClick={() => { setQ(''); setFilterStatut('') }}
                    className="h-8 px-3 rounded-lg text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800">
                    Effacer
                  </button>
                )}
                <span className="ml-auto text-xs text-gray-400 dark:text-neutral-500">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Téléphone : cartes */}
              <div className="md:hidden space-y-2">
                {filtered.map(c => (
                  <OrderCard key={c.id} cmd={c} magasin={showMagasin ? magasins[c.magasinId] : null}
                    onOpen={() => setActiveId(c.id)} onChangeStatut={s => changeStatut(c, s)} />
                ))}
                {filtered.length === 0 && <p className="py-8 text-center text-xs text-gray-400 dark:text-neutral-500">{empty}</p>}
              </div>

              {/* Ordinateur : tableau */}
              <div className="hidden md:block rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-neutral-800 text-left">
                        {['Client', 'Boules', 'Marquage', 'Total TTC / reste', 'Statut', 'Vendeur', ...(showMagasin ? ['Magasin'] : [])].map((h, i) => (
                          <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide whitespace-nowrap ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(c => {
                        const total = c.totalTTC ?? obutTotal(c)
                        const reste = c.resteARegler ?? obutRemaining(c)
                        const acompte = parseEuro(c.acompte)
                        return (
                          <tr key={c.id} onClick={() => setActiveId(c.id)}
                            className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors align-top">
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <p className="font-medium text-gray-900 dark:text-white">{obutClientName(c) || 'Client anonymisé'}</p>
                              <p className="text-gray-500 dark:text-neutral-400">{c.clientTel || ''}</p>
                              <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtYmd(c.dateCommande)}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{c.modele || '—'}</p>
                              {specs(c) && <p className="text-[11px] text-gray-500 dark:text-neutral-400">{specs(c)}</p>}
                            </td>
                            <td className="px-3 py-2.5 max-w-[200px]">
                              {c.marquage ? <>
                                <p className="text-gray-800 dark:text-neutral-200 truncate">« {c.marquage} »</p>
                                <p className="text-[11px] text-gray-400 dark:text-neutral-500 truncate">{c.marquageLabel || (c.marquageType === 'stylisee' ? 'Stylisé' : 'Classique')}</p>
                              </> : <span className="text-gray-400 dark:text-neutral-500">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                              <p className="text-gray-800 dark:text-neutral-200 font-medium">{formatEuro(total)}</p>
                              {acompte > 0 && <p className="text-[11px] text-gray-500 dark:text-neutral-400">acompte {formatEuro(acompte)} · reste {formatEuro(reste)}</p>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <StatusSelect value={obutStatus(c)} onChange={s => changeStatut(c, s)} />
                              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-neutral-500">{sinceLabel(obutStatusSince(c))}</p>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{c.vendeur || c.etabliePar || '—'}</td>
                            {showMagasin && <td className="px-3 py-2.5 text-gray-500 dark:text-neutral-400 whitespace-nowrap">{magasins[c.magasinId] || '—'}</td>}
                          </tr>
                        )
                      })}
                      {filtered.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-gray-400 dark:text-neutral-500">{empty}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {active && (
        <OrderSheet key={active.id} cmd={active} catalogue={catalogue} staff={staff}
          magasinNom={showMagasin ? magasins[active.magasinId] : null} canDelete={canDelete}
          onClose={() => setActiveId(null)} onChangeStatut={s => changeStatut(active, s)}
          onSave={form => saveOrder(active, form)} onDelete={() => removeOrder(active)} />
      )}
      {showNew && <NewOrder catalogue={catalogue} staff={staff} onSubmit={createOrder} onClose={() => setShowNew(false)} />}
      {showCatalogue && <CatalogueModal items={catalogueDocs} onClose={() => setShowCatalogue(false)} />}
    </div>
  )
}
