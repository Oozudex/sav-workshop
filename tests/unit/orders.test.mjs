import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDER_ALERTS, formatOrderNumber, isOrderOpen, orderFormErrors, orderMatches, orderStatus, orderTotal, parseEuro,
  remainingToPay,
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
  it('total avec frais de port, reste à payer sur le total', () => {
    assert.equal(orderTotal({ prix: '1 199,99', fraisPort: '15' }), 1214.99)
    assert.equal(orderTotal({ prix: 89.9 }), 89.9)
    assert.equal(orderTotal({ fraisPort: 15 }), null)
    assert.equal(remainingToPay({ prix: 1200, fraisPort: 20, acompte: 300 }), 920)
  })
})

describe('formulaire de commande', () => {
  const ok = { client: 'Marie Dubois', produit: 'Selle Selle Italia', prix: '89,90', fraisPort: '', acompte: '', createur: 'Paul' }
  it('complet : aucune erreur', () => {
    assert.deepEqual(orderFormErrors(ok, { requireCreateur: true }), {})
  })
  it('prix de vente TTC obligatoire et valide', () => {
    assert.equal(orderFormErrors({ ...ok, prix: '' }).prix, 'Le prix de vente TTC est obligatoire.')
    assert.equal(orderFormErrors({ ...ok, prix: 'abc' }).prix, 'Prix invalide.')
    assert.equal(orderFormErrors({ ...ok, prix: '0' }).prix, 'Prix invalide.')
  })
  it('frais de port et acompte', () => {
    assert.equal(orderFormErrors({ ...ok, fraisPort: '-5' }).fraisPort, 'Montant invalide.')
    assert.equal(orderFormErrors({ ...ok, acompte: '100' }).acompte, 'L’acompte dépasse le total.')
    assert.deepEqual(orderFormErrors({ ...ok, fraisPort: '15', acompte: '104,90' }), {})
  })
  it('client, désignation et vendeur', () => {
    const e = orderFormErrors({ ...ok, client: ' ', produit: '', createur: '' }, { requireCreateur: true })
    assert.deepEqual(Object.keys(e).sort(), ['client', 'createur', 'produit'])
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
