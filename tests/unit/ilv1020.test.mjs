import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { erreurMontant, libelle1020, lireMontant, pages1020, peutFaireIlv1020, textes1020 } from '../../src/lib/ilv1020.js'

describe('ILV 10×20 : montants', () => {
  it('euros entiers, espaces et « € » acceptés', () => {
    assert.equal(lireMontant('20'), 20)
    assert.equal(lireMontant(' 200 € '), 200)
    assert.equal(lireMontant('1 000'), 1000)
    assert.equal(lireMontant(50), 50)
  })
  it('vide, centimes, pourcentage, zéro ou trop grand : refusé', () => {
    for (const s of ['', '20,50', '20.5', '20%', '-20', '0', '10000', 'abc', null]) assert.equal(lireMontant(s), null, s)
    assert.equal(erreurMontant(''), 'Indique le montant.')
    assert.ok(erreurMontant('20%'))
    assert.equal(erreurMontant('20'), null)
  })
  it('textes des chevalets', () => {
    assert.deepEqual(textes1020('promo', 20), { grand: '-20€' })
    assert.deepEqual(textes1020('soldes', 200), { grand: '-200€' })
    assert.deepEqual(textes1020('bons_plans', 30), { grand: '-30€' })
    assert.deepEqual(textes1020('carte_cadeau', 100), { grand: '100€ OFFERTS', petit: 'EN CARTE CADEAU*' })
    assert.deepEqual(textes1020('prix_promo'), {})
  })
})

describe('ILV 10×20 : liste à imprimer', () => {
  it('une page par exemplaire, modèles fixes sans montant', () => {
    const pages = pages1020([
      { modele: 'promo', montant: '20', quantite: 2 },
      { modele: 'presque_parfait', montant: '', quantite: 1 },
    ])
    assert.deepEqual(pages, [
      { modele: 'promo', montant: 20 }, { modele: 'promo', montant: 20 }, { modele: 'presque_parfait', montant: null },
    ])
  })
  it('lignes invalides ignorées, quantité bornée', () => {
    assert.deepEqual(pages1020([{ modele: 'soldes', montant: 'x', quantite: 1 }, { modele: 'inconnu', quantite: 1 }]), [])
    assert.equal(pages1020([{ modele: 'prix_promo', quantite: 99 }]).length, 20)
    assert.equal(pages1020([{ modele: 'prix_promo', quantite: 0 }]).length, 1)
  })
  it('libellés', () => {
    assert.equal(libelle1020({ modele: 'promo', montant: 20 }), 'Promo -20 €')
    assert.equal(libelle1020({ modele: 'bons_plans', montant: 15 }), 'Bons plans -15 €')
    assert.equal(libelle1020({ modele: 'carte_cadeau', montant: 100 }), 'Carte cadeau 100 € offerts')
    assert.equal(libelle1020({ modele: 'prix_promo' }), 'Prix promo')
  })
})

describe('ILV 10×20 : accès', () => {
  it('rayon vélo et au-dessus', () => {
    for (const role of ['velo', 'directeurmag', 'directeurgen', 'admin']) assert.equal(peutFaireIlv1020({ role }), true, role)
    for (const role of ['chaussure', 'textile', 'randonnee', 'caisse']) assert.equal(peutFaireIlv1020({ role }), false, role)
    assert.equal(peutFaireIlv1020({ role: 'acheteur', rayons: ['velo'] }), true)
    assert.equal(peutFaireIlv1020({ role: 'acheteur', rayons: ['chaussure'] }), false)
    assert.equal(peutFaireIlv1020(null), false)
  })
})
