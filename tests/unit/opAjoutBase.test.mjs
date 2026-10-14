import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clesOp, dejaDansOp, produitsDepuisBase, rechercherBase } from '../../src/lib/opAjoutBase.js'

const base = [
  { id: '1', nom: 'ALLROAD 450', marque: 'NAKAMURA', chrono: '0-271531', reference: 'R1', couleur: 'VERT', segment: 'velo', prixFort: 699.99, famille: 'VTC' },
  { id: '2', nom: 'ALLROAD 450', marque: 'NAKAMURA', chrono: '0-271532', reference: 'R1', couleur: 'BLEU', segment: 'velo', prixFort: 699.99 },
  { id: '3', nom: 'Élan 26"', marque: 'SUNN', chrono: '0-300001', couleur: 'NOIR', segment: 'velo_pp', prixFort: null },
  { id: '4', nom: 'ALLROAD 200', marque: 'NAKAMURA', chrono: '0-271600', couleur: 'GRIS', segment: 'velo', prixFort: 499.99 },
]

describe('ajout dans une OP depuis la base : recherche', () => {
  it('tous les mots, sans accents ni majuscules, groupés par modèle', () => {
    const { groupes, total } = rechercherBase(base, 'allroad 450')
    assert.equal(total, 1)
    assert.equal(groupes[0].nom, 'ALLROAD 450')
    assert.deepEqual(groupes[0].variantes.map(v => v.couleur), ['BLEU', 'VERT'])
    assert.equal(rechercherBase(base, 'elan')['groupes'][0].marque, 'SUNN')
    assert.equal(rechercherBase(base, '271600').groupes[0].nom, 'ALLROAD 200')
    assert.equal(rechercherBase(base, 'nakamura gris').total, 1)
  })
  it('moins de 2 caractères : rien ; résultats limités', () => {
    assert.equal(rechercherBase(base, 'a').total, 0)
    assert.equal(rechercherBase(base, '  ').total, 0)
    const r = rechercherBase(base, 'allroad', { limite: 1 })
    assert.equal(r.groupes.length, 1)
    assert.equal(r.total, 2)
  })
})

describe('ajout dans une OP depuis la base : création', () => {
  it('vélo déjà dans l’OP repéré par son chrono', () => {
    const cles = clesOp([{ chrono: '0-271531', nom: 'ALLROAD 450' }])
    assert.equal(dejaDansOp(base[0], cles), true)
    assert.equal(dejaDansOp(base[1], cles), false)
  })
  it('un produit par vélo, prix OP commun, prix fort de la base ou saisi', () => {
    const data = produitsDepuisBase([base[0], base[2]], { prixOp: 549.99, prixForts: { 3: 899 } })
    assert.deepEqual(data[0], {
      nom: 'ALLROAD 450', marque: 'NAKAMURA', reference: 'R1', refFournisseur: null, chrono: '0-271531',
      couleur: 'VERT', segment: 'velo', famille: 'VTC', prixFort: 699.99, prixOp: 549.99,
      passeBonPlan: false, horsCatalogue: false,
    })
    assert.equal(data[1].prixFort, 899)
    assert.equal(data[1].segment, 'velo_pp')
    assert.equal(data[1].reference, null)
  })
})
