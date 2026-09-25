import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildIlv, fmtEuroCents, fmtPoint, fmtRemise, ilvTypesFor, oneyAllowed, oneyMonthly, packPrice, titleName,
} from '../../src/lib/ilv.js'

// Mêmes données que les ILV Piivo de référence (Allroad 450, pack sport)
const ALLROAD = { nom: 'ALLROAD 450', marque: 'NAKAMURA', reference: 'YJ60H8PF B06ZZS', prixFort: 1499.99, pack: 'sport' }

describe('formats et calculs', () => {
  it('formate les prix comme Piivo', () => {
    assert.equal(fmtPoint(1499.99), '1499.99€')
    assert.equal(fmtEuroCents(1539.98), '1539€98')
    assert.equal(fmtRemise(200), '-200€')
    assert.equal(fmtRemise(200.5), '-200€50')
  })
  it('packs 1 an et 2 ans', () => {
    assert.equal(packPrice('enfant', 1), 9.99)
    assert.equal(packPrice('electrique', 2), 95.98)
    assert.equal(packPrice(null), null)
  })
  it('mensualités Oney arrondies au centime, montants acceptés', () => {
    assert.equal(oneyMonthly(1539.98, 3), 513.33)
    assert.equal(oneyMonthly(2239.98, 4), 560)
    assert.ok(oneyAllowed(3, 1539.98))
    assert.ok(!oneyAllowed(3, 79.99))
    assert.ok(!oneyAllowed(4, 6000.01))
  })
  it('nom du modèle dans la référence', () => {
    assert.equal(titleName('ALLROAD 450'), 'Allroad 450')
    assert.equal(titleName('CROSSOVER XV LTD'), 'Crossover XV LTD')
    assert.equal(titleName('E-SUMMIT 730'), 'E-Summit 730')
  })
})

describe('modèles', () => {
  it('prix engagé prioritaire, puis promo, bons plans, normale', () => {
    assert.deepEqual(ilvTypesFor({ prixEngage: 1299.99, prixOp: 1199.99, prixFort: 1499.99 }), ['engage'])
    assert.deepEqual(ilvTypesFor({ prixOp: 1299.99, prixBonPlan: 1399.99, prixFort: 1499.99 }), ['promo', 'bonplan', 'normal'])
    assert.deepEqual(ilvTypesFor({ prixFort: 1499.99 }), ['normal'])
  })

  it('ILV normale : pack inclus, Oney 3x', () => {
    const ilv = buildIlv({ ...ALLROAD, type: 'normal' }, { oney: 3 })
    assert.deepEqual(ilv.big, { int: '1539', dec: '.98' })
    assert.deepEqual(ilv.lines, ['PRIX ALLROAD 450 : 1499.99€', 'PRIX PACK OPTIONNEL 39.99€'])
    assert.equal(ilv.refLine, 'Réf. :  YJ60H8PF B06ZZS / Allroad 450')
    assert.equal(ilv.oney.monthly, '513€33')
    assert.equal(ilv.oney.mentions[1], 'particuliers et valable pour tout achat de 80€ à 6000€. Crédit affecté sur 3 mois au')
    assert.equal(buildIlv({ ...ALLROAD, type: 'normal' }).oney, null)
  })

  it('ILV promo : prix barré et remise pack inclus, dates de l\'OP', () => {
    const ilv = buildIlv({ ...ALLROAD, type: 'promo', prixOp: 1299.99, dateDebut: '2026-09-19', dateFin: '2026-10-04' })
    assert.equal(ilv.barre, '1539€98')
    assert.equal(ilv.remise, '-200€')
    assert.deepEqual(ilv.big, { int: '1339', dec: '.98' })
    assert.equal(ilv.lines[1], 'PRIX PROMO : 1299.99€')
    assert.equal(ilv.dates, 'Du 19/09/2026 au 04/10/2026')
  })

  it('ILV promo sur un vélo déjà en bon plan : le prix bon plan devient le prix barré', () => {
    const ilv = buildIlv({ ...ALLROAD, type: 'promo', prixOp: 1199.99, prixBonPlan: 1299.99 })
    assert.equal(ilv.barre, '1339€98')
    assert.equal(ilv.remise, '-100€')
    assert.deepEqual(ilv.lines.slice(1, 3), ['PRIX BON PLAN : 1299.99€', 'PRIX PROMO : 1199.99€'])
  })

  it('ILV bons plans et prix engagé : prix conseillé pack inclus', () => {
    const bp = buildIlv({ ...ALLROAD, type: 'bonplan', prixBonPlan: 1299.99 }, { duree: 2 })
    assert.equal(bp.conseille, 'Prix conseillé : 1563€97')
    assert.deepEqual(bp.big, { int: '1363', dec: '.97' })
    assert.equal(bp.lines[2], 'PRIX PACK OPTIONNEL 63.98€')
    const en = buildIlv({ ...ALLROAD, type: 'engage', prixEngage: 1299.99 })
    assert.equal(en.lines[1], 'PRIX ENGAGÉ : 1299.99€')
  })

  it('signale les données manquantes', () => {
    assert.match(buildIlv({ ...ALLROAD, pack: null, type: 'normal' }).error, /Pack/)
    assert.match(buildIlv({ ...ALLROAD, prixFort: null, type: 'normal' }).error, /Prix fort/)
    assert.match(buildIlv({ ...ALLROAD, type: 'engage' }).error, /engagé/)
  })
})

describe('accessoires', () => {
  const ANTIVOL = { nom: 'ANTIVOL ABUS 6000K', marque: 'ABUS', reference: '6000K', segment: 'accessoires', prixFort: 99.99 }
  it('pas de pack : ni dans le prix, ni dans le détail', () => {
    const n = buildIlv({ ...ANTIVOL, type: 'normal' }, { duree: 2 })
    assert.deepEqual(n.big, { int: '99', dec: '.99' })
    assert.deepEqual(n.lines, ['PRIX ANTIVOL ABUS 6000K : 99.99€'])
    const bp = buildIlv({ ...ANTIVOL, type: 'bonplan', prixBonPlan: 69.99, pack: 'sport' })
    assert.equal(bp.conseille, 'Prix conseillé : 99€99')
    assert.equal(bp.lines.length, 2)
    const promo = buildIlv({ ...ANTIVOL, type: 'promo', prixOp: 79.99 })
    assert.equal(promo.barre, '99€99')
    assert.equal(promo.remise, '-20€')
  })
})

describe('référence', () => {
  it('sans référence, on affiche la réf. fournisseur ou le chrono', () => {
    assert.equal(buildIlv({ ...ALLROAD, reference: null, chrono: '0-228749', type: 'normal' }).refLine, 'Réf. :  0-228749 / Allroad 450')
  })
})
