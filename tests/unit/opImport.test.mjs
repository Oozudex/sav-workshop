import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  bonPlanByChrono, isBlueFill, isBonPlanBetter, normSegment, parseOpSheet, parsePrice,
  planImport, prixReference, remisePct, resolveLines,
} from '../../src/lib/opImport.js'

// Extrait de « Test op commercial » (fichier réel de la centrale) et de la base des vélos en stock
const SHEET = [
  ['Nom', 'Marque', 'Réf fournisseur', 'Segment', 'Prix fort', 'Prix op'],
  ['MAILLOT DE VELO HOMME', 'NAKAMURA', 2248840, 'HABILLEMENT', 35.99, 27.99],
  ['SACOCHE DE SELLE 14L', 'NAKAMURA', 'C9452329', 'ACCESSOIRE DU VELO', 39.99, 29.99],
  ['ALLROAD LTD', 'NAKAMURA', 'YJ60HL', 'VELO', 1299.99, 999.99],
  ['VELO ENFANT COMPLITE EVO KID', 'NAKAMURA', 'YF60U0', 'VELO', 319.99, 269.99],
  ['CROSSOVER XV', 'NAKAMURA', '\n\nYH60WY', 'VELO', 2099.99, 1799.99],
  ['ATOM CITY WAVE', 'BH', '1-17587', 'VELO', '2049.90 €', 1450],
  ['CROSSOVER S', 'NAKAMURA', 'ZZ9999', 'VELO', 1199.99, 899.99],
  ['VELO FANTOME', 'NAKAMURA', 'XX0000', 'VELO', 999.99, 799.99],
]
const FILLS = [[], [], [], ['00FFFF'], [], [null, null, null, null, null, 'FFFF00']]

const CATALOGUE = [
  { id: 'a1', reference: 'YJ60HL 011M80', chrono: '0-252871', nom: 'ALLROAD LTD', couleur: 'NOIR', segment: 'VELO' },
  { id: 'c1', reference: 'YF60U0 000C4R', chrono: '0-237536', nom: 'COMPLITE KID', segment: 'VELO' },
  { id: 'x1', reference: 'YH60WY 0007N9', chrono: '0-264046', nom: 'CROSSOVER XV', couleur: 'BLEU' },
  { id: 'x2', reference: 'YH60WY 014TVP', chrono: '0-254888', nom: 'CROSSOVER XV', couleur: 'VERT' },
  { id: 'x3', reference: 'YG60WY 000AGE', chrono: '0-230001', nom: 'CROSSOVER XV', couleur: 'GRIS' }, // ancien modèle
  { id: 'b1', reference: 'EA411 E02', chrono: '1-17587', nom: 'ATOM CITY WAVE' },
  { id: 's1', reference: 'YC60WS 011M80', chrono: '0-191743', nom: 'CROSSOVER S' },
  { id: 's2', reference: 'YB60WS 011M80', chrono: '0-150000', nom: 'CROSSOVER S' },
]

const parsed = () => parseOpSheet(SHEET, FILLS).rows
const resolved = () => resolveLines(parsed(), CATALOGUE)

describe('lecture du fichier', () => {
  it('lit les prix saisis de toutes les façons', () => {
    assert.equal(parsePrice('2049.90 €'), 2049.9)
    assert.equal(parsePrice('1 299,99'), 1299.99)
    assert.equal(parsePrice('1.299,99 €'), 1299.99)
    assert.equal(parsePrice('1,299.99'), 1299.99)
    assert.equal(parsePrice(999.99), 999.99)
    assert.equal(parsePrice(''), null)
    assert.equal(parsePrice('N/C'), null)
  })

  it('reconnaît les segments de la centrale', () => {
    assert.equal(normSegment('VELO'), 'velo')
    assert.equal(normSegment('ACCESSOIRE DU VELO'), 'accessoires')
    assert.equal(normSegment('HABILLEMENT'), 'textile')
    assert.equal(normSegment(''), null)
  })

  it('nettoie les cellules et repère les lignes en bleu', () => {
    const rows = parsed()
    assert.equal(rows.length, 8)
    assert.equal(rows[0].refFournisseur, '2248840')
    assert.equal(rows[4].refFournisseur, 'YH60WY')
    assert.equal(rows[5].prixFort, 2049.9)
    assert.deepEqual(rows.map(r => r.highlighted), [false, false, true, false, false, false, false, false])
    assert.equal(rows[2].line, 4)
  })

  it('trouve les en-têtes sous un titre, et signale un fichier sans en-têtes', () => {
    const { rows } = parseOpSheet([['OP printemps'], [], ...SHEET])
    assert.equal(rows.length, 8)
    assert.equal(rows[0].line, 4)
    assert.match(parseOpSheet([['a', 'b'], [1, 2]]).error, /En-têtes introuvables/)
  })

  it('bleu = du cyan au bleu, ni le jaune ni les gris', () => {
    for (const c of ['00FFFF', 'BDD7EE', 'DDEBF7', '4472C4', 'B3CEFB', '0000FF']) assert.ok(isBlueFill(c), c)
    for (const c of ['FFFF00', 'FFFFFF', 'F9FAFB', 'FF0000', '00FF00', 'D9D9D9', null]) assert.ok(!isBlueFill(c), c)
  })
})

