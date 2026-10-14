import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTRE_MES_UNIVERS, FILTRE_TOUS, defaultUniversFilter, filterByUnivers, universOptions,
} from '../../src/lib/universFilter.js'

const ITEMS = [
  { id: 'shimano', univers: ['CYCLE'] },
  { id: 'nike', univers: ['TEXTILE HOMME', 'RUNNING'] },
  { id: 'hermes' },
  { id: 'vide', univers: [] },
]
const ids = list => list.map(i => i.id)

describe('univers des B2B et des services', () => {
  it("l'acheteur voit par défaut ses univers, les autres tout", () => {
    assert.equal(defaultUniversFilter({ role: 'acheteur', univers: ['CYCLE'] }), FILTRE_MES_UNIVERS)
    assert.equal(defaultUniversFilter({ role: 'acheteur', univers: [] }), FILTRE_TOUS)
    assert.equal(defaultUniversFilter({ role: 'directeurgen' }), FILTRE_TOUS)
    assert.equal(defaultUniversFilter({ role: 'velo' }), FILTRE_TOUS)
  })

  it('« Mes univers » : les communs et ceux de mes univers', () => {
    assert.deepEqual(ids(filterByUnivers(ITEMS, FILTRE_MES_UNIVERS, ['RUNNING'])), ['nike', 'hermes', 'vide'])
    assert.deepEqual(ids(filterByUnivers(ITEMS, FILTRE_MES_UNIVERS, [])), ['hermes', 'vide'])
  })

  it('un univers choisi : les communs et ceux de cet univers ; « Tous » : tout', () => {
    assert.deepEqual(ids(filterByUnivers(ITEMS, 'CYCLE')), ['shimano', 'hermes', 'vide'])
    assert.deepEqual(ids(filterByUnivers(ITEMS, FILTRE_TOUS)), ['shimano', 'nike', 'hermes', 'vide'])
  })

  it('propose les univers utilisés, triés', () => {
    assert.deepEqual(universOptions(ITEMS), ['CYCLE', 'RUNNING', 'TEXTILE HOMME'])
  })
})
