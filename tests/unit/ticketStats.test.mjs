import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  closedDateOf, computePeriodStats, computeSnapshot, isOverdue,
  monthlyCreated, periodRange, previousYear, timeInStatus,
} from '../../src/lib/ticketStats.js'

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
