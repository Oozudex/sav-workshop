import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { catalogueData, catalogueFormErrors, catalogueFormValues, remiseSur } from '../../src/lib/catalogueForm.js'

const valide = {
  ...catalogueFormValues(null),
  nom: 'Allroad 450', marque: 'nakamura', chrono: ' 0-252871 ', reference: 'yj60h8pf b06zzs',
  prixFort: '1 499,99', pack: 'sport',
}

describe('formulaire produit', () => {
  it('reprend un produit existant et son prix bon plan', () => {
    const v = catalogueFormValues({ nom: 'ALLROAD', prixFort: 1499.99, prixEngage: 1299.99, pack: 'sport' }, 1349.99)
    assert.equal(v.prixFort, '1499,99')
    assert.equal(v.engage, true)
    assert.equal(v.bonPlan, true)
    assert.equal(v.prixBonPlan, '1349,99')
  })

  it('un formulaire complet est valide et nettoyé', () => {
    assert.deepEqual(catalogueFormErrors(valide), {})
    const d = catalogueData(valide)
    assert.equal(d.chrono, '0-252871')
    assert.equal(d.nom, 'ALLROAD 450')
    assert.equal(d.reference, 'YJ60H8PF B06ZZS')
    assert.equal(d.prixFort, 1499.99)
    assert.equal(d.prixEngage, null)
  })

  it('champs obligatoires et chrono déjà pris', () => {
    const e = catalogueFormErrors({ ...catalogueFormValues(null) })
    assert.deepEqual(Object.keys(e).sort(), ['chrono', 'nom', 'pack', 'prixFort'])
    const produits = [{ id: 'a', chrono: '0-252871' }]
    assert.equal(catalogueFormErrors(valide, { produits }).chrono, 'Ce chrono existe déjà')
    assert.deepEqual(catalogueFormErrors(valide, { produits, id: 'a' }), {})
  })

  it('prix engagé et prix bon plan : renseignés et inférieurs au prix fort', () => {
    assert.equal(catalogueFormErrors({ ...valide, bonPlan: true }).prixBonPlan, 'Renseigne le prix bon plan')
    assert.equal(catalogueFormErrors({ ...valide, engage: true, prixEngage: '1600' }).prixEngage, 'Doit être inférieur au prix fort')
    assert.deepEqual(catalogueFormErrors({ ...valide, bonPlan: true, prixBonPlan: '1299,99' }), {})
    assert.equal(remiseSur('1499,99', '1299,99'), 13)
    assert.equal(remiseSur('1499,99', ''), null)
  })
})

describe('segments', () => {
  it('liste déroulante : Vélos PP, Vélo, Accessoires, reconnus depuis les anciennes saisies', async () => {
    const { normSegment } = await import('../../src/lib/opImport.js')
    assert.equal(normSegment('Vélos PP'), 'velo_pp')
    assert.equal(normSegment('velo_pp'), 'velo_pp')
    assert.equal(normSegment('VELO'), 'velo')
    assert.equal(normSegment('ACCESSOIRE DU VELO'), 'accessoires')
    assert.equal(catalogueFormValues({ segment: 'VELO' }).segment, 'velo')
    assert.equal(catalogueFormValues({ segment: 'TEXTILE' }).segment, '')
    assert.equal(catalogueData({ ...valide, segment: 'velo_pp' }).segment, 'velo_pp')
  })
})

describe('accessoires sans pack', () => {
  it('le pack n’est pas demandé et n’est pas enregistré', () => {
    const accessoire = { ...valide, segment: 'accessoires', pack: '' }
    assert.deepEqual(catalogueFormErrors(accessoire), {})
    assert.equal(catalogueData({ ...accessoire, pack: 'sport' }).pack, null)
    assert.equal(catalogueFormErrors({ ...valide, pack: '' }).pack, 'Choisis le pack de ce vélo')
  })
})
