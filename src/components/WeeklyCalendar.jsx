import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import { safeUrl } from '../lib/security'
import { isOpVisibleFor } from '../lib/opSearch'
import { formatPhone, phoneDigits, rdvClientErrors, ticketPrefill } from '../lib/calendarEvents'
import CalendarSettings from './CalendarSettings'
import Portal from './Portal'

/* ── Constants ──────────────────────────────────────────────────────────────── */
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'jun.', 'jul.', 'aoû.', 'sep.', 'oct.', 'nov.', 'déc.']
const DAYS_KEYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// pill : pastille (légende, fenêtre) · chip : événement dans la grille (fond clair + barre de couleur)
const EVENT_TYPES = {
  rdv_client: {
    label: 'RDV client', dot: 'bg-blue-500',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    chip: 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-500/15 dark:border-blue-400 dark:text-blue-100',
  },
  op_commerciale: {
    label: 'Op. commerciale', dot: 'bg-amber-500',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    chip: 'bg-amber-50 border-amber-500 text-amber-950 dark:bg-amber-500/15 dark:border-amber-400 dark:text-amber-100',
  },
  teams: {
    label: 'Réunion Teams', dot: 'bg-violet-500',
    pill: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    chip: 'bg-violet-50 border-violet-500 text-violet-950 dark:bg-violet-500/15 dark:border-violet-400 dark:text-violet-100',
  },
  rdv_perso: {
    label: 'RDV personnel', dot: 'bg-slate-500',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    chip: 'bg-slate-100 border-slate-500 text-slate-900 dark:bg-slate-500/20 dark:border-slate-400 dark:text-slate-100',
  },
  ticket_rendu: {
    label: 'Rendu vélo', dot: 'bg-emerald-500',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    chip: 'bg-emerald-50 border-emerald-500 text-emerald-950 dark:bg-emerald-500/15 dark:border-emerald-400 dark:text-emerald-100',
  },
  flocage: {
    label: 'Flocage', dot: 'bg-pink-500',
    pill: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    chip: 'bg-pink-50 border-pink-500 text-pink-950 dark:bg-pink-500/15 dark:border-pink-400 dark:text-pink-100',
  },
  planning_shift: {
    label: 'Planning', dot: 'bg-teal-500',
    pill: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  },
}

// Planning de l'équipe : une pastille par situation
const PLANNING_KINDS = {
  present: { label: 'Présent', dot: 'bg-teal-500' },
  ecole: { label: 'École', dot: 'bg-lime-500' },
  cp: { label: 'Congé payé', dot: 'bg-rose-500' },
}

/* ── Date helpers ─────────────────────────────────────────────────────────── */
function getWeekDays(ref) {
  const d = new Date(ref)
  const dow = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    return day
  })
}

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function isToday(d) { return toDateStr(d) === toDateStr(new Date()) }
function fmtWeekRange(days) {
  const [s, e] = [days[0], days[6]]
  if (s.getMonth() === e.getMonth())
    return `${s.getDate()} – ${e.getDate()} ${MONTHS_FR[e.getMonth()]} ${e.getFullYear()}`
  return `${s.getDate()} ${MONTHS_FR[s.getMonth()]} – ${e.getDate()} ${MONTHS_FR[e.getMonth()]} ${e.getFullYear()}`
}

