import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TICKET_ALERTS, closedDateOf, computePeriodStats, computeSnapshot, isOverdue,
  monthlyCreated, periodRange, previousYear, timeInStatus,
} from '../../src/lib/ticketStats.js'
import { computeAlerts as computeAlertsFor } from '../../src/lib/alerts.js'

const computeAlerts = (items, settings, now) => computeAlertsFor(items, settings, TICKET_ALERTS, now)

const NOW = new Date('2026-09-23T12:00:00')
const daysAgo = n => new Date(NOW.getTime() - n * 86400000)
const status = (s, at) => ({ action: 'status', note: `Statut → ${s}`, at: at.toISOString() })

// Ticket créé il y a 20 j, en attente de pièces il y a 15 j, prêt il y a 5 j, clôturé il y a 2 j
const closedTicket = {
  id: 'c1', status: 'Closed', createdAt: daysAgo(20), closedAt: daysAgo(2), dueDate: '2026-09-25',
  underWarranty: true, priority: 'Normal', bikeType: 'VTT', bikeBrand: 'Trek', createdByName: 'Julie',
  history: [status('WaitingParts', daysAgo(15)), status('Ready', daysAgo(5)), status('Closed', daysAgo(2))],
}
const openOld = { id: 'o1', status: 'InProgress', createdAt: daysAgo(30), dueDate: '2026-09-01', priority: 'Urgent' }
const openWaiting = {
  id: 'o2', status: 'WaitingParts', createdAt: daysAgo(12), priority: 'Normal',
  history: [status('WaitingParts', daysAgo(11))],
}
const openReady = { id: 'o3', status: 'Ready', createdAt: daysAgo(9), dueDate: '2026-09-01', history: [status('Ready', daysAgo(8))] }
const anonymized = { id: 'a1', status: 'Closed', createdAt: daysAgo(400), closedAt: daysAgo(390), anonymizedAt: daysAgo(376) }
const TICKETS = [closedTicket, openOld, openWaiting, openReady, anonymized]

describe('cycle de vie', () => {
  it('temps passé par statut', () => {
    const t = timeInStatus(closedTicket, NOW)
    assert.equal(Math.round(t.New / 86400000), 5)
    assert.equal(Math.round(t.WaitingParts / 86400000), 10)
    assert.equal(Math.round(t.Ready / 86400000), 3)
    assert.equal(t.Closed, undefined)
  })
  it('date de clôture de repli sur l\'historique', () => {
    const { closedAt, ...legacy } = closedTicket
    assert.equal(closedDateOf(legacy).getTime(), closedAt.getTime())
  })
  it('retard : seulement tant que le vélo est à l\'atelier', () => {
    assert.equal(isOverdue(openOld, NOW), true)
    assert.equal(isOverdue(openReady, NOW), false)
  })
})

describe('statistiques', () => {
  it("période et comparaison N-1", () => {
    const range = periodRange('month', NOW)
    assert.equal(range.start.getDate(), 1)
    assert.equal(previousYear(range).start.getFullYear(), 2025)
  })
  it('indicateurs sur 30 jours', () => {
    const s = computePeriodStats(TICKETS, periodRange('last30', NOW), NOW)
    assert.equal(s.created, 4)
    assert.equal(s.closed, 1)
    assert.equal(Math.round(s.avgRepairDays), 18)
    assert.equal(s.onTimeRate, 1)
    assert.equal(s.urgentRate, 0.25)
    assert.equal(Math.round(s.avgDaysByStatus.WaitingParts), 10)
  })
  it('les tickets anonymisés comptent dans les stats mais pas dans l\'état actuel', () => {
    assert.equal(monthlyCreated(TICKETS, 2025)[7], 1)
    const snap = computeSnapshot(TICKETS, NOW)
    assert.equal(snap.open, 3)
    assert.equal(snap.overdue, 1)
  })
})

describe('alertes', () => {
  it('ne déclenche rien sans réglage actif', () => {
    assert.deepEqual(computeAlerts(TICKETS, {}, NOW), [])
    assert.deepEqual(computeAlerts(TICKETS, { maxOpen: { enabled: false, threshold: 0 } }, NOW), [])
  })
  it('seuil de volume : strictement au-dessus', () => {
    assert.equal(computeAlerts(TICKETS, { maxOpen: { enabled: true, threshold: 3 } }, NOW).length, 0)
    const [a] = computeAlerts(TICKETS, { maxOpen: { enabled: true, threshold: 2 } }, NOW)
    assert.equal(a.value, 3)
    assert.match(a.message, /3 vélos à l'atelier/)
  })
  it('seuil de durée : liste les tickets concernés', () => {
    const [a] = computeAlerts(TICKETS, { maxOpenDays: { enabled: true, threshold: 10 } }, NOW)
    assert.deepEqual(a.itemIds.sort(), ['o1', 'o2'])
    const [w] = computeAlerts(TICKETS, { maxWaitingPartsDays: { enabled: true, threshold: 10 } }, NOW)
    assert.deepEqual(w.itemIds, ['o2'])
    const [r] = computeAlerts(TICKETS, { maxReadyDays: { enabled: true, threshold: 7 } }, NOW)
    assert.deepEqual(r.itemIds, ['o3'])
  })
  it('urgents et retards', () => {
    const alerts = computeAlerts(TICKETS, {
      maxUrgent: { enabled: true, threshold: 0 },
      maxOverdue: { enabled: true, threshold: 0 },
    }, NOW)
    assert.deepEqual(alerts.map(a => a.key), ['maxOverdue', 'maxUrgent'])
  })
})
