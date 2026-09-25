import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bonPlanDocId, bonPlanTransfer, parseBonPlanSheet, remiseBonPlan } from '../../src/lib/bonPlan.js'

describe('identifiant des prix bon plan', () => {
  it('le chrono, sinon la réf. fournisseur', () => {
    assert.equal(bonPlanDocId({ chrono: ' 0-245463 ' }), '0-245463')
    assert.equal(bonPlanDocId({ refFournisseur: 'C945 2329' }), 'ref-C9452329')
    assert.equal(bonPlanDocId({ chrono: 'A/B' }), 'A_B')
    assert.equal(bonPlanDocId({}), null)
  })
})

describe('import Excel des prix bon plan', () => {
  it('lit les nouvelles et les anciennes en-têtes, un prix par chrono', () => {
    const { rows, skipped, error } = parseBonPlanSheet([
      ['Nom', 'Marque', 'Chrono', 'Segment', 'Prix fort', 'Prix exclu team'],
      ['ATOM CITY WAVE', 'BH', '1-17587', 'VELO', '2 049,90 €', '1499,99'],
      ['ATOM CITY WAVE', 'BH', '1-17587', 'VELO', 2049.9, 1415], // la dernière ligne l'emporte
      ['SANS CHRONO', 'BH', '', 'VELO', 100, 90],
      ['', '', '', '', '', ''],
    ])
    assert.equal(error, null)
    assert.equal(skipped, 1)
    assert.deepEqual(rows, [{ nom: 'ATOM CITY WAVE', marque: 'BH', chrono: '1-17587', segment: 'VELO', prixFort: 2049.9, prixBonPlan: 1415 }])
    assert.equal(remiseBonPlan(rows[0]), 31)
  })
  it('signale un fichier sans les colonnes obligatoires', () => {
    assert.match(parseBonPlanSheet([['Nom', 'Prix']]).error, /Chrono/)
  })
})

describe('passage en bon plan à la fin de l\'OP', () => {
  const produits = [
    { id: 'p1', nom: 'CROSSOVER XV', chrono: '0-264046', prixFort: 2099.99, prixOp: 1799.99, passeBonPlan: true },
    { id: 'p2', nom: 'CROSSOVER XV', chrono: '0-264046', prixFort: 2099.99, prixOp: 1799.99, passeBonPlan: true }, // doublon
    { id: 'p3', nom: 'MAILLOT', refFournisseur: '2248840', prixOp: 27.99, passeBonPlan: true },
    { id: 'p4', nom: 'DÉJÀ FAIT', chrono: '0-1', prixOp: 10, passeBonPlan: true, bonPlanTransfere: true },
    { id: 'p5', nom: 'PAS COCHÉ', chrono: '0-2', prixOp: 10 },
    { id: 'p6', nom: 'SANS IDENTIFIANT', prixOp: 10, passeBonPlan: true },
  ]
  it('un prix bon plan par chrono, le prix OP devient le prix bon plan', () => {
    const { docs, produitIds, skipped } = bonPlanTransfer(produits, 'op1')
    assert.deepEqual(docs.map(d => [d.id, d.data.prixBonPlan, d.data.prixFort]), [['0-264046', 1799.99, 2099.99], ['ref-2248840', 27.99, null]])
    assert.equal(docs[0].data.sourceOpId, 'op1')
    assert.deepEqual(produitIds, ['p1', 'p2', 'p3'])
    assert.deepEqual(skipped.map(p => p.id), ['p6'])
  })
})
