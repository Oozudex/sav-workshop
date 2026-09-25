// Statistiques des commandes clients (fonctions pures : tests/unit/orderStats.test.mjs).
// Les commandes anonymisées sont incluses : seules les données client ont été effacées.
import { toDate } from './ticketStats.js'
import {
  ORDER_OPEN_STATUSES, ORDER_TYPES, isLateDelivery, isOrderOpen, orderClosedDate, orderStatus, orderStepDate,
  orderTotal, parseEuro, remainingToPay,
} from './orders.js'

const DAY = 24 * 60 * 60 * 1000
const days = ms => ms / DAY
const inRange = (date, { start, end }) => !!date && date >= start && date < end
const sum = values => values.reduce((a, b) => a + b, 0)
const mean = values => values.length ? sum(values) / values.length : null

function countBy(items, key) {
  const out = {}
  for (const item of items) {
    const k = key(item)
    if (k) out[k] = (out[k] || 0) + 1
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1])
}

// Durée entre deux étapes (en jours), si les deux dates sont connues et cohérentes
function stepDays(order, from, to, fallbackFrom) {
  const a = orderStepDate(order, from) || (fallbackFrom && fallbackFrom(order))
  const b = orderStepDate(order, to)
  return a && b && b >= a ? days(b - a) : null
}

// ── Statistiques d'une période ──────────────────────────────────────────────
export function computeOrderPeriodStats(orders, range) {
  const created = orders.filter(o => inRange(toDate(o.createdAt), range))
  const ended = orders.filter(o => inRange(orderClosedDate(o), range))
  const retirees = ended.filter(o => orderStatus(o) === 'retiree')
  const annulees = ended.filter(o => orderStatus(o) === 'annulee')

  // Chiffre d'affaires : total payé par le client, frais de port compris
  const prices = retirees.map(orderTotal).filter(p => p != null)
  const received = orders.filter(o => inRange(orderStepDate(o, 'recue'), range))

  return {
    created: created.length,
    retirees: retirees.length,
    cancelRate: ended.length ? annulees.length / ended.length : null,
    revenue: prices.length ? sum(prices) : null,
    avgBasket: mean(prices),
    depositRate: created.length ? created.filter(o => parseEuro(o.acompte) > 0).length / created.length : null,
    // Délai fournisseur : de la commande passée (ou de la création) à la réception
    supplierDays: mean(received.map(o => stepDays(o, 'commandee', 'recue', x => toDate(x.createdAt))).filter(d => d != null)),
    // Délai de retrait : du client prévenu (ou de la réception) au retrait
    pickupDays: mean(retirees.map(o => stepDays(o, 'client-prevenu', 'retiree', x => orderStepDate(x, 'recue'))).filter(d => d != null)),
    byType: countBy(created, o => ORDER_TYPES[o.type]),
    topSuppliers: countBy(created, o => o.fournisseur?.trim()).slice(0, 5),
    byCreator: countBy(created, o => o.createur?.trim()),
  }
}

// ── État actuel ─────────────────────────────────────────────────────────────
export function computeOrderSnapshot(orders, now = new Date()) {
  const open = orders.filter(isOrderOpen)
  const outstanding = open.map(remainingToPay).filter(r => r != null)
  return {
    open: open.length,
    byStatus: ORDER_OPEN_STATUSES.map(s => [s, open.filter(o => orderStatus(o) === s).length]),
    late: open.filter(o => isLateDelivery(o, now)).length,
    outstanding: outstanding.length ? sum(outstanding) : 0,
  }
}
