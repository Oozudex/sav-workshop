import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withCommentEdited, withCommentRemoved, withStatusChange } from '../../src/lib/ticketHistory.js'

const NOW = new Date('2026-09-23T12:00:00').getTime()
const at = secondsAgo => new Date(NOW - secondsAgo * 1000).toISOString()
const entry = to => ({ at: new Date(NOW).toISOString(), by: 'u', action: 'status', note: `Statut → ${to}` })
const created = { at: at(3600), action: 'create', note: 'Ticket créé' }

describe('changements de statut rapprochés', () => {
  it('un changement normal est ajouté', () => {
    const h = withStatusChange([created], 'New', 'InProgress', entry('InProgress'), NOW)
    assert.equal(h.length, 2)
    assert.equal(h[1].from, 'New')
  })
  it("moins d'une minute après : seul le statut final est gardé", () => {
    const first = [created, { at: at(20), action: 'status', note: 'Statut → Ready', from: 'New' }]
    const h = withStatusChange(first, 'Ready', 'InProgress', entry('InProgress'), NOW)
    assert.deepEqual(h.map(e => e.note), ['Ticket créé', 'Statut → InProgress'])
    assert.equal(h[1].from, 'New')
  })
  it('retour au statut de départ : aucune trace', () => {
    const first = [created, { at: at(20), action: 'status', note: 'Statut → Ready', from: 'New' }]
    assert.deepEqual(withStatusChange(first, 'Ready', 'New', entry('New'), NOW), [created])
  })
  it('anciennes entrées sans « from » : statut précédent déduit', () => {
    const first = [created, { at: at(600), action: 'status', note: 'Statut → InProgress' }, { at: at(10), action: 'status', note: 'Statut → Ready' }]
    assert.equal(withStatusChange(first, 'Ready', 'InProgress', entry('InProgress'), NOW).length, 2)
  })
  it("plus d'une minute : les deux changements sont gardés", () => {
    const first = [created, { at: at(90), action: 'status', note: 'Statut → Ready', from: 'New' }]
    assert.equal(withStatusChange(first, 'Ready', 'InProgress', entry('InProgress'), NOW).length, 3)
  })
})

describe('historique des commentaires', () => {
  const comment = { id: 'c1', author: 'Julie N.', text: 'Pièce commandée' }
  const history = [created, { at: at(50), by: 'Julie N.', action: 'comment', note: 'Pièce commandée' }]
  it("la modification met à jour l'extrait", () => {
    assert.equal(withCommentEdited(history, comment, 'Pièce reçue')[1].note, 'Pièce reçue')
  })
  it("la suppression retire l'extrait", () => {
    assert.deepEqual(withCommentRemoved(history, comment), [created])
  })
  it("identifiant prioritaire pour les nouvelles entrées", () => {
    const withId = [{ action: 'comment', by: 'X', note: 'autre', commentId: 'c1' }]
    assert.deepEqual(withCommentRemoved(withId, comment), [])
  })
})
