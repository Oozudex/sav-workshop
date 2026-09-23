// Statistiques des tickets SAV.
// Fonctions pures (aucun accès Firestore) : testées dans tests/unit/ticketStats.test.mjs
import { STATUSES } from './constants.js'

const DAY = 24 * 60 * 60 * 1000

export const OPEN_STATUSES = STATUSES.filter(s => s !== 'Closed')

// Statuts où le vélo est encore entre les mains de l'atelier (pour le calcul des retards)
const IN_WORKSHOP_STATUSES = ['New', 'InProgress', 'WaitingParts', 'WaitingCustomer']

// ── Dates ───────────────────────────────────────────────────────────────────
// Accepte un Timestamp Firestore, { seconds }, une chaîne ISO, un nombre ou une Date
export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Fin de journée d'une date 'YYYY-MM-DD' (une date prévue court jusqu'au soir)
function endOfDay(ymd) {
  const d = new Date(`${ymd}T23:59:59.999`)
  return Number.isNaN(d.getTime()) ? null : d
}

const days = ms => ms / DAY

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function ratio(part, total) {
  return total ? part / total : null
}

// ── Cycle de vie d'un ticket ────────────────────────────────────────────────
// Suite des statuts : [{ status, from }], à partir de la création et de l'historique
export function statusTimeline(ticket) {
  const created = toDate(ticket.createdAt)
  if (!created) return []
  const changes = (ticket.history || [])
    .filter(h => h.action === 'status')
    .map(h => ({ status: /Statut → (\w+)/.exec(h.note || '')?.[1], from: toDate(h.at) }))
    .filter(c => c.status && c.from)
    .sort((a, b) => a.from - b.from)
  return [{ status: 'New', from: created }, ...changes]
}

// Date de clôture : closedAt, sinon passage en Clôturé dans l'historique, sinon updatedAt
export function closedDateOf(ticket) {
  if (ticket.status !== 'Closed') return null
  if (ticket.closedAt) return toDate(ticket.closedAt)
  const lastClose = statusTimeline(ticket).filter(s => s.status === 'Closed').at(-1)
  return lastClose?.from || toDate(ticket.updatedAt)
}

// Durée (ms) passée dans chaque statut, jusqu'à la clôture ou jusqu'à maintenant
export function timeInStatus(ticket, now = new Date()) {
  const timeline = statusTimeline(ticket)
  const end = closedDateOf(ticket) || now
  const out = {}
  timeline.forEach((step, i) => {
    if (step.status === 'Closed') return
    const until = timeline[i + 1]?.from || end
    out[step.status] = (out[step.status] || 0) + Math.max(0, until - step.from)
  })
  return out
}

// Depuis quand le ticket est dans son statut actuel
export function currentStatusSince(ticket) {
  const timeline = statusTimeline(ticket)
  const current = timeline.filter(s => s.status === ticket.status).at(-1)
  return current?.from || toDate(ticket.createdAt)
}

export function isOpen(ticket) {
  return ticket.status !== 'Closed' && !ticket.anonymizedAt
}

export function isOverdue(ticket, now = new Date()) {
  if (!ticket.dueDate || !IN_WORKSHOP_STATUSES.includes(ticket.status)) return false
  const due = endOfDay(ticket.dueDate)
  return !!due && due < now
}

// ── Périodes ────────────────────────────────────────────────────────────────
export const PERIODS = {
  month: 'Ce mois-ci',
  last30: '30 derniers jours',
  ytd: 'Depuis le 1er janvier',
  last12: '12 derniers mois',
}

// Intervalle [start, end) de la période, et le même intervalle un an plus tôt
export function periodRange(key, now = new Date()) {
  const end = new Date(now)
  let start
  if (key === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (key === 'ytd') start = new Date(now.getFullYear(), 0, 1)
  else if (key === 'last12') start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  else start = new Date(now.getTime() - 30 * DAY)
  return { start, end }
}

export function previousYear({ start, end }) {
  const shift = d => { const c = new Date(d); c.setFullYear(c.getFullYear() - 1); return c }
  return { start: shift(start), end: shift(end) }
}

const inRange = (date, { start, end }) => !!date && date >= start && date < end

function countBy(items, key) {
  const out = {}
  for (const item of items) {
    const k = key(item)
    if (k) out[k] = (out[k] || 0) + 1
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1])
}

// ── Statistiques d'une période ──────────────────────────────────────────────
export function computePeriodStats(tickets, range, now = new Date()) {
  const created = tickets.filter(t => inRange(toDate(t.createdAt), range))
  const closed = tickets.filter(t => inRange(closedDateOf(t), range))

  const repairDays = closed
    .map(t => days(closedDateOf(t) - toDate(t.createdAt)))
    .filter(d => d >= 0)

  const withDue = closed.filter(t => t.dueDate && endOfDay(t.dueDate))
  const onTime = withDue.filter(t => closedDateOf(t) <= endOfDay(t.dueDate))

  // Temps moyen par statut, sur les tickets clôturés de la période qui sont passés par ce statut
  const perStatus = {}
  for (const t of closed) {
    for (const [status, ms] of Object.entries(timeInStatus(t, now))) {
      (perStatus[status] ||= []).push(days(ms))
    }
  }

  return {
    created: created.length,
    closed: closed.length,
    avgRepairDays: mean(repairDays),
    onTimeRate: ratio(onTime.length, withDue.length),
    warrantyRate: ratio(created.filter(t => t.underWarranty).length, created.length),
    urgentRate: ratio(created.filter(t => t.priority === 'Urgent').length, created.length),
    avgDaysByStatus: Object.fromEntries(OPEN_STATUSES.map(s => [s, mean(perStatus[s] || [])])),
    byBikeType: countBy(created, t => t.bikeType),
    topBrands: countBy(created, t => t.bikeBrand?.trim()).slice(0, 5),
    byCreator: countBy(created, t => t.createdByName?.trim()),
  }
}

// ── État actuel de l'atelier ────────────────────────────────────────────────
export function computeSnapshot(tickets, now = new Date()) {
  const open = tickets.filter(isOpen)
  return {
    open: open.length,
    byStatus: OPEN_STATUSES.map(s => [s, open.filter(t => t.status === s).length]),
    overdue: open.filter(t => isOverdue(t, now)).length,
    avgAgeDays: mean(open.map(t => days(now - toDate(t.createdAt))).filter(d => d >= 0)),
  }
}

// Tickets créés par mois (index 0 = janvier)
export function monthlyCreated(tickets, year) {
  const months = Array(12).fill(0)
  for (const t of tickets) {
    const d = toDate(t.createdAt)
    if (d && d.getFullYear() === year) months[d.getMonth()]++
  }
  return months
}
