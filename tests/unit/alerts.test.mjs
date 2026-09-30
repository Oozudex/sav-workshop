import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alertId, pendingAlerts } from '../../src/lib/alerts.js'

const alert = (key, itemIds) => ({ scope: 'orders', key, itemIds })

describe('alertes traitées', () => {
  it("masque une alerte traitée tant que les mêmes éléments sont concernés", () => {
    const a = alert('orderToReceiveDays', ['b', 'c'])
    assert.deepEqual(pendingAlerts([a], {}), [a])
    assert.deepEqual(pendingAlerts([a], { [alertId(a)]: ['b', 'c'] }), [])
  })
  it("reste masquée si un élément sort de l'alerte", () => {
    assert.deepEqual(pendingAlerts([alert('k', ['b'])], { 'orders:k': ['b', 'c'] }), [])
  })
  it("revient dès qu'un nouvel élément dépasse le seuil", () => {
    const a = alert('k', ['b', 'd'])
    assert.deepEqual(pendingAlerts([a], { 'orders:k': ['b', 'c'] }), [a])
  })
  it("ne mélange pas les alertes", () => {
    const a = alert('k', ['b'])
    assert.deepEqual(pendingAlerts([a], { 'tickets:k': ['b'] }), [a])
  })
})
