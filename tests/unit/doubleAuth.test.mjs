import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeComplet, doubleAuthRequise, formaterCle, lireCode, messageErreurDoubleAuth, sessionDoubleAuth,
} from '../../src/lib/doubleAuth.js'
import { canManageStaff, peutReinitialiserDoubleAuth, sessionDoubleAuthOk } from '../../functions/lib.js'

describe('double authentification', () => {
  it('obligatoire pour les acheteurs, la direction et les administrateurs', () => {
    assert.equal(doubleAuthRequise({ role: 'acheteur' }), true)
    assert.equal(doubleAuthRequise({ role: 'directeurgen' }), true)
    assert.equal(doubleAuthRequise({ role: 'directeurgen', isAdmin: true }), true)
    assert.equal(doubleAuthRequise({ role: 'directeurmag' }), false)
    assert.equal(doubleAuthRequise({ role: 'velo' }), false)
    assert.equal(doubleAuthRequise(null), false)
  })
  it('session ouverte avec le code de l’application', () => {
    assert.equal(sessionDoubleAuth({ firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } }), true)
    assert.equal(sessionDoubleAuth({ firebase: { sign_in_provider: 'password' } }), false)
    assert.equal(sessionDoubleAuth({ aud: 'sav-workshop', firebase: { sign_in_provider: 'password' } }), true)
    assert.equal(sessionDoubleAuth({ aud: 'groupe-nivault', firebase: { sign_in_provider: 'custom' } }), false)
    assert.equal(sessionDoubleAuth({}), false)
  })
  it('saisie du code et de la clé', () => {
    assert.equal(lireCode(' 123 456 '), '123456')
    assert.equal(lireCode('12-34-5678'), '123456')
    assert.equal(codeComplet('12345'), false)
    assert.equal(codeComplet('123456'), true)
    assert.equal(formaterCle('ABCDEFGHIJ'), 'ABCD EFGH IJ')
    assert.match(messageErreurDoubleAuth('auth/invalid-verification-code'), /Code incorrect/)
    assert.match(messageErreurDoubleAuth('inconnu'), /Réessaie/)
  })
})

describe('double authentification : Cloud Functions', () => {
  const totp = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } }
  const sansCode = { firebase: { sign_in_provider: 'password' } }
  it('un rôle global sans le code n’a pas ses droits', () => {
    assert.equal(sessionDoubleAuthOk({ role: 'acheteur' }, sansCode), false)
    assert.equal(sessionDoubleAuthOk({ role: 'acheteur' }, totp), true)
    assert.equal(sessionDoubleAuthOk({ role: 'directeurmag' }, sansCode), true)
    assert.equal(sessionDoubleAuthOk({ role: 'admin' }, { aud: 'sav-workshop', firebase: {} }), true)
    assert.equal(sessionDoubleAuthOk({ role: 'admin' }, { aud: 'groupe-nivault', firebase: { sign_in_provider: 'custom' } }), false)
    assert.equal(canManageStaff({ role: 'directeurgen' }, 'B', sansCode), false)
    assert.equal(canManageStaff({ role: 'directeurgen' }, 'B', totp), true)
    assert.equal(canManageStaff({ role: 'directeurmag', magasinId: 'A' }, 'A', sansCode), true)
  })
  it('seul un administrateur (avec le code) réinitialise, et seulement les comptes concernés', () => {
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin' }, totp, { role: 'acheteur' }), true)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin' }, totp, { role: 'admin' }), true)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin' }, sansCode, { role: 'acheteur' }), false)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin', isActive: false }, totp, { role: 'acheteur' }), false)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'directeurgen' }, totp, { role: 'acheteur' }), false)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin' }, totp, { role: 'velo' }), false)
    assert.equal(peutReinitialiserDoubleAuth({ role: 'admin' }, totp, null), false)
  })
})
