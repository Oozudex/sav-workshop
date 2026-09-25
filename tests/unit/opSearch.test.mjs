import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPromoIndex, isOpVisibleFor, opStatus, searchPromos } from '../../src/lib/opSearch.js'

const TODAY = '2026-09-25'
const OPS = [
  { id: 'rentree', nom: 'Rentrée', dateDebut: '2026-09-20', dateFin: '2026-09-30', rayonTypes: ['velo'], magasinIds: ['nord'] },
  { id: 'toussaint', nom: 'Toussaint', dateDebut: '2026-10-20', dateFin: '2026-11-02', rayonTypes: null, magasinIds: null },
  { id: 'ete', nom: 'Été', dateDebut: '2026-07-01', dateFin: '2026-08-31' },
]

describe('visibilité des OP', () => {
  const [rentree, toussaint] = OPS
  it('statut selon les dates', () => {
    assert.deepEqual(OPS.map(o => opStatus(o, TODAY)), ['en_cours', 'a_venir', 'terminee'])
  })
  it('vendeur : son rayon et son magasin', () => {
    assert.ok(isOpVisibleFor(rentree, { role: 'velo', magasinId: 'nord' }))
    assert.ok(!isOpVisibleFor(rentree, { role: 'velo', magasinId: 'sud' }))
    assert.ok(!isOpVisibleFor(rentree, { role: 'textile', magasinId: 'nord' }))
    assert.ok(isOpVisibleFor(toussaint, { role: 'textile', magasinId: 'sud' }))
  })
  it('acheteur : les rayons qu\'il suit ; directeurs', () => {
    assert.ok(isOpVisibleFor(rentree, { role: 'acheteur', rayons: ['velo'] }))
    assert.ok(!isOpVisibleFor(rentree, { role: 'acheteur', rayons: ['chaussure'] }))
    assert.ok(isOpVisibleFor(rentree, { role: 'directeurgen' }))
    assert.ok(!isOpVisibleFor(rentree, { role: 'directeurmag', magasinId: 'sud' }))
    assert.ok(isOpVisibleFor({ ...rentree, rayonTypes: null, rayonType: 'velo' }, { role: 'velo', magasinId: 'nord' }))
  })
})

describe('recherche des remises', () => {
  const produits = [
    // CROSSOVER XV : 2 couleurs en OP en cours, dont une qui passera en bon plan
    { opId: 'rentree', nom: 'CROSSOVER XV', marque: 'NAKAMURA', refFournisseur: 'YH60WY', chrono: '0-264046', couleur: 'BLEU ACIER', prixFort: 2099.99, prixOp: 1799.99, passeBonPlan: true },
    { opId: 'rentree', nom: 'CROSSOVER XV', marque: 'NAKAMURA', refFournisseur: 'YH60WY', chrono: '0-254888', couleur: 'THULIUM', prixFort: 2099.99, prixOp: 1799.99 },
    // … et à venir à la Toussaint
    { opId: 'toussaint', nom: 'CROSSOVER XV', marque: 'NAKAMURA', refFournisseur: 'YH60WY', chrono: '0-264046', couleur: 'BLEU ACIER', prixFort: 2099.99, prixOp: 1699.99 },
    // Déjà en bon plan : le prix bon plan est le prix barré
    { opId: 'rentree', nom: 'E SUMMIT 730', marque: 'NAKAMURA', chrono: '0-242846', prixFort: 1599.99, prixBonPlan: 1399.99, prixOp: 1199.99 },
    // OP terminée : ignorée
    { opId: 'ete', nom: 'CLIFF EVO MAX', marque: 'NAKAMURA', chrono: '0-252525', prixFort: 229.99, prixOp: 189.99 },
  ]
  const bonPlanList = [
    { nom: 'E-SUMMIT 730', marque: 'NAKAMURA', chrono: '0-242846', prixFort: 1599.99, prixBonPlan: 1399.99 },
    { nom: 'ATOM CITY WAVE', marque: 'BH', chrono: '1-17587', prixFort: 2049.9, prixBonPlan: 1415 },
  ]
  const index = buildPromoIndex({ ops: OPS, produits, bonPlanList, today: TODAY })

  it('regroupe les couleurs et les OP d\'un même produit, en cours avant à venir', () => {
    const [xv] = searchPromos(index, 'crossover xv')
    assert.deepEqual(xv.couleurs, ['BLEU ACIER', 'THULIUM'])
    assert.deepEqual(xv.ops.map(s => [s.op.id, s.prixOp, s.remise]), [['rentree', 1799.99, 14], ['toussaint', 1699.99, 19]])
    assert.deepEqual(xv.ops[0].couleurs, ['BLEU ACIER', 'THULIUM'])
    assert.equal(xv.ops[0].futurBonPlan, true)
    assert.equal(xv.ops[1].futurBonPlan, false)
  })

  it('rattache le prix bon plan par chrono même si le nom diffère', () => {
    const [summit] = searchPromos(index, 'summit')
    assert.equal(summit.nom, 'E SUMMIT 730')
    assert.equal(summit.ops[0].prixRef, 1399.99)
    assert.equal(summit.ops[0].refIsBonPlan, true)
    assert.equal(summit.bonPlans[0].prix, 1399.99)
    assert.equal(summit.bonPlans[0].remise, 13)
  })

  it('trouve par réf. fournisseur, chrono, couleur, sans tenir compte des accents ni de l\'ordre des mots', () => {
    assert.equal(searchPromos(index, 'yh60wy')[0].nom, 'CROSSOVER XV')
    assert.equal(searchPromos(index, '1-17587')[0].nom, 'ATOM CITY WAVE')
    assert.equal(searchPromos(index, 'thulium crossover').length, 1)
    assert.equal(searchPromos(index, 'éé').length, 0)
    assert.deepEqual(searchPromos(index, '  '), [])
  })

  it('ignore les OP terminées ; en OP en cours d\'abord, bon plan seul à la fin', () => {
    assert.equal(searchPromos(index, 'cliff').length, 0)
    assert.deepEqual(searchPromos(index, 'a').map(g => g.nom), ['CROSSOVER XV', 'E SUMMIT 730', 'ATOM CITY WAVE'])
  })
})

describe('prix bon plan en double', () => {
  it('un seul prix par chrono (le plus récent), le chrono distingue les déclinaisons', () => {
    const [g] = buildPromoIndex({ ops: [], produits: [], bonPlanList: [
      { nom: 'ATOM CITY WAVE', marque: 'BH', chrono: '1-17587', prixBonPlan: 1499.99, updatedAt: new Date('2026-01-01') },
      { nom: 'ATOM CITY WAVE', marque: 'BH', chrono: '1-17587', prixBonPlan: 1415, updatedAt: new Date('2026-06-01') },
      { nom: 'ATOM CITY WAVE', marque: 'BH', chrono: '1-17588', prixBonPlan: 1249.99 },
    ] })
    assert.deepEqual(g.bonPlans.map(b => [b.prix, b.chronos]), [[1415, ['1-17587']], [1249.99, ['1-17588']]])
  })
})
