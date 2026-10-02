import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lastParisMidnight, nextParisMidnight, parisOffsetMinutes, passwordErrors, sessionExpired } from '../../src/lib/session.js'
import { canManageStaff, newPassword } from '../../functions/lib.js'

describe('minuit à Paris', () => {
  it('décalage hiver / été', () => {
    assert.equal(parisOffsetMinutes(new Date('2026-01-15T12:00:00Z')), 60)
    assert.equal(parisOffsetMinutes(new Date('2026-07-15T12:00:00Z')), 120)
  })
  it('dernier minuit', () => {
    assert.equal(lastParisMidnight(new Date('2026-10-02T09:30:00Z')).toISOString(), '2026-10-01T22:00:00.000Z')
    assert.equal(lastParisMidnight(new Date('2026-01-15T23:30:00Z')).toISOString(), '2026-01-15T23:00:00.000Z')
    // 0 h 30 à Paris : minuit vient de passer
    assert.equal(lastParisMidnight(new Date('2026-10-01T22:30:00Z')).toISOString(), '2026-10-01T22:00:00.000Z')
  })
  it('nuits de changement d\'heure', () => {
    // 29 mars 2026, passage à l'heure d'été à 2 h : minuit était encore à +1
    assert.equal(lastParisMidnight(new Date('2026-03-29T10:00:00Z')).toISOString(), '2026-03-28T23:00:00.000Z')
    // 25 octobre 2026, retour à l'heure d'hiver à 3 h : minuit était encore à +2
    assert.equal(lastParisMidnight(new Date('2026-10-25T10:00:00Z')).toISOString(), '2026-10-24T22:00:00.000Z')
  })
  it('prochain minuit', () => {
    assert.equal(nextParisMidnight(new Date('2026-10-02T09:30:00Z')).toISOString(), '2026-10-02T22:00:00.000Z')
    assert.equal(nextParisMidnight(new Date('2026-10-24T20:00:00Z')).toISOString(), '2026-10-24T22:00:00.000Z')
    assert.equal(nextParisMidnight(new Date('2026-10-25T10:00:00Z')).toISOString(), '2026-10-25T23:00:00.000Z')
  })
})

describe('session expirée', () => {
  const now = new Date('2026-10-02T09:30:00Z') // 11 h 30 à Paris
  it('ouverte avant minuit : expirée', () => {
    assert.equal(sessionExpired(new Date('2026-10-01T21:59:00Z'), { now }), true)
    assert.equal(sessionExpired(new Date('2026-10-02T06:00:00Z'), { now }), false)
  })
  it('coupure forcée (mot de passe du rayon changé)', () => {
    const revokedAt = new Date('2026-10-02T08:00:00.500Z')
    assert.equal(sessionExpired(new Date('2026-10-02T07:00:00Z'), { now, revokedAt }), true)
    assert.equal(sessionExpired(new Date('2026-10-02T08:00:00Z'), { now, revokedAt }), false) // même seconde
    assert.equal(sessionExpired(new Date('2026-10-02T09:00:00Z'), { now, revokedAt }), false)
  })
})

describe('retrait d\'un collaborateur', () => {
  it('nouveau mot de passe lisible, différent à chaque fois', () => {
    const p = newPassword()
    assert.match(p, /^[A-HJ-NP-Za-hj-np-z2-9]{4}-[A-HJ-NP-Za-hj-np-z2-9]{4}-[A-HJ-NP-Za-hj-np-z2-9]{4}$/)
    assert.notEqual(p, newPassword())
  })
  it('droits : directeur de son magasin, direction et acheteurs', () => {
    assert.equal(canManageStaff({ role: 'directeurmag', magasinId: 'A' }, 'A'), true)
    assert.equal(canManageStaff({ role: 'directeurmag', magasinId: 'A' }, 'B'), false)
    assert.equal(canManageStaff({ role: 'directeurgen' }, 'B'), true)
    assert.equal(canManageStaff({ role: 'velo', magasinId: 'A' }, 'A'), false)
    assert.equal(canManageStaff({ role: 'directeurmag', magasinId: 'A', isActive: false }, 'A'), false)
    assert.equal(canManageStaff(undefined, 'A'), false)
  })
})

describe('nouveau mot de passe du rayon', () => {
  it('8 caractères minimum et confirmation identique', () => {
    assert.equal(passwordErrors('court', 'court'), 'Le mot de passe doit faire au moins 8 caractères.')
    assert.equal(passwordErrors('assez-long', 'autre-chose'), 'Les deux mots de passe ne sont pas identiques.')
    assert.equal(passwordErrors('assez-long', 'assez-long'), null)
  })
})
