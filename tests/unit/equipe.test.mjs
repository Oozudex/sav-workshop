import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { membreUnique } from '../../src/lib/equipe.js'

describe('présélection du seul membre de l’équipe', () => {
  it('un seul membre : son nom', () => {
    assert.equal(membreUnique([{ id: 'a', nom: 'Julie' }]), 'Julie')
    assert.equal(membreUnique(['Karim']), 'Karim')
  })
  it('aucun ou plusieurs membres : rien, on choisit comme avant', () => {
    assert.equal(membreUnique([]), '')
    assert.equal(membreUnique([{ nom: 'Julie' }, { nom: 'Karim' }]), '')
    assert.equal(membreUnique(null), '')
    assert.equal(membreUnique([{ id: 'a' }]), '')
  })
})
