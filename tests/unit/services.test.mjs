import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  credentialWrites, isHttpUrl, normalizeUrl, serviceAccess, serviceFormErrors, servicePayload, sortServices,
} from '../../src/lib/services.js'

describe('liens', () => {
  it("ajoute https:// quand il manque", () => {
    assert.equal(normalizeUrl('drive.google.com/x'), 'https://drive.google.com/x')
    assert.equal(normalizeUrl(' https://a.fr '), 'https://a.fr')
    assert.equal(normalizeUrl(''), '')
  })
  it("refuse les liens non http", () => {
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
    assert.equal(isHttpUrl('https://a.fr'), true)
  })
})

describe('formulaire', () => {
  it("exige un nom et des liens valides", () => {
    assert.deepEqual(Object.keys(serviceFormErrors({ label: '', url: 'javascript:x', procedureUrl: '' })), ['label', 'url'])
    assert.deepEqual(serviceFormErrors({ label: 'Upway', url: 'upway.fr', procedureUrl: 'drive.google.com/d/1' }), {})
  })
  it("prépare les données", () => {
    const p = servicePayload({ label: ' Upway ', description: '', url: 'upway.fr', procedureUrl: '', usesCredentials: true })
    assert.deepEqual(p, { label: 'Upway', description: null, url: 'https://upway.fr', procedureUrl: null, color: 'emerald', usesCredentials: true })
  })
})

describe('identifiants', () => {
  it("enregistre les magasins remplis et supprime les vides", () => {
    const w = credentialWrites({ A: { login: ' a@x.fr ', password: '' }, B: { login: '', password: '' }, C: { login: '', password: 'p' } })
    assert.deepEqual(w.storeIds, ['A', 'C'])
    assert.deepEqual(w.remove, ['B'])
    assert.deepEqual(w.set[0].data, { login: 'a@x.fr', password: '' })
  })
  it("détermine l'accès du magasin", () => {
    const s = { usesCredentials: true, credentialStoreIds: ['A'] }
    assert.equal(serviceAccess({ usesCredentials: false }, { isGlobal: false, magasinId: 'A' }), 'none')
    assert.equal(serviceAccess(s, { isGlobal: true }), 'all')
    assert.equal(serviceAccess(s, { isGlobal: false, magasinId: 'A' }), 'mine')
    assert.equal(serviceAccess(s, { isGlobal: false, magasinId: 'B' }), 'missing')
  })
  it("trie par ordre puis par nom", () => {
    assert.deepEqual(sortServices([{ label: 'b' }, { label: 'a' }, { label: 'z', order: 0 }]).map(s => s.label), ['z', 'a', 'b'])
  })
})
