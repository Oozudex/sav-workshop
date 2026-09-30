import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CATALOGUE, obutMinDeposit, catalogueByKind, catalogueItemErrors, emptyObutForm, isObutListed, obutFormErrors,
  obutFormFromCmd, obutLines, obutMatches, obutPayload, obutRemaining, obutStatus, obutTotal,
} from '../../src/lib/obut.js'

const NOW = new Date('2026-09-30T12:00:00')
const daysAgo = n => new Date(NOW.getTime() - n * 24 * 3600 * 1000)

describe('catalogue', () => {
  it("range les références par type", () => {
    const c = catalogueByKind(DEFAULT_CATALOGUE)
    assert.equal(c.boule.length, 10)
    assert.equal(c.boule[0].label, 'CX COU')
    assert.equal(c.marquage.length, 2)
    assert.deepEqual(c.option.map(o => o.id), ['livraison'])
  })
  it("valide une référence", () => {
    assert.deepEqual(Object.keys(catalogueItemErrors({ label: '', prix: '' })), ['label', 'prix'])
    assert.deepEqual(catalogueItemErrors({ label: 'ATX', prix: '-3' }), { prix: 'Prix invalide.' })
    assert.deepEqual(catalogueItemErrors({ label: 'ATX', prix: '320,50' }), {})
  })
})

describe('formulaire', () => {
  it("préremplit le premier modèle et les services par défaut", () => {
    const f = emptyObutForm(DEFAULT_CATALOGUE, '2026-09-30')
    assert.equal(f.modele.label, 'CX COU')
    assert.equal(f.modele.prix, '220,00')
    assert.deepEqual(f.options.map(o => o.label), ['Livraison'])
    assert.equal(obutTotal(f), 227.1)
  })
  it("calcule total et reste avec marquage", () => {
    const f = { ...emptyObutForm(DEFAULT_CATALOGUE, ''), marquage: { id: 'm', label: 'Marquage stylisé', prix: '19' }, marquageTexte: 'J.L.', acompte: '50' }
    assert.equal(obutTotal(f), 246.1)
    assert.equal(obutRemaining(f), 196.1)
    assert.equal(obutLines(f)[1].detail, 'J.L.')
  })
  it("acompte minimum : 30 % du total, au centime supérieur", () => {
    const f = emptyObutForm(DEFAULT_CATALOGUE, '')
    assert.equal(obutMinDeposit(f), 68.13) // 227,10 × 30 % = 68,13
    assert.equal(obutMinDeposit({ ...f, modele: null, options: [] }), null)
  })
  it("exige client, téléphone, texte de marquage et acompte cohérent", () => {
    const f = { ...emptyObutForm(DEFAULT_CATALOGUE, ''), marquage: { id: 'm', label: 'M', prix: '15' }, acompte: '9999' }
    assert.deepEqual(Object.keys(obutFormErrors(f)).sort(), ['acompte', 'clientNom', 'clientTel', 'marquageTexte'])
  })
  it("fige les prix dans la commande", () => {
    const f = { ...emptyObutForm(DEFAULT_CATALOGUE, '2026-09-30'), clientNom: ' Martin ', clientTel: '0600000000' }
    const p = obutPayload(f)
    assert.equal(p.clientNom, 'Martin')
    assert.equal(p.prixModele, 220)
    assert.deepEqual(p.options, [{ id: 'livraison', label: 'Livraison', prix: 7.1 }])
    assert.equal(p.totalTTC, 227.1)
    assert.equal(p.marquage, null)
  })
})

describe('anciennes commandes', () => {
  it("relit type de marquage et livraison séparés", () => {
    const old = { modele: 'ATX', prixModele: 320, marquageType: 'classique', marquage: 'N°7', prixMarquage: 15, prixLivraison: 7.1 }
    assert.deepEqual(obutLines(old).map(l => [l.label, l.prix]), [['Boules ATX', 320], ['Marquage classique / italique', 15], ['Livraison', 7.1]])
    assert.equal(obutTotal(old), 342.1)
    assert.equal(obutFormFromCmd(old).marquageTexte, 'N°7')
  })
})

describe('statuts', () => {
  it("statut inconnu = à commander", () => {
    assert.equal(obutStatus({ statut: 'bizarre' }), 'en_attente')
  })
  it("les terminées restent visibles 14 jours", () => {
    assert.equal(isObutListed({ statut: 'commande' }, NOW), true)
    assert.equal(isObutListed({ statut: 'livre', closedAt: daysAgo(3) }, NOW), true)
    assert.equal(isObutListed({ statut: 'livre', closedAt: daysAgo(20) }, NOW), false)
    assert.equal(isObutListed({ statut: 'livre' }, NOW), false)
  })
  it("recherche par téléphone sans espaces", () => {
    assert.equal(obutMatches({ clientTel: '06 12 34 56 78' }, '0612'), true)
    assert.equal(obutMatches({ clientNom: 'Martin' }, 'dupont'), false)
  })
})
