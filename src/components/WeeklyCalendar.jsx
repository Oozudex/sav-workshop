import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import CalendarSettings from './CalendarSettings'

/* ── Constants ──────────────────────────────────────────────────────────────── */
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS_FR = ['jan.', 'fév.', 'mar.', 'avr.', 'mai', 'jun.', 'jul.', 'aoû.', 'sep.', 'oct.', 'nov.', 'déc.']
const DAYS_KEYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const EVENT_TYPES = {
  rdv_client: { label: 'RDV Client', pill: 'bg-blue-100   text-blue-700   dark:bg-blue-500/20   dark:text-blue-300', dot: 'bg-blue-500' },
  op_commerciale: { label: 'Op. Commerciale', pill: 'bg-amber-100  text-amber-700  dark:bg-amber-500/20  dark:text-amber-300', dot: 'bg-amber-500' },
  teams: { label: 'Réunion Teams', pill: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300', dot: 'bg-violet-500' },
  rdv_perso: { label: 'RDV Personnel', pill: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300', dot: 'bg-indigo-500' },
  ticket_rendu: { label: 'Rendu vélo', pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', dot: 'bg-emerald-500' },
  flocage: { label: 'Flocage', pill: 'bg-pink-100   text-pink-700   dark:bg-pink-500/20   dark:text-pink-300', dot: 'bg-pink-500' },
  planning_shift: { label: 'Planning', pill: 'bg-teal-100   text-teal-700   dark:bg-teal-500/20   dark:text-teal-300', dot: 'bg-teal-500' },
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

function getDayKey(dateStr) {
  return DAYS_KEYS[new Date(dateStr + 'T12:00:00').getDay()]
}

/* ── EventModal ─────────────────────────────────────────────────────────────── */
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
    description: event?.description || '',
    teamsLink: event?.teamsLink || '',
    rayonType: event?.rayonType || (RAYON_TYPES.includes(profile?.role) ? profile.role : ''),
    teamsRayons: event?.teamsRayons || [],
    teamsMagasins: event?.teamsMagasins || [],
  })
  const [magasins, setMagasins] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (form.type !== 'teams') return
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [form.type])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const result = await onSave(form)
      if (result !== false) onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            {!isNew && event?.type && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${EVENT_TYPES[event.type]?.pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${EVENT_TYPES[event.type]?.dot}`} />
                {EVENT_TYPES[event.type]?.label}
              </span>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {isNew ? 'Nouvel événement' : isTicket ? event.title : (canEdit ? 'Modifier' : event.title)}
            </span>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
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
              <div><span className="text-gray-400">Date</span><p className="font-medium text-gray-900 dark:text-white mt-0.5">{event.date}{event.startTime && ` · ${event.startTime}${event.endTime ? ` – ${event.endTime}` : ''}`}</p></div>
              {event.rayonType && <div><span className="text-gray-400">Rayon</span><p className="font-medium text-gray-900 dark:text-white mt-0.5">{RAYON_TYPE_LABELS[event.rayonType] || event.rayonType}</p></div>}
            </div>
            {event.description && <p className="text-xs text-gray-500 dark:text-neutral-400">{event.description}</p>}
            {event.teamsLink && (
              <a href={event.teamsLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 hover:underline">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                Rejoindre la réunion Teams
              </a>
            )}
            {event.type === 'rdv_client' && onTransform && (
              <div className="pt-1 border-t border-gray-100 dark:border-neutral-800">
                <button
                  onClick={() => { onTransform(event); onClose() }}
                  className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                  Transformer en fiche atelier
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Formulaire */
          <form onSubmit={handleSave} className="p-5 space-y-4">
            {/* Type */}
            {isNew && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {creatableTypes.map(t => (
                    <button key={t} type="button" onClick={() => set('type', t)}
                      className={['h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors border',
                        form.type === t
                          ? `${EVENT_TYPES[t].pill} border-transparent`
                          : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                      ].join(' ')}>
                      {EVENT_TYPES[t].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Titre */}
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Titre *</span>
              <input className="Input" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
            </label>

            {/* Date + Heures */}
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Date</span>
                <input type="date" className="Input" value={form.date} onChange={e => set('date', e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Début</span>
                <input type="time" className="Input" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Fin</span>
                <input type="time" className="Input" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
              </label>
            </div>

            {/* Rayon (op_commerciale uniquement, si global) */}
            {form.type === 'op_commerciale' && isGlobal && (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rayon concerné</span>
                <select className="Input" value={form.rayonType} onChange={e => set('rayonType', e.target.value)}>
                  <option value="">Tous les rayons</option>
                  {RAYON_TYPES.map(t => <option key={t} value={t}>{RAYON_TYPE_LABELS[t]}</option>)}
                </select>
              </label>
            )}

            {/* Lien Teams + ciblage rayon/magasin */}
            {form.type === 'teams' && (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Lien Teams</span>
                  <input type="url" className="Input" placeholder="https://teams.microsoft.com/…" value={form.teamsLink} onChange={e => set('teamsLink', e.target.value)} />
                </label>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Rayons concernés</span>
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
                      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Magasins concernés</span>
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

            {/* Description */}
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Description</span>
              <textarea className="Input resize-none h-16 text-xs" value={form.description} onChange={e => set('description', e.target.value)} />
            </label>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {!isNew && onDelete ? (
                  <button type="button" onClick={() => { onDelete(event); onClose() }}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">
                    Supprimer
                  </button>
                ) : null}
                {!isNew && event?.type === 'rdv_client' && onTransform && (
                  <button type="button" onClick={() => { onTransform(event); onClose() }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                    </svg>
                    Fiche atelier
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
                  Annuler
                </button>
                <button type="submit" disabled={saving || !form.title.trim()}
                  className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ── WeeklyCalendar ─────────────────────────────────────────────────────────── */
export default function WeeklyCalendar({ magasinId }) {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
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

        const rayons = op.rayonTypes?.length ? op.rayonTypes : (op.rayonType ? [op.rayonType] : [])
        if (rayons.length > 0 && RAYON_TYPES.includes(profile?.role) && !rayons.includes(profile?.role)) continue
        if (op.magasinIds && magasinId && !op.magasinIds.includes(magasinId)) continue

        if (op.dateDebut >= start && op.dateDebut <= end) {
          generated.push({
            id: `op_${op.id}_start`,
            type: 'op_commerciale',
            title: `Début OP · ${op.nom}`,
            date: op.dateDebut,
            opId: op.id,
            _opPin: true,
          })
        }
        if (op.dateFin >= start && op.dateFin <= end) {
          generated.push({
            id: `op_${op.id}_end`,
            type: 'op_commerciale',
            title: `Fin OP · ${op.nom}`,
            date: op.dateFin,
            opId: op.id,
            _opPin: true,
          })
        }
      }
      setOpEvents(generated)
    })
  }, [isPersonal, magasinId, profile?.role, days[0].getTime()])

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
            title: [data.customerName, data.bikeBrand, data.bikeModel].filter(Boolean).join(' · ') || 'Vélo',
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
          title: [data.clientNom, haut?.texte, numero?.texte].filter(Boolean).join(' · ') || 'Flocage',
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
        if (profile?.role === 'directeurgen') return false
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
    }
    return result
  }, [allEvents])

  /* Types visibles pour les filtres */
  const visibleTypes = useMemo(() => {
    if (isPersonal) return ['rdv_perso']
    if (profile?.role === 'directeurgen') return ['rdv_client', 'op_commerciale', 'teams', 'ticket_rendu']
    if (isChaussure) return ['rdv_client', 'op_commerciale', 'teams', 'flocage', 'planning_shift']
    if (isRayonRole) return ['rdv_client', 'op_commerciale', 'teams', 'ticket_rendu', 'planning_shift']
    return ['rdv_client', 'op_commerciale', 'teams', 'ticket_rendu', 'planning_shift']
  }, [isPersonal, isRayonRole, isChaussure, profile])

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
    const data = {
      title: form.title.trim(),
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
        initialValues: { issueDescription: ev.description || '' },
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

  if (!magasinId) return null

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">

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
            <span className="text-xs font-semibold text-gray-700 dark:text-neutral-300 w-44 text-center">
              {fmtWeekRange(days)}
            </span>
            <button onClick={nextWeek} className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <button onClick={() => setRefDate(new Date())}
              className="h-7 px-2.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors ml-1">
              Aujourd'hui
            </button>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-1">
            {visibleTypes.map(type => (
              <button key={type} onClick={() => toggleFilter(type)}
                className={['h-6 px-2 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1',
                  activeFilters.has(type)
                    ? EVENT_TYPES[type].pill
                    : 'text-gray-400 dark:text-neutral-600 bg-gray-50 dark:bg-neutral-800',
                ].join(' ')}>
                <span className={`h-1.5 w-1.5 rounded-full ${activeFilters.has(type) ? EVENT_TYPES[type].dot : 'bg-gray-300 dark:bg-neutral-600'}`} />
                {EVENT_TYPES[type].label}
              </button>
            ))}
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
              className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
              + Événement
            </button>
          )}
        </div>
      </div>

      {/* Grille hebdomadaire */}
      <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-neutral-800">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const dayEvents = byDate[dateStr] || []
          const today = isToday(day)
          const quotaInfo = getDayQuotaInfo(dateStr)

          return (
            <div key={dateStr} className="flex flex-col min-h-[160px]">
              {/* En-tête du jour */}
              <div className={['flex flex-col items-center py-2 border-b border-gray-100 dark:border-neutral-800 gap-0.5',
                today ? 'bg-gray-50 dark:bg-neutral-800/50' : '',
              ].join(' ')}>
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

              {/* Événements */}
              <div
                className="flex-1 p-1.5 space-y-1 cursor-pointer group"
                onClick={() => setModal({ event: null, date: dateStr })}
              >
                {dayEvents.map(ev => (
                  <button key={ev.id} onClick={e => {
                    e.stopPropagation()
                    if (ev.type === 'ticket_rendu') { navigate(`/tickets?open=${ev.ticketId}`); return }
                    if (ev.opId) { navigate(`/operations/${ev.opId}`); return }
                    if (ev.type === 'flocage') { navigate('/flocage'); return }
                    setModal({ event: ev, date: dateStr })
                  }}
                    className={['w-full text-left px-1.5 py-1 rounded-md text-[11px] font-medium leading-tight transition-opacity hover:opacity-80',
                      EVENT_TYPES[ev.type]?.pill || '',
                    ].join(' ')}>
                    {ev.startTime && <span className="opacity-60 mr-1">{ev.startTime}</span>}
                    <span className="truncate block">{ev.title}</span>
                  </button>
                ))}
                {(planningByDate[dateStr] || []).map(({ name, times, isCp, isEco }) => (
                  <div key={name} title={name} className={['w-full px-1.5 py-1 rounded-md text-[11px] font-medium leading-tight',
                    isCp  ? 'bg-rose-100   text-rose-700   dark:bg-rose-500/20   dark:text-rose-300'
                    : isEco ? 'bg-amber-100  text-amber-700  dark:bg-amber-500/20  dark:text-amber-300'
                            : 'bg-teal-100   text-teal-700   dark:bg-teal-500/20   dark:text-teal-300',
                  ].join(' ')}>
                    <span className="font-semibold">{name.split(' ')[0]} </span>
                    {isCp
                      ? <span className="opacity-75">Congé payé</span>
                      : <><span className="opacity-75">{times}</span>{isEco && <span className="opacity-60"> · École</span>}</>
                    }
                  </div>
                ))}
                {dayEvents.length === 0 && (planningByDate[dateStr] || []).length === 0 && (
                  <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-gray-300 dark:text-neutral-700">+</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
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
