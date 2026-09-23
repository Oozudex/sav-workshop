import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDER_ALERTS, formatOrderNumber, isOrderOpen, orderMatches, orderStatus, parseEuro, remainingToPay,
} from '../../src/lib/orders.js'
import { computeAlerts } from '../../src/lib/alerts.js'

const NOW = new Date('2026-09-23T12:00:00')
const daysAgo = n => new Date(NOW.getTime() - n * 86400000)

describe('formats', () => {
  it('lit les prix saisis à la française', () => {
    assert.equal(parseEuro('1 200'), 1200)
    assert.equal(parseEuro('1 200,50 €'), 1200.5)
    assert.equal(parseEuro('1 049,9'), 1049.9)
    assert.equal(parseEuro(''), null)
    assert.equal(parseEuro('abc'), null)
  })
  it('reste à payer', () => {
    assert.equal(remainingToPay({ prix: 1200, acompte: '300' }), 900)
    assert.equal(remainingToPay({ prix: 100 }), 100)
    assert.equal(remainingToPay({ prix: null, acompte: 50 }), null)
  })
  it('numéros anciens et nouveaux', () => {
    assert.equal(formatOrderNumber('0012'), '#0012')
    assert.equal(formatOrderNumber('CMD-2026-0003'), 'CMD-2026-0003')
  })
})

describe('statuts', () => {
  it('convertit les anciens statuts', () => {
    assert.equal(orderStatus({ statut: 'en-attente' }), 'a-commander')
    assert.equal(orderStatus({ statut: 'en-cours' }), 'commandee')
    assert.equal(orderStatus({ statut: 'livree' }), 'retiree')
    assert.equal(orderStatus({ statut: 'recue' }), 'recue')
  })
  it('commande en cours ou terminée', () => {
    assert.equal(isOrderOpen({ statut: 'client-prevenu' }), true)
    assert.equal(isOrderOpen({ statut: 'livree' }), false)
    assert.equal(isOrderOpen({ statut: 'recue', anonymizedAt: NOW }), false)
  })
})

describe('recherche', () => {
  const order = { numero: 'CMD-2026-0042', client: 'Jean Martin', tel: '06 12 34 56 78', refFournisseur: 'TRK-99812' }
  it('par téléphone, avec ou sans espaces', () => {
    assert.equal(orderMatches(order, '0612345678'), true)
    assert.equal(orderMatches(order, '06.12.34'), true)
  })
  it('par numéro de commande ou fournisseur', () => {
    assert.equal(orderMatches(order, 'cmd-2026-0042'), true)
    assert.equal(orderMatches(order, 'trk-99812'), true)
    assert.equal(orderMatches(order, 'dupont'), false)
  })
})

describe('alertes commandes', () => {
  const ORDERS = [
    { id: 'a', statut: 'a-commander', statutAt: daysAgo(3) },
    { id: 'b', statut: 'commandee', statutAt: daysAgo(10), dateReceptionPrevue: '2026-09-15' },
    { id: 'c', statut: 'commandee', statutAt: daysAgo(10), dateReceptionPrevue: '2026-09-30' },
    { id: 'd', statut: 'recue', statutAt: daysAgo(2) },
    { id: 'e', statut: 'client-prevenu', statutAt: daysAgo(15) },
    { id: 'f', statut: 'retiree', statutAt: daysAgo(40) },
  ]
  const all = {
    orderToPlaceDays: { enabled: true, threshold: 2 },
    orderLateDays: { enabled: true, threshold: 3 },
    orderToCallDays: { enabled: true, threshold: 1 },
    orderPickupDays: { enabled: true, threshold: 10 },
  }
  it('chaque étape du parcours a son alerte', () => {
    const alerts = computeAlerts(ORDERS, all, ORDER_ALERTS, NOW)
    assert.deepEqual(alerts.map(a => [a.key, a.itemIds]), [
      ['orderToPlaceDays', ['a']],
      ['orderLateDays', ['b']],
      ['orderToCallDays', ['d']],
      ['orderPickupDays', ['e']],
    ])
    assert.equal(alerts[0].path, '/orders')
  })
  it('rien sous les seuils', () => {
    const relaxed = Object.fromEntries(Object.keys(all).map(k => [k, { enabled: true, threshold: 30 }]))
    assert.deepEqual(computeAlerts(ORDERS, relaxed, ORDER_ALERTS, NOW), [])
  })
})
