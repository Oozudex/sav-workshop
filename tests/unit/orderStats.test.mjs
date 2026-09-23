import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeOrderPeriodStats, computeOrderSnapshot } from '../../src/lib/orderStats.js'
import { isOrderListed, orderClosedDate, orderStepDate } from '../../src/lib/orders.js'
import { periodRange } from '../../src/lib/ticketStats.js'

const NOW = new Date('2026-09-23T12:00:00')
const daysAgo = n => new Date(NOW.getTime() - n * 86400000)

// Commande complète : créée J-20, commandée J-19, reçue J-12, client prévenu J-11, retirée J-8
const retiree = {
  id: 'r', statut: 'retiree', type: 'velo', prix: 1000, acompte: 300, fournisseur: 'Trek', createur: 'Julie',
  createdAt: daysAgo(20), closedAt: daysAgo(8),
  statusDates: { commandee: daysAgo(19), recue: daysAgo(12), 'client-prevenu': daysAgo(11), retiree: daysAgo(8) },
}
const annulee = { id: 'a', statut: 'annulee', type: 'piece', prix: 50, createdAt: daysAgo(10), closedAt: daysAgo(9) }
const ouverte = { id: 'o', statut: 'commandee', type: 'piece', prix: 80, acompte: 20, createdAt: daysAgo(5), dateReceptionPrevue: '2026-09-20' }
// Ancien format : dates d'étapes seulement dans l'historique
const ancienne = {
  id: 'h', statut: 'recue', createdAt: daysAgo(15),
  history: [{ action: 'status', note: 'Statut → Commandée', at: daysAgo(14).toISOString() },
    { action: 'status', note: 'Statut → Reçue en magasin', at: daysAgo(4).toISOString() }],
}
const vieille = { id: 'v', statut: 'retiree', createdAt: daysAgo(60), closedAt: daysAgo(40), anonymizedAt: daysAgo(26), prix: 200 }
const ORDERS = [retiree, annulee, ouverte, ancienne, vieille]

describe('dates des étapes', () => {
  it("lit statusDates, sinon l'historique", () => {
    assert.equal(orderStepDate(retiree, 'recue').getTime(), daysAgo(12).getTime())
    assert.equal(orderStepDate(ancienne, 'recue').getTime(), daysAgo(4).getTime())
    assert.equal(orderClosedDate(ouverte), null)
  })
  it('les commandes terminées disparaissent de la liste après 14 jours', () => {
    assert.equal(isOrderListed(ouverte, NOW), true)
    assert.equal(isOrderListed(retiree, NOW), true)
    assert.equal(isOrderListed({ ...retiree, closedAt: daysAgo(15) }, NOW), false)
    assert.equal(isOrderListed(vieille, NOW), false)
  })
})

describe('statistiques des commandes', () => {
  it('indicateurs sur 30 jours', () => {
    const s = computeOrderPeriodStats(ORDERS, periodRange('last30', NOW))
    assert.equal(s.created, 4)
    assert.equal(s.retirees, 1)
    assert.equal(s.cancelRate, 0.5)
    assert.equal(s.revenue, 1000)
    assert.equal(s.depositRate, 0.5)
    assert.equal(s.supplierDays, (7 + 10) / 2)
    assert.equal(s.pickupDays, 3)
    assert.deepEqual(s.byType[0], ['Pièce', 2])
  })
  it('les commandes anonymisées restent dans les statistiques', () => {
    const s = computeOrderPeriodStats(ORDERS, periodRange('last12', NOW))
    assert.equal(s.retirees, 2)
    assert.equal(s.revenue, 1200)
  })
  it('état actuel : retards et reste à encaisser', () => {
    const snap = computeOrderSnapshot(ORDERS, NOW)
    assert.equal(snap.open, 2)
    assert.equal(snap.late, 1)
    assert.equal(snap.outstanding, 60)
  })
})
