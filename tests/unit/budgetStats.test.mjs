import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { byMagasin, envelopes, evol, groupRows, part, statsRows, sumRows, topWithOthers } from '../../src/lib/budgetStats.js'
import { fournisseurResolver } from '../../src/lib/budgets.js'

const segments = [{ id: 's1', univers: 'RUNNING', nom: '' }, { id: 's2', univers: 'CYCLE', nom: 'VELO' }]
const brandsBySeg = new Map([
  ['s1', [
    { id: 'a', nom: 'ADIDAS', univers: 'RUNNING', line: { n1: { m1: 100, m2: 50 }, saisie: { m1: 120 }, quantite: { m1: 10 }, engage: true } },
    { id: 'af', nom: 'ADIDAS FEMME', univers: 'RUNNING', line: { n1: { m1: 20 }, saisie: { m2: 30 } } },
  ]],
  ['s2', [{ id: 'g', nom: 'GRANVILLE', univers: 'CYCLE', line: { n1: { m2: 200 }, saisie: { m2: 180 }, quantiteN1: { m2: 4 } } }]],
])
const adapte = { byBrand: new Map([['a', { m1: 110, m2: 40 }], ['af', { m1: 25 }], ['g', { m2: 210 }]]) }
const fournisseur = fournisseurResolver(['ADIDAS', 'ADIDAS FEMME', 'GRANVILLE'])

describe('statistiques des budgets', () => {
  const rows = statsRows({ segments, brandsBySeg, adapte, fournisseur })

  it('une ligne par marque avec ses totaux et son fournisseur', () => {
    const a = rows.find(r => r.id === 'a')
    assert.deepEqual({ n1: a.n1, saisie: a.saisie, engage: a.engage, adapte: a.adapte, qte: a.qte }, { n1: 150, saisie: 120, engage: 120, adapte: 150, qte: 10 })
    assert.equal(rows.find(r => r.id === 'af').fournisseur, 'ADIDAS')
    assert.equal(rows.find(r => r.id === 'af').engage, 0)
  })
  it('additionne et regroupe (fournisseur, univers)', () => {
    assert.deepEqual(sumRows(rows), { n1: 370, saisie: 330, engage: 120, adapte: 385, qte: 10, qteN1: 4 })
    const f = groupRows(rows, r => r.fKey, r => r.fournisseur)
    assert.deepEqual(f.map(g => [g.label, g.saisie]), [['ADIDAS', 150], ['GRANVILLE', 180]])
    assert.deepEqual(groupRows(rows, r => r.univers).map(g => g.key), ['RUNNING', 'CYCLE'])
  })
  it('ne compte qu’un magasin si demandé', () => {
    const m1 = statsRows({ segments, brandsBySeg, adapte, fournisseur, magId: 'm1' })
    assert.deepEqual(sumRows(m1), { n1: 120, saisie: 120, engage: 120, adapte: 135, qte: 10, qteN1: 0 })
    assert.deepEqual(Object.keys(byMagasin(m1)), ['m1'])
  })
  it('totalise par magasin', () => {
    assert.deepEqual(byMagasin(rows).m2, { n1: 250, saisie: 210, adapte: 250 })
  })
  it('donne les enveloppes base / groupe des univers gardés', () => {
    const totals = { s1: { m1: { base: 100, groupe: 90 }, m2: { base: -10, groupe: -9 } }, s2: { m2: { base: 300, groupe: 270 } } }
    const e = envelopes({ segments, totals, magIds: ['m1', 'm2'], hasGroupe: true, keepUnivers: u => u === 'RUNNING' })
    assert.deepEqual({ base: e.base, groupe: e.groupe, objectif: e.objectif }, { base: 90, groupe: 81, objectif: 90 })
    assert.deepEqual(e.parUnivers.get('RUNNING'), { base: 90, groupe: 81, objectif: 90 })
  })
  it('calcule évolutions, parts et top avec « Autres »', () => {
    assert.equal(evol(110, 100).toFixed(1), '10.0')
    assert.equal(evol(5, 0), null)
    assert.equal(part(25, 100), 25)
    const items = 'ABCDEFGHIJ'.split('').map((l, i) => ({ label: l, v: 10 - i }))
    const top = topWithOthers(items, i => i.v, 3)
    assert.deepEqual(top.map(t => [t.label, t.value]), [['A', 10], ['B', 9], ['C', 8], ['Autres', 28]])
  })
})
