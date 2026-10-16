import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { n1DepuisLigne, n1RepriseDe } from '../../functions/lib.js'

describe('N-1 du budget suivant tenu à jour (majN1Suivant)', () => {
  const ligne = (saisie, extra = {}) => ({ univers: 'CYCLE', segId: 'cycle__velo', segment: 'VELO', nom: 'GRANVILLE', saisie, ...extra })

  it('ne suit que le budget dont le N-1 a été repris de celui-ci', () => {
    const ah27 = { nom: 'BUDGET AH27' }
    assert.equal(n1RepriseDe({ n1Import: { source: 'BUDGET AH27' } }, ah27), true)
    assert.equal(n1RepriseDe({ n1Import: { source: 'Excel · BUDGET AH27' } }, ah27), false)
    assert.equal(n1RepriseDe({}, ah27), false)
    assert.equal(n1RepriseDe({ n1Import: { source: 'BUDGET AH27' }, suppression: true }, ah27), false)
  })

  it('recopie saisie, quantités et commentaire dans le N-1', () => {
    assert.deepEqual(n1DepuisLigne(ligne({ a: 10 }), ligne({ a: 12, b: 3 }, { quantite: { a: 4 }, commentaire: 'ok' })), {
      univers: 'CYCLE', segId: 'cycle__velo', segment: 'VELO', nom: 'GRANVILLE', n1: { a: 12, b: 3 }, quantiteN1: { a: 4 }, commentaireN1: 'ok',
    })
    assert.deepEqual(n1DepuisLigne(null, ligne({ a: 5 })).n1, { a: 5 })
  })

  it('rien à faire si la saisie ne change pas (N-1, engagé, notes…)', () => {
    assert.equal(n1DepuisLigne(ligne({ a: 10, b: 2 }), ligne({ b: 2, a: 10 }, { n1: { a: 1 }, engage: true })), null)
  })

  it('une ligne supprimée vide le N-1 de la marque', () => {
    assert.deepEqual(n1DepuisLigne(ligne({ a: 10 }), null), {
      univers: 'CYCLE', segId: 'cycle__velo', segment: 'VELO', nom: 'GRANVILLE', n1: {}, quantiteN1: {}, commentaireN1: '',
    })
  })
})