function fmtDateLong(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAYS_KEYS[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function getDayKey(dateStr) {
  return DAYS_KEYS[new Date(dateStr + 'T12:00:00').getDay()]
}

/* ── EventModal ─────────────────────────────────────────────────────────────── */
const LABEL = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'
const INVALID = '!border-red-400 dark:!border-red-500/70'

function Field({ label, required, error, hint, className = '', children }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className={LABEL}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      {children}
      {error
        ? <span className="block text-[11px] text-red-600 dark:text-red-400">{error}</span>
        : hint && <span className="block text-[11px] text-gray-400 dark:text-neutral-500">{hint}</span>}
    </label>
  )
}

function TransformButton({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full h-9 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
      Créer la fiche atelier
    </button>
  )
}

function EventModal({ event, defaultDate, onClose, onSave, onDelete, onTransform, canEdit, isGlobal, profile }) {
  const isNew = !event?.id
  const isTicket = event?.type === 'ticket_rendu'

  const creatableTypes = useMemo(() => {
    const types = ['rdv_client']
    if (isGlobal) types.push('op_commerciale', 'teams', 'rdv_perso')
    else if (profile?.role === 'directeurmag') types.push('rdv_perso')
    return types
  }, [isGlobal, profile])

  const [form, setForm] = useState({
    title: event?.title || '',
    type: event?.type || creatableTypes[0],
    date: event?.date || defaultDate || toDateStr(new Date()),
    startTime: event?.startTime || '',
    endTime: event?.endTime || '',
    // Anciens RDV client : le titre était le plus souvent le nom du client
    customerName: event?.customerName ?? (event?.type === 'rdv_client' ? event.title : ''),
    customerPhone: event?.customerPhone || '',
    description: event?.description || '',
    teamsLink: event?.teamsLink || '',
    rayonType: event?.rayonType || (RAYON_TYPES.includes(profile?.role) ? profile.role : ''),
    teamsRayons: event?.teamsRayons || [],
    teamsMagasins: event?.teamsMagasins || [],
  })
  const [magasins, setMagasins] = useState([])
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  const isRdvClient = form.type === 'rdv_client'
  const errors = isRdvClient ? rdvClientErrors(form) : (form.title.trim() ? {} : { title: 'Le titre est obligatoire.' })
  const shown = tried ? errors : {}

  useEffect(() => {
    if (form.type !== 'teams') return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [form.type])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(errors).length) return
    setSaving(true)
    try {
      const result = await onSave(form)
      if (result !== false) onClose()
    } finally { setSaving(false) }
  }

  function transform(values) { onTransform(values); onClose() }

  const typeInfo = EVENT_TYPES[event?.type]

  return (
    <Portal>
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 min-w-0">
            {!isNew && typeInfo && (
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${typeInfo.pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${typeInfo.dot}`} />
                {typeInfo.label}
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {isNew ? (creatableTypes.length === 1 ? `Nouveau ${EVENT_TYPES[creatableTypes[0]].label}` : 'Nouvel événement') : isTicket ? event.title : (canEdit ? 'Modifier' : event.title)}
            </span>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Ticket (lecture seule) */}
        {isTicket ? (
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-500 dark:text-neutral-400">{event.description || 'Pas de description.'}</p>
            <div className="flex gap-2 text-xs text-gray-400">
              <span>{event.date}</span>
              {event.startTime && <span>· {event.startTime}</span>}
            </div>
          </div>
        ) : !isNew && !canEdit ? (
          /* Vue lecture */
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400">Date</span><p className="font-medium text-gray-900 dark:text-white mt-0.5">{fmtDateLong(event.date)}{event.startTime && ` · ${event.startTime}${event.endTime ? ` – ${event.endTime}` : ''}`}</p></div>
              {event.rayonType && <div><span className="text-gray-400">Rayon</span><p className="font-medium text-gray-900 dark:text-white mt-0.5">{RAYON_TYPE_LABELS[event.rayonType] || event.rayonType}</p></div>}
              {event.type === 'rdv_client' && event.customerName && <div><span className="text-gray-400">Client</span><p className="font-medium text-gray-900 dark:text-white mt-0.5">{event.customerName}</p></div>}
              {event.type === 'rdv_client' && event.customerPhone && (
                <div><span className="text-gray-400">Téléphone</span>
                  <p className="mt-0.5"><a href={`tel:${phoneDigits(event.customerPhone)}`} className="font-medium text-gray-900 dark:text-white hover:underline">{formatPhone(event.customerPhone)}</a></p>
                </div>
              )}
            </div>
            {event.description && (
              <div className="text-xs">
                {event.type === 'rdv_client' && <span className="text-gray-400">Problème</span>}
                <p className="text-gray-600 dark:text-neutral-300 whitespace-pre-line mt-0.5">{event.description}</p>
              </div>
            )}
            {event.teamsLink && (
              <a href={safeUrl(event.teamsLink)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 hover:underline">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                Rejoindre la réunion Teams
              </a>
            )}
            {event.type === 'rdv_client' && onTransform && (
              <div className="pt-3 border-t border-gray-100 dark:border-neutral-800">
                <TransformButton onClick={() => transform(event)} />
              </div>
            )}
          </div>
        ) : (
          /* Formulaire */
          <form onSubmit={handleSave} noValidate className="p-5 space-y-4">
            {/* Type */}
            {isNew && creatableTypes.length > 1 && (
              <div className="space-y-1.5">
                <span className={LABEL}>Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {creatableTypes.map(t => (
                    <button key={t} type="button" onClick={() => set('type', t)}
                      className={['h-7 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors border',
                        form.type === t
                          ? `${EVENT_TYPES[t].pill} border-transparent`
                          : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                      ].join(' ')}>
                      <span className={`h-1.5 w-1.5 rounded-full ${EVENT_TYPES[t].dot}`} />
                      {EVENT_TYPES[t].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Client (RDV client) ou titre */}
            {isRdvClient ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nom et prénom du client" required error={shown.customerName}>
                  <input className={`Input ${shown.customerName ? INVALID : ''}`} value={form.customerName} autoFocus={isNew}
                    placeholder="Ex. Marie Dubois" autoComplete="off" onChange={e => set('customerName', e.target.value)} />
                </Field>
                <Field label="Téléphone" required error={shown.customerPhone}>
                  <input type="tel" inputMode="tel" className={`Input ${shown.customerPhone ? INVALID : ''}`} value={form.customerPhone}
                    placeholder="Ex. 06 12 34 56 78" autoComplete="off" onChange={e => set('customerPhone', e.target.value)}
                    onBlur={e => set('customerPhone', formatPhone(e.target.value))} />
                </Field>
              </div>
            ) : (
              <Field label="Titre" required error={shown.title}>
                <input className={`Input ${shown.title ? INVALID : ''}`} value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
              </Field>
            )}

            {/* Date + Heures */}
            <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Field label="Date" className="col-span-2 sm:col-span-1">
                <input type="date" className="Input" value={form.date} onChange={e => set('date', e.target.value)} />
              </Field>
              <Field label="Début">
                <input type="time" className="Input" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
              </Field>
              <Field label="Fin">
                <input type="time" className="Input" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
              </Field>
            </div>

            {/* Rayon (op_commerciale uniquement, si global) */}
            {form.type === 'op_commerciale' && isGlobal && (
              <Field label="Rayon concerné">
                <select className="Input" value={form.rayonType} onChange={e => set('rayonType', e.target.value)}>
                  <option value="">Tous les rayons</option>
                  {RAYON_TYPES.map(t => <option key={t} value={t}>{RAYON_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
            )}

            {/* Lien Teams + ciblage rayon/magasin */}
            {form.type === 'teams' && (
              <div className="space-y-3">
                <Field label="Lien Teams">
                  <input type="url" className="Input" placeholder="https://teams.microsoft.com/…" value={form.teamsLink} onChange={e => set('teamsLink', e.target.value)} />
                </Field>
                <div className="space-y-1.5">
                  <span className={LABEL}>Rayons concernés</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button"
                      onClick={() => set('teamsRayons', [])}
                      className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors',
                        form.teamsRayons.length === 0 ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent' : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                      ].join(' ')}>
                      Tous
                    </button>
                    {RAYON_TYPES.map(r => {
                      const active = form.teamsRayons.includes(r)
                      return (
                        <button key={r} type="button"
                          onClick={() => set('teamsRayons', active ? form.teamsRayons.filter(x => x !== r) : [...form.teamsRayons, r])}
                          className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors',
                            active ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent' : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                          ].join(' ')}>
                          {RAYON_TYPE_LABELS[r]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {magasins.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={LABEL}>Magasins concernés</span>
                      <span className="text-[11px] text-gray-400 dark:text-neutral-500">
                        {form.teamsMagasins.length === 0 ? 'Tous' : `${form.teamsMagasins.length} sélectionné${form.teamsMagasins.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {magasins.map(m => {
                        const active = form.teamsMagasins.includes(m.id)
                        return (
                          <button key={m.id} type="button"
                            onClick={() => set('teamsMagasins', active ? form.teamsMagasins.filter(x => x !== m.id) : [...form.teamsMagasins, m.id])}
                            className={['flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors text-left',
                              active ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800 font-semibold text-gray-900 dark:text-white' : 'border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                            ].join(' ')}>
                            <span className={['h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0',
                              active ? 'bg-gray-900 border-gray-900 dark:bg-white dark:border-white' : 'border-gray-300 dark:border-neutral-600',
                            ].join(' ')}>
                              {active && <svg className="h-2 w-2 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            {m.nom}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description (problème détaillé pour un RDV client) */}
            {isRdvClient ? (
              <Field label="Description détaillée du problème" required error={shown.description}
                hint="Symptômes, pièces concernées, demande du client… Reprise telle quelle dans la fiche atelier.">
                <textarea rows={4} className={`Input resize-y text-xs ${shown.description ? INVALID : ''}`} value={form.description}
                  placeholder="Ex. Freins avant qui frottent, vitesses qui sautent sur les petits pignons, le client veut aussi un contrôle général."
                  onChange={e => set('description', e.target.value)} />
              </Field>
            ) : (
              <Field label="Description">
                <textarea className="Input resize-none h-16 text-xs" value={form.description} onChange={e => set('description', e.target.value)} />
              </Field>
            )}

            {!isNew && event?.type === 'rdv_client' && onTransform && (
              <TransformButton onClick={() => transform({ ...event, ...form })} />
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <div>
                {!isNew && onDelete && (
                  <button type="button" onClick={() => { onDelete(event); onClose() }}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">
                    Supprimer
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
    </Portal>
  )
}

/* ── Éléments de la grille ──────────────────────────────────────────────────── */
function EventChip({ ev, onClick }) {
  const t = EVENT_TYPES[ev.type]
  const time = ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : null
  const top = [time, ev.label].filter(Boolean).join(' · ')
  const sub = ev.subtitle ?? (ev.type === 'rdv_client' ? ev.description : null)
  const tooltip = [
    [t?.label, ev.label].filter(Boolean).join(' · '),
    time, ev.title,
    ev.type === 'rdv_client' && ev.customerPhone ? formatPhone(ev.customerPhone) : null,
    sub,
  ].filter(Boolean).join('\n')
  return (
    <button onClick={onClick} title={tooltip}
      className={`w-full text-left rounded-md border-l-[3px] pl-1.5 pr-1 py-1 text-[11px] leading-snug transition hover:brightness-95 dark:hover:brightness-125 ${t?.chip || ''}`}>
      {top && <span className="block text-[10px] font-semibold tabular-nums opacity-70 truncate">{top}</span>}
      <span className="font-semibold line-clamp-2 break-words">{ev.title}</span>
      {sub && <span className="text-[10px] opacity-75 line-clamp-2 break-words">{sub}</span>}
    </button>
  )
}

function PlanningLine({ name, times, isCp, isEco }) {
  const kind = PLANNING_KINDS[isCp ? 'cp' : isEco ? 'ecole' : 'present']
  const detail = isCp ? 'Congé payé' : `${times}${isEco ? ' · École' : ''}`
  return (
    <div title={`${name} · ${detail}`} className="flex items-start gap-1.5 px-1 py-0.5 text-[11px] leading-snug">
      <span className={`mt-[5px] h-1.5 w-1.5 rounded-full shrink-0 ${kind.dot}`} />
      <span className="min-w-0 break-words">
        <span className="font-semibold text-gray-800 dark:text-neutral-100">{name.split(' ')[0]}</span>{' '}
        <span className="text-gray-500 dark:text-neutral-400 tabular-nums">{isCp ? 'CP' : times}</span>
        {isEco && <span className="text-lime-700 dark:text-lime-400"> · École</span>}
      </span>
    </div>
  )
}

function LegendItem({ active, onClick, dot, label }) {
  return (
    <button onClick={onClick} title={active ? `Masquer : ${label}` : `Afficher : ${label}`}
      className={['h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium transition-colors hover:bg-gray-100 dark:hover:bg-neutral-800',
        active ? 'text-gray-600 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-600 line-through opacity-60'].join(' ')}>
      <span className={`h-2.5 w-2.5 rounded-sm ${dot}`} />
      {label}
    </button>
  )
}

/* ── WeeklyCalendar ─────────────────────────────────────────────────────────── */
export default function WeeklyCalendar({ magasinId }) {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const navigate = useNavigate()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const isRayonRole = RAYON_TYPES.includes(profile?.role)
  const isChaussure = profile?.role === 'chaussure'

  const [refDate, setRefDate] = useState(new Date())
  const [calendarView, setCalendarView] = useState('store') // 'store' | 'personal'
  const [events, setEvents] = useState([])
  const [tickets, setTickets] = useState([])
  const [opEvents, setOpEvents] = useState([])
  const [flocageEvents, setFlocageEvents] = useState([])
  const [activeFilters, setActiveFilters] = useState(new Set(Object.keys(EVENT_TYPES)))
  const [modal, setModal] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rayonSettings, setRayonSettings] = useState({}) // { [rayonType]: { quotas: {...} } }
  const [pendingForm, setPendingForm] = useState(null)
  const [quotaWarning, setQuotaWarning] = useState(null) // { rayonType, quota, count }

  const isPersonal = isGlobal && calendarView === 'personal'

  const days = useMemo(() => getWeekDays(refDate), [refDate])

  /* Chargement des événements de la semaine */
  useEffect(() => {
    const start = toDateStr(days[0])
    const end = toDateStr(days[6])
    let q
    if (isPersonal) {
      q = query(
        collection(db, 'calendar_events'),
        where('createdBy', '==', user.uid),
        where('date', '>=', start),
        where('date', '<=', end),
      )
    } else {
      if (!magasinId) return
      q = query(
        collection(db, 'calendar_events'),
        where('magasinId', '==', magasinId),
        where('date', '>=', start),
        where('date', '<=', end),
      )
    }
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [magasinId, isPersonal, user.uid, days[0].getTime()])

  /* Chargement des OPs commerciales qui chevauchent la semaine */
  useEffect(() => {
    if (isPersonal) { setOpEvents([]); return }
    const start = toDateStr(days[0])
    const end = toDateStr(days[6])
    const q = query(
      collection(db, 'op_commerciales'),
      where('dateFin', '>=', start),
    )
    return onSnapshot(q, snap => {
      const generated = []
      for (const d of snap.docs) {
        const op = { id: d.id, ...d.data() }
        if (op.dateDebut > end) continue

        if (!isOpVisibleFor(op, profile, magasinId)) continue // même règle que la page OP

        if (op.dateDebut >= start && op.dateDebut <= end) {
          generated.push({
            id: `op_${op.id}_start`,
            type: 'op_commerciale',
            title: op.nom,
            label: 'Début d’OP',
            date: op.dateDebut,
            opId: op.id,
            _opPin: true,
          })
        }
        if (op.dateFin >= start && op.dateFin <= end) {
          generated.push({
            id: `op_${op.id}_end`,
            type: 'op_commerciale',
            title: op.nom,
            label: 'Fin d’OP',
            date: op.dateFin,
            opId: op.id,
            _opPin: true,
          })
        }
      }
      setOpEvents(generated)
    })
  }, [isPersonal, magasinId, profile, days[0].getTime()])

  /* Chargement des tickets avec dueDate dans la semaine */
  useEffect(() => {
    if (!magasinId || isPersonal || isChaussure) { setTickets([]); return }
    const start = toDateStr(days[0])
    const end = toDateStr(days[6])
    const q = query(
      collection(db, 'tickets'),
      where('magasinId', '==', magasinId),
      where('dueDate', '>=', start),
      where('dueDate', '<=', end),
    )
    return onSnapshot(q, snap => {
      setTickets(snap.docs
        .filter(d => d.data().status !== 'Closed')
        .map(d => {
          const data = d.data()
          return {
            id: `ticket_${d.id}`,
            type: 'ticket_rendu',
            title: data.customerName || 'Vélo',
            subtitle: [data.bikeBrand, data.bikeModel].filter(Boolean).join(' ') || null,
            date: data.dueDate,
            ticketId: d.id,
          }
        }))
    })
  }, [magasinId, isPersonal, isChaussure, days[0].getTime()])

  /* Chargement des flocages */
  useEffect(() => {
    if (!magasinId || isPersonal || !isChaussure) { setFlocageEvents([]); return }
    const start = toDateStr(days[0])
    const end = toDateStr(days[6])
    const q = query(
      collection(db, 'flocage_commandes'),
      where('magasinId', '==', magasinId),
      where('dateDispo', '>=', start),
      where('dateDispo', '<=', end),
      where('status', '!=', 'fait'),
    )
    return onSnapshot(q, snap => {
      setFlocageEvents(snap.docs.map(d => {
        const data = d.data()
        const haut = data.lignes?.find(l => l.position === 'haut')
        const numero = data.lignes?.find(l => l.position === 'numero')
        return {
          id: `flocage_${d.id}`,
          type: 'flocage',
          title: data.clientNom || 'Flocage',
          subtitle: [haut?.texte, numero?.texte].filter(Boolean).join(' · ') || null,
          date: data.dateDispo,
          flocageId: d.id,
          _opPin: true,
        }
      }))
    })
  }, [magasinId, isPersonal, isChaussure, days[0].getTime()])

  /* Chargement des paramètres rayon */
  useEffect(() => {
    if (!magasinId || isPersonal) return
    const col = collection(db, 'magasins', magasinId, 'rayon_settings')
    return onSnapshot(col, snap => {
      setRayonSettings(prev => {
        const next = { ...prev }
        snap.docs.forEach(d => { next[d.id] = d.data() })
        return next
      })
    })
  }, [magasinId, isPersonal])

  /* Fusion events + tickets + OPs + flocages, filtrage par rôle */
  const allEvents = useMemo(() => {
    const merged = [...events, ...tickets, ...opEvents, ...flocageEvents]
    return merged.filter(ev => {
      if (!activeFilters.has(ev.type)) return false

      // Planning shifts : filtrage par rayon
      if (ev.type === 'planning_shift') {
        if (profile?.role === 'directeurgen') return true
        if (profile?.role === 'directeurmag') return true
        if (profile?.role === 'acheteur') return (profile?.rayons || []).includes(ev.rayonType)
        return ev.rayonType === profile?.role
      }

      if (isRayonRole) {
        if (ev.type === 'rdv_client') return ev.rayonType === profile.role
        if (ev.type === 'op_commerciale') return !ev.rayonType || ev.rayonType === profile.role
        if (ev.type === 'rdv_perso') return ev.createdBy === user.uid
        if (ev.type === 'teams') {
          const rayonOk = !ev.teamsRayons || ev.teamsRayons.includes(profile.role)
          const magasinOk = !ev.teamsMagasins || ev.teamsMagasins.includes(profile.magasinId)
          return rayonOk && magasinOk
        }
        return true
      }
      if (ev.type === 'teams' && profile?.role === 'directeurmag') {
        return !ev.teamsMagasins || ev.teamsMagasins.includes(profile.magasinId)
      }
      return true
    })
  }, [events, tickets, opEvents, flocageEvents, activeFilters, isRayonRole, profile, user])

  /* Events groupés par date (hors planning_shift, géré séparément) */
  const byDate = useMemo(() => {
    const map = {}
    for (const ev of allEvents) {
      if (ev.type === 'planning_shift') continue
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        if (a._opPin && !b._opPin) return -1
        if (!a._opPin && b._opPin) return 1
        return (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      })
    }
    return map
  }, [allEvents])

  /* Planning shifts groupés par date et employé */
  const planningByDate = useMemo(() => {
    const map = {}
    for (const ev of allEvents) {
      if (ev.type !== 'planning_shift') continue
      if (!map[ev.date]) map[ev.date] = {}
      const key = ev.employeeName || ev.title || '?'
      if (!map[ev.date][key]) map[ev.date][key] = []
      map[ev.date][key].push(ev)
    }
    const result = {}
    for (const [date, emps] of Object.entries(map)) {
      result[date] = Object.entries(emps)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, shifts]) => {
          const workShifts = shifts.filter(s => s.startTime)
          const isCp  = shifts.some(s => /^cp$/i.test(s.activityCode || ''))
          const isEco = !isCp && shifts.some(s => /eco/i.test(s.activityCode || ''))
          const times = workShifts
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map(s => `${s.startTime}–${s.endTime}`)
            .join(' · ')
          return { name, times, isCp, isEco }
        })
        .filter(entry => entry.times)
    }
    return result
  }, [allEvents])

  /* Types visibles pour les filtres */
  const visibleTypes = useMemo(() => {
    if (isPersonal) return ['rdv_perso']
    const perso = isGlobal || profile?.role === 'directeurmag' ? ['rdv_perso'] : []
    if (isChaussure) return ['rdv_client', 'op_commerciale', 'teams', 'flocage', 'planning_shift']
    return ['rdv_client', 'op_commerciale', 'teams', ...perso, 'ticket_rendu', 'planning_shift']
  }, [isPersonal, isGlobal, isChaussure, profile])

  /* Types créables */
  const creatableTypes = useMemo(() => {
    if (isPersonal) return ['rdv_perso']
    if (isGlobal) return ['rdv_client', 'op_commerciale', 'teams', 'rdv_perso']
    if (profile?.role === 'directeurmag') return ['rdv_client', 'rdv_perso']
    return ['rdv_client']
  }, [isGlobal, isPersonal, profile])

  function toggleFilter(type) {
    setActiveFilters(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  function prevWeek() { const d = new Date(refDate); d.setDate(d.getDate() - 7); setRefDate(d) }
  function nextWeek() { const d = new Date(refDate); d.setDate(d.getDate() + 7); setRefDate(d) }

  async function actualSave(form) {
    const isRdvClient = form.type === 'rdv_client'
    const data = {
      title: isRdvClient ? form.customerName.trim() : form.title.trim(),
      customerName: isRdvClient ? form.customerName.trim() : null,
      customerPhone: isRdvClient ? formatPhone(form.customerPhone) : null,
      type: form.type,
      date: form.date,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      description: form.description.trim() || null,
      teamsLink: form.teamsLink || null,
      teamsRayons: form.type === 'teams' && form.teamsRayons?.length ? form.teamsRayons : null,
      teamsMagasins: form.type === 'teams' && form.teamsMagasins?.length ? form.teamsMagasins : null,
      rayonType: form.type === 'rdv_client' && isRayonRole
        ? profile.role
        : (form.type === 'op_commerciale' ? (form.rayonType || null) : null),
      magasinId: isPersonal ? null : magasinId,
      createdBy: user.uid,
    }
    if (modal?.event?.id) {
      await updateDoc(doc(db, 'calendar_events', modal.event.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'calendar_events'), { ...data, createdAt: serverTimestamp() })
    }
  }

  async function handleSave(form) {
    // Vérification quota pour les nouveaux RDV client
    if (!modal?.event?.id && form.type === 'rdv_client') {
      const rayonType = isRayonRole ? profile.role : (form.rayonType || null)
      if (rayonType) {
        const dayKey = getDayKey(form.date)
        const quota = rayonSettings[rayonType]?.quotas?.[dayKey]
        if (quota != null && quota !== '' && Number(quota) >= 0) {
          const count = events.filter(ev =>
            ev.type === 'rdv_client' &&
            ev.date === form.date &&
            ev.rayonType === rayonType
          ).length
          if (count >= Number(quota)) {
            setPendingForm(form)
            setQuotaWarning({ rayonType, quota: Number(quota), count })
            return false
          }
        }
      }
    }
    await actualSave(form)
  }

  async function handleQuotaConfirm() {
    if (!pendingForm) return
    try {
      await actualSave(pendingForm)
    } finally {
      setPendingForm(null)
      setQuotaWarning(null)
      setModal(null)
    }
  }

  async function handleDelete(ev) {
    if (!ev?.id || ev.type === 'ticket_rendu') return
    if (!confirm(`Supprimer "${ev.title}" ?`)) return
    await deleteDoc(doc(db, 'calendar_events', ev.id))
  }

  function handleTransformToTicket(ev) {
    navigate('/tickets', {
      state: {
        openForm: true,
        initialValues: ticketPrefill(ev),
      },
    })
  }

  function canEditEvent(ev) {
    if (!ev || ev.type === 'ticket_rendu' || ev.type === 'planning_shift') return false
    if (isGlobal) return true
    if (profile?.role === 'directeurmag') return true
    return ev.createdBy === user.uid
  }

  /* Quota pour un jour donné (rayon du user) */
  function getDayQuotaInfo(dateStr) {
    if (!isRayonRole) return null
    const rayonType = profile.role
    const settings = rayonSettings[rayonType]
    if (!settings?.quotas) return null
    const dayKey = getDayKey(dateStr)
    const quota = settings.quotas[dayKey]
    if (quota == null || quota === '' || Number(quota) < 0) return null
    const count = events.filter(ev =>
      ev.type === 'rdv_client' &&
      ev.date === dateStr &&
      ev.rayonType === rayonType
    ).length
    return { count, quota: Number(quota) }
  }

  function openEvent(ev, dateStr) {
    if (ev.type === 'ticket_rendu') { navigate(`/tickets?open=${ev.ticketId}`); return }
    if (ev.opId) { navigate(`/operations/${ev.opId}`); return }
    if (ev.type === 'flocage') { navigate('/flocage'); return }
    setModal({ event: ev, date: dateStr })
  }

  // Événements puis planning de l'équipe d'un jour
  function dayItems(dateStr) {
    const dayEvents = byDate[dateStr] || []
    const planning = planningByDate[dateStr] || []
    return (
      <>
        {dayEvents.map(ev => (
          <EventChip key={ev.id} ev={ev} onClick={e => { e.stopPropagation(); openEvent(ev, dateStr) }} />
        ))}
        {planning.length > 0 && (
          <div className={['space-y-0.5', dayEvents.length ? 'pt-1.5 mt-1.5 border-t border-dashed border-gray-200 dark:border-neutral-700' : ''].join(' ')}>
            {planning.map(entry => <PlanningLine key={entry.name} {...entry} />)}
          </div>
        )}
      </>
    )
  }

  if (!magasinId) return null

  return (
    <div className="h-full flex flex-col rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">

          {/* Sélecteur magasin / perso */}
          {isGlobal && (
            <div className="flex items-center h-7 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden shrink-0">
              <button
                onClick={() => setCalendarView('store')}
                className={['h-full px-3 text-[11px] font-semibold transition-colors',
                  calendarView === 'store'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                ].join(' ')}>
                Magasin
              </button>
              <button
                onClick={() => setCalendarView('personal')}
                className={['h-full px-3 text-[11px] font-semibold transition-colors border-l border-gray-200 dark:border-neutral-700',
                  calendarView === 'personal'
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                ].join(' ')}>
                Personnel
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-[11px] sm:text-xs font-semibold text-gray-700 dark:text-neutral-300 px-1 sm:px-0 sm:w-44 text-center whitespace-nowrap">
              {fmtWeekRange(days)}
            </span>
            <button onClick={nextWeek} className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <button onClick={() => setRefDate(new Date())}
              className="h-7 px-2 sm:px-2.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors sm:ml-1">
              Aujourd'hui
            </button>
          </div>

        </div>

        <div className="flex items-center gap-2">
          {/* Bouton paramètres (visible à tous sauf en vue personnelle) */}
          {!isPersonal && (
            <button
              onClick={() => setSettingsOpen(true)}
              title="Paramètres du calendrier"
              className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {creatableTypes.length > 0 && (
            <button onClick={() => setModal({ event: null, date: toDateStr(new Date()) })}
              aria-label="Ajouter un événement"
              className="h-7 min-w-7 px-2 sm:px-3 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
              +<span className="hidden sm:inline"> Événement</span>
            </button>
          )}
        </div>
      </div>

      {/* Téléphone : liste des jours de la semaine */}
      <div className="md:hidden divide-y divide-gray-100 dark:divide-neutral-800">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const empty = !(byDate[dateStr] || []).length && !(planningByDate[dateStr] || []).length
          const today = isToday(day)
          const quotaInfo = getDayQuotaInfo(dateStr)
          return (
            <div key={dateStr} className={['flex gap-3 px-3 py-2.5', today ? 'bg-gray-50/70 dark:bg-neutral-800/30' : ''].join(' ')}>
              <div className="w-10 shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{DAYS_FR[i]}</span>
                <span className={['text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full',
                  today ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-800 dark:text-neutral-200'].join(' ')}>
                  {day.getDate()}
                </span>
                {quotaInfo !== null && (
                  <span className={['text-[9px] font-semibold px-1 py-0.5 rounded-full leading-none whitespace-nowrap',
                    quotaInfo.count >= quotaInfo.quota ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'].join(' ')}>
                    {quotaInfo.count}/{quotaInfo.quota}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {empty
                  ? <button onClick={() => setModal({ event: null, date: dateStr })}
                      className="h-8 text-[11px] text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300">
                      Rien de prévu · <span className="font-semibold">Ajouter</span>
                    </button>
                  : dayItems(dateStr)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Ordinateur : grille hebdomadaire */}
      <div className="hidden md:grid flex-1 min-h-0 grid-cols-7 divide-x divide-gray-100 dark:divide-neutral-800 overflow-hidden">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const dayEvents = byDate[dateStr] || []
          const planning = planningByDate[dateStr] || []
          const today = isToday(day)
          const quotaInfo = getDayQuotaInfo(dateStr)

          return (
            <div key={dateStr} className={['flex flex-col min-w-0 overflow-hidden', today ? 'bg-gray-50/70 dark:bg-neutral-800/30' : ''].join(' ')}>
              {/* En-tête du jour */}
              <div className="flex flex-col items-center py-2 border-b border-gray-100 dark:border-neutral-800 gap-0.5">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
                  {DAYS_FR[i]}
                </span>
                <span className={['text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full',
                  today
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-800 dark:text-neutral-200',
                ].join(' ')}>
                  {day.getDate()}
                </span>
                {/* Indicateur quota RDV */}
                {quotaInfo !== null && (
                  <span className={['text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                    quotaInfo.count >= quotaInfo.quota
                      ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'
                      : quotaInfo.count >= quotaInfo.quota - 1 && quotaInfo.quota > 1
                        ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400',
                  ].join(' ')}>
                    {quotaInfo.count}/{quotaInfo.quota} rdv
                  </span>
                )}
              </div>

              {/* Événements puis planning de l'équipe */}
              <div
                className="flex-1 p-1.5 space-y-1 overflow-y-auto cursor-pointer group"
                onClick={() => setModal({ event: null, date: dateStr })}
              >
                {dayItems(dateStr)}
                {dayEvents.length === 0 && planning.length === 0 && (
                  <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-gray-300 dark:text-neutral-700">+</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Légende : cliquer sur une couleur la masque ou l'affiche */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-3 py-2 border-t border-gray-100 dark:border-neutral-800">
        {visibleTypes.filter(t => t !== 'planning_shift').map(type => (
          <LegendItem key={type} active={activeFilters.has(type)} onClick={() => toggleFilter(type)}
            dot={EVENT_TYPES[type].dot} label={EVENT_TYPES[type].label} />
        ))}
        {visibleTypes.includes('planning_shift') && (
          <button onClick={() => toggleFilter('planning_shift')}
            title={activeFilters.has('planning_shift') ? 'Masquer le planning' : 'Afficher le planning'}
            className={['h-6 px-2 inline-flex items-center gap-2 rounded-md text-[11px] transition-colors hover:bg-gray-100 dark:hover:bg-neutral-800 sm:ml-1 sm:pl-3 sm:border-l sm:border-gray-200 sm:dark:border-neutral-700 sm:rounded-l-none',
              activeFilters.has('planning_shift') ? 'text-gray-600 dark:text-neutral-300' : 'text-gray-400 dark:text-neutral-600 line-through opacity-60'].join(' ')}>
            <span className="font-semibold">Planning :</span>
            {Object.values(PLANNING_KINDS).map(k => (
              <span key={k.label} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${k.dot}`} />{k.label}
              </span>
            ))}
          </button>
        )}
        {visibleTypes.some(t => !activeFilters.has(t)) && (
          <button onClick={() => setActiveFilters(new Set(Object.keys(EVENT_TYPES)))}
            className="ml-auto h-6 px-2 rounded-md text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
            Tout afficher
          </button>
        )}
      </div>

      {/* Modal événement */}
      {modal !== null && (
        <EventModal
          event={modal.event}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onTransform={handleTransformToTicket}
          canEdit={modal.event ? canEditEvent(modal.event) : true}
          isGlobal={isGlobal}
          profile={profile}
        />
      )}

      {/* Dialog alerte quota dépassé */}
      {quotaWarning && (
        <Portal>
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Quota RDV dépassé</p>
                <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
                  Le rayon <span className="font-medium text-gray-700 dark:text-neutral-300">{RAYON_TYPE_LABELS[quotaWarning.rayonType] || quotaWarning.rayonType}</span> a atteint son quota de{' '}
                  <span className="font-medium text-gray-700 dark:text-neutral-300">{quotaWarning.quota} RDV client</span> pour ce jour
                  ({quotaWarning.count} déjà planifié{quotaWarning.count > 1 ? 's' : ''}).
                  Voulez-vous quand même créer ce rendez-vous ?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setQuotaWarning(null); setPendingForm(null) }}
                className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800"
              >
                Annuler
              </button>
              <button
                onClick={handleQuotaConfirm}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                Créer quand même
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Panel paramètres calendrier */}
      <CalendarSettings
        magasinId={magasinId}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