describe('rapprochement avec la base des vélos', () => {
  it('retrouve les vélos par leur réf. fournisseur même quand le nom diffère', () => {
    const r = resolved()
    assert.equal(r[3].status, 'found')
    assert.deepEqual(r[3].matches.map(m => m.id), ['c1'])
  })

  it('ne mélange pas le modèle actuel avec les anciens', () => {
    const xv = resolved()[4]
    assert.equal(xv.how, 'modele')
    assert.deepEqual(xv.matches.map(m => m.id), ['x1', 'x2'])
  })

  it('accepte un chrono dans la colonne réf. fournisseur', () => {
    const atom = resolved()[5]
    assert.equal(atom.how, 'chrono')
    assert.deepEqual(atom.matches.map(m => m.id), ['b1'])
  })

  it('le nom seul est à vérifier, rien ne correspond = pas en stock', () => {
    const r = resolved()
    assert.equal(r[6].status, 'check')
    assert.deepEqual(r[6].matches.map(m => m.id), ['s1', 's2'])
    assert.equal(r[7].status, 'missing')
  })

  it('garde les produits hors vélo sans vérifier le stock', () => {
    const r = resolved()
    assert.equal(r[0].status, 'outside')
    assert.equal(r[1].status, 'outside')
  })
})

describe('prix bon plan', () => {
  const bonPlans = bonPlanByChrono([
    { chrono: '0-252871', prixExcluTeam: 1099.99, importedAt: new Date('2026-01-01') },
    { chrono: '0-252871', prixExcluTeam: 1149.99, importedAt: new Date('2026-06-01') },
    { chrono: '1-17587', prixExcluTeam: 1415 },
  ])

  it('prend le prix bon plan le plus récent', () => {
    assert.equal(bonPlans.get('0-252871'), 1149.99)
  })

  it('le prix bon plan devient le prix de référence de la remise, le prix fort est conservé', () => {
    const allroad = planImport(resolved(), { bonPlans }).find(p => p.data.chrono === '0-252871').data
    assert.equal(allroad.prixFort, 1299.99)
    assert.equal(allroad.prixBonPlan, 1149.99)
    assert.equal(prixReference(allroad), 1149.99)
    assert.equal(remisePct(allroad), 13)
    assert.ok(!isBonPlanBetter(allroad))
  })

  it('un bon plan déjà moins cher que l\'OP : on garde le prix fort comme référence', () => {
    const atom = planImport(resolved(), { bonPlans }).find(p => p.data.chrono === '1-17587').data
    assert.ok(isBonPlanBetter(atom))
    assert.equal(prixReference(atom), 2049.9)
  })

  it('sans bon plan, la remise part du prix fort', () => {
    assert.equal(remisePct({ prixFort: 200, prixOp: 150, prixBonPlan: null }), 25)
  })
})

describe('import et réimport', () => {
  it('une ligne par déclinaison, les lignes en bleu passent en bon plan, « à vérifier » selon les cases cochées', () => {
    const r = resolved()
    const plan = planImport(r, { bonPlan: { 2: true }, selected: { 6: ['s1'] } })
    assert.equal(plan.length, 8) // 2 hors vélo + ALLROAD + COMPLITE + 2 XV + ATOM + CROSSOVER S
    assert.ok(plan.every(p => p.action === 'create'))
    assert.equal(plan.find(p => p.data.chrono === '0-252871').data.passExcluTeam, true)
    assert.equal(plan.find(p => p.data.chrono === '0-191743').line, 8)
    const maillot = plan.find(p => p.data.refFournisseur === '2248840').data
    assert.equal(maillot.horsCatalogue, true)
    assert.equal(maillot.segment, 'textile')
  })

  it('réimport : met à jour le prix des produits déjà présents et ajoute les nouveaux, sans doublon', () => {
    const first = planImport(resolved()).map((p, i) => ({ id: `p${i}`, ...p.data }))
    const xv = first.find(p => p.chrono === '0-264046')
    xv.prixOp = 1899.99 // prix de la première version de l'OP
    const existing = first.filter(p => p.chrono !== '1-17587') // ATOM ajouté dans la nouvelle version

    const plan = planImport(resolved(), { existing })
    const byChrono = c => plan.find(p => p.data.chrono === c)
    assert.equal(byChrono('0-264046').action, 'update')
    assert.equal(byChrono('0-264046').existing.id, xv.id)
    assert.equal(byChrono('0-264046').data.prixOp, 1799.99)
    assert.equal(byChrono('1-17587').action, 'create')
    assert.equal(byChrono('0-252871').action, 'same')
    assert.equal(plan.find(p => p.data.refFournisseur === '2248840').action, 'same')
  })

  it('la même déclinaison deux fois dans le fichier n\'est importée qu\'une fois', () => {
    const r = resolved()
    const plan = planImport([r[4], { ...r[4], prixOp: 1699.99, line: 20 }])
    assert.equal(plan.length, 2)
    assert.ok(plan.every(p => p.data.prixOp === 1699.99))
  })
})
