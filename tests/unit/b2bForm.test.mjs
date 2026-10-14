import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { b2bFormErrors, b2bFormInitial, b2bPayload, filtrerB2B, initialesB2B } from '../../src/lib/b2bForm.js'

const form = over => ({ ...b2bFormInitial(), label: 'MFC', ...over })

describe('formulaire B2B', () => {
  it('valeurs de départ : nouveau B2B pour tous les magasins, B2B existant repris', () => {
    const vide = b2bFormInitial()
    assert.equal(vide.tousLesMagasins, true)
    assert.equal(vide.color, 'indigo')
    const existant = b2bFormInitial({ label: 'MFC', storeIds: ['A'], phones: [{ value: '01' }], featured: true })
    assert.equal(existant.tousLesMagasins, false)
    assert.deepEqual(existant.phones, [{ label: '', value: '01' }])
    assert.equal(existant.featured, true)
  })
  it('nom obligatoire, liens vérifiés (https ajouté au besoin)', () => {
    assert.deepEqual(b2bFormErrors(form()), {})
    assert.ok(b2bFormErrors(form({ label: ' ' })).label)
    assert.deepEqual(b2bFormErrors(form({ url: 'b2b.mfc.fr', imageUrl: 'https://mfc.fr/logo.png' })), {})
    assert.ok(b2bFormErrors(form({ url: 'javascript:alert(1)' })).url)
    assert.ok(b2bFormErrors(form({ imageUrl: 'pas une image' })).imageUrl)
    assert.ok(b2bFormErrors(form({ description: 'x'.repeat(81) })).description)
  })
  it('contacts : lignes vides ignorées, numéros et e-mails vérifiés', () => {
    const e = b2bFormErrors(form({
      phones: [{ label: '', value: '' }, { label: 'SAV', value: '' }, { label: '', value: 'abc' }, { label: '', value: '+33 (0)2 41 00 00 00' }],
      emails: [{ label: 'Commercial', value: 'pas-un-mail' }, { label: '', value: 'sav@mfc.fr' }],
    }))
    assert.deepEqual(e.phones, { 1: 'Numéro manquant.', 2: 'Numéro invalide.' })
    assert.deepEqual(e.emails, { 0: 'E-mail invalide.' })
  })
  it('« certains magasins » sans magasin coché : erreur', () => {
    assert.ok(b2bFormErrors(form({ tousLesMagasins: false, storeIds: [] })).storeIds)
    assert.equal(b2bFormErrors(form({ tousLesMagasins: false, storeIds: ['A'] })).storeIds, undefined)
  })
  it('données enregistrées : textes nettoyés, contacts vides retirés, magasins selon le choix', () => {
    const data = b2bPayload(form({
      label: ' MFC ', description: ' ', url: 'b2b.mfc.fr', imageUrl: '',
      phones: [{ label: ' SAV ', value: ' 02 41 00 00 00 ' }, { label: '', value: '' }],
      tousLesMagasins: false, storeIds: ['B', 'A'],
    }), ['A', 'B', 'C'])
    assert.deepEqual(data, {
      label: 'MFC', description: null, url: 'https://b2b.mfc.fr', imageUrl: null,
      phones: [{ label: 'SAV', value: '02 41 00 00 00' }], emails: [], color: 'indigo', featured: false, storeIds: ['A', 'B'],
    })
    assert.deepEqual(b2bPayload(form({ storeIds: ['A'] }), ['A']).storeIds, [])
  })
})

describe('affichage des B2B', () => {
  it('initiales sans logo', () => {
    assert.equal(initialesB2B('MFC'), 'MF')
    assert.equal(initialesB2B('Magura / MBPS'), 'MM')
    assert.equal(initialesB2B('1 2 3 Roulements'), '12')
    assert.equal(initialesB2B(''), '?')
  })
  it('recherche sur le nom, la description et les contacts, sans accents', () => {
    const tools = [
      { label: 'MFC', description: 'Marques Nakamura, Sunn', emails: [{ label: '', value: 'sav@mfdc.fr' }] },
      { label: 'Spécialité T.A.', description: 'Plateaux' },
    ]
    assert.deepEqual(filtrerB2B(tools, 'sunn').map(t => t.label), ['MFC'])
    assert.deepEqual(filtrerB2B(tools, 'specialite').map(t => t.label), ['Spécialité T.A.'])
    assert.deepEqual(filtrerB2B(tools, 'mfdc').map(t => t.label), ['MFC'])
    assert.equal(filtrerB2B(tools, '  ').length, 2)
  })
})
