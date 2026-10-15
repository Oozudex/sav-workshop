import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTRE_SANS_ACHETEUR, addTotals, budgetRank, fournisseurResolver, coefMarque, computeAdapte, fournisseurKey, noteMarque, withAdapte, evolution, formatPct, groupeRatio, groupeTotal, objectif, brandsBySegment, budgetName, buyerFilterTest, defaultBuyerFilter, filtreAcheteur, canEditUnivers, computeTotals, editableLines, segmentsCatalog, findN1Sheet, linesFromBudget, magasinMatcher, mergeSegments, n1Columns,
  parseBaseSheet, parseN1Sheet, planN1Import, previousSeason, segmentId, sortSegments,
} from '../../src/lib/budgets.js'

const MAGASINS = [
  { id: 'cht', nom: 'CHATEAU GONTIER', code: 'CHT 274/0', alias: [] },
  { id: 'lf', nom: 'LA FERTE', code: 'LF 458/0', alias: ['LA FERTE BERNARD'] },
]
const matchMagasin = magasinMatcher(MAGASINS)
const UNIVERS = ['ACCESSOIRE TEXTILE', 'ALPINISME ET ESCALADE', 'BAGAGERIE', 'RANDONNEE']

// Extrait de « BASE BUDGET AH27 TYPE » (colonnes réduites : Univers, Magasin, …, Budget détail marques)
const BASE = [
  ['Budget édition - 724 - AH2027', '', '', ''],
  ['', '', 'Historique', 'Budget'],
  ['Univers', 'Magasin', 'CA TTC', 'Budget détail marques'],
  ['', 'TOTAUX', 999, 999],
  ['ACCESSOIRE TEXTILE', 'CHT 274/0', 1, 150],
  ['ACCESSOIRE TEXTILE', 'LF 458/0', 1, 80],
  ['  CEINTURE', 'CHT 274/0', 1, 100],
  ['  CEINTURE', 'LF 458/0', 1, 30],
  ['  CHAUSSETTES', 'CHT 274/0', 1, 50],
  ['  CHAUSSETTES', 'LF 458/0', 1, 50],
  ['ALPINISME ET ESCALADE', 'CHT 274/0', 1, 40],
  ['ALPINISME ET ESCALADE', 'LF 458/0', 1, 10],
  ['RANDONNEE', 'CHT 274/0', 1, 70],
  ['  BAGAGERIE', 'CHT 274/0', 1, 70],
  ['  BAGAGERIE', 'XYZ 1/0', 1, 5],
]

describe('saisons', () => {
  it('nomme le budget et trouve son N-1', () => {
    assert.equal(budgetName('AH', 2027), 'BUDGET AH27')
    assert.deepEqual(previousSeason({ saison: 'PE', annee: 2028 }), { saison: 'PE', annee: 2027 })
  })
})

describe('droits', () => {
  const acheteur = { role: 'acheteur', univers: ['CYCLE'] }
  it("la direction modifie tout, l'acheteur ses univers attitrés", () => {
    assert.equal(canEditUnivers({ role: 'directeurgen' }, 'GOLF'), true)
    assert.equal(canEditUnivers(acheteur, 'CYCLE'), true)
    assert.equal(canEditUnivers(acheteur, 'GOLF'), false)
    assert.equal(canEditUnivers({ role: 'acheteur' }, 'CYCLE'), false)
    assert.equal(canEditUnivers({ role: 'velo', univers: ['CYCLE'] }, 'CYCLE'), false)
  })
  it("un acheteur n'importe que ses univers", () => {
    assert.deepEqual(editableLines([{ univers: 'CYCLE' }, { univers: 'GOLF' }], acheteur), [{ univers: 'CYCLE' }])
  })
})

describe('filtre par acheteur', () => {
  const ACHETEURS = [{ id: 'paul', univers: ['CYCLE', 'GOLF'] }, { id: 'lea', univers: ['RUNNING'] }]
  const garde = (filtre, univers) => univers.filter(buyerFilterTest(filtre, ACHETEURS))
  const TOUS = ['CYCLE', 'GOLF', 'RUNNING', 'PECHE']

  it("un acheteur part de ses univers, la direction de tout", () => {
    assert.equal(defaultBuyerFilter({ role: 'acheteur', uid: 'paul', univers: ['CYCLE'] }), filtreAcheteur('paul'))
    assert.equal(defaultBuyerFilter({ role: 'acheteur', uid: 'x', univers: [] }), '')
    assert.equal(defaultBuyerFilter({ role: 'directeurgen', uid: 'd' }), '')
  })
  it("garde les univers de l'acheteur choisi, ou ceux sans acheteur", () => {
    assert.deepEqual(garde('', TOUS), TOUS)
    assert.deepEqual(garde(filtreAcheteur('paul'), TOUS), ['CYCLE', 'GOLF'])
    assert.deepEqual(garde(FILTRE_SANS_ACHETEUR, TOUS), ['PECHE'])
    assert.deepEqual(garde(filtreAcheteur('inconnu'), TOUS), [])
  })
})

describe('magasins', () => {
  it('reconnaît le code base, le nom et les alias, sans tenir compte des accents', () => {
    assert.equal(matchMagasin('CHT 274/0'), 'cht')
    assert.equal(matchMagasin('CHÂTEAU GONTIER '), 'cht')
    assert.equal(matchMagasin('la ferte bernard'), 'lf')
    assert.equal(matchMagasin('SARAN'), null)
  })
})

describe('parseBaseSheet', () => {
  const r = parseBaseSheet(BASE, { univers: UNIVERS, matchMagasin })

  it('range les segments sous leur univers et prend la colonne Budget détail marques', () => {
    assert.deepEqual(r.base[segmentId('ACCESSOIRE TEXTILE', 'CEINTURE')], { cht: 100, lf: 30 })
    assert.deepEqual(r.base[segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES')], { cht: 50, lf: 50 })
  })

  it("un segment décalé qui porte le nom d'un univers reste un segment (RANDONNEE > BAGAGERIE)", () => {
    assert.ok(r.segments.some(s => s.univers === 'RANDONNEE' && s.nom === 'BAGAGERIE'))
    assert.ok(!r.segments.some(s => s.univers === 'BAGAGERIE'))
  })

  it("un univers sans segment garde son budget sur l'univers entier", () => {
    const id = segmentId('ALPINISME ET ESCALADE')
    assert.deepEqual(r.segments.find(s => s.id === id), { id, univers: 'ALPINISME ET ESCALADE', nom: '' })
    assert.deepEqual(r.base[id], { cht: 40, lf: 10 })
    assert.equal(r.base[segmentId('ACCESSOIRE TEXTILE')], undefined)
  })

  it('signale les magasins inconnus et ignore la ligne TOTAUX', () => {
    assert.deepEqual(r.unknownMagasins, ['XYZ 1/0'])
    assert.deepEqual(r.stats, { univers: 3, segments: 3, lignes: 10 })
  })

  it("refuse un fichier sans colonnes Univers / Magasin", () => {
    assert.ok(parseBaseSheet([['a', 'b']], { univers: UNIVERS, matchMagasin }).error)
  })
})

// Extrait de l'onglet « BUDGET PAR MARQUES » du budget AH26
const N1 = [
  ['Univers New arbo', 'Segment New arbo', 'Segment ', 'Marques ', 'CHÂTEAU GONTIER ', '', 'LA FERTE BERNARD', '', 'BUDGET TOTAL', 'COMMENTAIRES'],
  ['', '', '', '', 'BUDGET AH25', 'BUDGET AH26', 'BUDGET AH25', 'BUDGET AH26', 'AH25', ''],
  ['ACCESSOIRE TEXTILE', 'ACCESSOIRE TEXTILECHAUSSETTES', 'CHAUSSETTES', 'Budget par segment ', 5958, '', 4323, '', 50000, ''],
  ['ACCESSOIRE TEXTILE', '', 'CHAUSSETTES', 'ADIDAS', 12454, 12393, 7344, 6174, 1, 'Voir\nconditions'],
  ['ACCESSOIRE TEXTILE', '', 'CHAUSSETTES', 'PUMA ', '', 588, '', '#DIV/0!', 1, ''],
  ['', '', '', 'TOTAL', 12454, 12981, 7344, 6174, 1, ''],
  ['ALPINISME ET ESCALADE', '', 'HABILLEMENT', 'MILLET', '', 200, '', '', 1, ''],
  ['SURF', '', 'PLANCHE', 'RIP CURL', '', 100, '', '', 1, ''],
]

describe('parseN1Sheet', () => {
  it("trouve l'onglet des marques", () => {
    assert.equal(findN1Sheet(['POIDS UNIVERS', 'BUDGET PAR MARQUES ', 'POIDS MARQUE']), 'BUDGET PAR MARQUES ')
  })

  it('propose les colonnes sous les magasins reconnus', () => {
    assert.deepEqual(n1Columns(N1, matchMagasin), ['BUDGET AH25', 'BUDGET AH26'])
  })

  const r = parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH26' })

  it('lit le budget par marque et par magasin de la colonne choisie', () => {
    const adidas = r.lines.find(l => l.nom === 'ADIDAS')
    assert.deepEqual(adidas.n1, { cht: 12393, lf: 6174 })
    assert.equal(adidas.commentaire, 'Voir conditions')
    assert.equal(adidas.segId, segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES'))
  })

  it('nettoie les noms de marque et ignore les cellules vides ou en erreur', () => {
    assert.deepEqual(r.lines.find(l => l.nom === 'PUMA').n1, { cht: 588 })
  })

  it('ignore les lignes Budget par segment et TOTAL, signale les univers inconnus', () => {
    assert.deepEqual(r.lines.map(l => l.nom), ['ADIDAS', 'PUMA', 'MILLET'])
    assert.deepEqual(r.unknownUnivers, ['SURF'])
    assert.equal(r.magasins, 2)
  })

  it("refuse une colonne absente", () => {
    assert.ok(parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH30' }).error)
  })
})

describe('planN1Import', () => {
  const base = parseBaseSheet(BASE, { univers: UNIVERS, matchMagasin })
  const { lines } = parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH26' })
  const brands = [{ id: 'x', segId: segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES'), nom: 'adidas' }]
  const plan = planN1Import(lines, brands, base.segments)

  it('rattache les marques de la liste et ajoute les autres à la liste', () => {
    assert.deepEqual(plan.matched.map(m => [m.id, m.line.nom]), [['x', 'ADIDAS']])
    assert.deepEqual(plan.missing.map(l => l.nom), ['PUMA', 'MILLET'])
  })

  it('ajoute les segments absents de la base', () => {
    assert.deepEqual(plan.newSegments, [{ id: segmentId('ALPINISME ET ESCALADE', 'HABILLEMENT'), univers: 'ALPINISME ET ESCALADE', nom: 'HABILLEMENT' }])
  })

  it('reprend la saisie du budget précédent comme N-1, sur la même marque', () => {
    const l = linesFromBudget([{ id: 'm1', segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', saisie: { cht: 10 }, quantite: { cht: 4 }, commentaire: 'ok' }])
    assert.deepEqual(l, [{ id: 'm1', segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', n1: { cht: 10 }, quantiteN1: { cht: 4 }, commentaire: 'ok' }])
  })
})

describe('marques des segments', () => {
  const brands = [
    { id: 'b', segId: 's1', univers: 'U', nom: 'PUMA' },
    { id: 'a', segId: 's1', univers: 'U', nom: 'ADIDAS' },
    { id: 'c', segId: 's2', univers: 'U', nom: 'NIKE' },
  ]
  const lines = [
    { id: 'a', segId: 's1', saisie: { cht: 5 } },
    { id: 'old', segId: 's1', nom: 'LEVIS', n1: { cht: 3 } },
    { id: 'vide', segId: 's1', nom: 'KAPPA', saisie: {} },
  ]
  const bySeg = brandsBySegment(brands, lines)

  it('liste les marques du segment, triées, avec leur ligne du budget', () => {
    assert.deepEqual(bySeg.get('s1').map(b => [b.nom, b.orphan]), [['ADIDAS', false], ['LEVIS', true], ['PUMA', false]])
    assert.deepEqual(bySeg.get('s1')[0].line.saisie, { cht: 5 })
    assert.equal(bySeg.get('s1')[2].line, null)
  })

  it('garde une marque retirée de la liste tant que le budget a des montants pour elle', () => {
    assert.ok(!bySeg.get('s1').some(b => b.id === 'vide'))
  })

  it('rassemble les segments de tous les budgets', () => {
    const cat = segmentsCatalog([{ segments: [{ id: 'x' }, { id: 'y' }] }, { segments: [{ id: 'y' }, { id: 'z' }] }])
    assert.deepEqual(cat.map(s => s.id), ['x', 'y', 'z'])
  })
})

describe('segments et totaux', () => {
  it('garde les segments du N-1 absents de la nouvelle base', () => {
    const merged = mergeSegments([{ id: 'a' }, { id: 'n1' }], [{ id: 'b' }, { id: 'a' }])
    assert.deepEqual(merged.map(s => s.id), ['b', 'a', 'n1'])
  })

  it("trie par ordre des univers, l'univers entier en premier", () => {
    const segs = [
      { id: '1', univers: 'RANDONNEE', nom: 'X' },
      { id: '2', univers: 'ALPINISME ET ESCALADE', nom: 'HABILLEMENT' },
      { id: '3', univers: 'ALPINISME ET ESCALADE', nom: '' },
      { id: '4', univers: 'INCONNU', nom: '' },
    ]
    assert.deepEqual(sortSegments(segs, UNIVERS).map(s => s.id), ['3', '2', '1', '4'])
  })

  it('additionne base, N-1 et saisie par segment et magasin', () => {
    const t = computeTotals([{ id: 's' }], { s: { cht: 100 } }, [
      { segId: 's', n1: { cht: 30 }, saisie: { cht: 40, lf: 5 } },
      { segId: 's', n1: { cht: 20 }, saisie: { cht: 10 } },
    ])
    assert.deepEqual(t.s.cht, { base: 100, groupe: 0, adapte: 0, n1: 50, saisie: 50, engage: 0, qte: 0, qteN1: 0 })
    assert.deepEqual(addTotals([t.s.cht, t.s.lf]), { base: 100, groupe: 0, adapte: 0, n1: 50, saisie: 55, engage: 0, qte: 0, qteN1: 0 })
  })
  it('additionne les quantités et la part engagée de la saisie', () => {
    const t = computeTotals([{ id: 's' }], {}, [
      { segId: 's', saisie: { cht: 40, lf: 5 }, quantite: { cht: 8 }, quantiteN1: { cht: 6 }, engage: true },
      { segId: 's', saisie: { cht: 10 }, quantite: { cht: 2 }, engage: false },
    ])
    assert.deepEqual(t.s.cht, { base: 0, groupe: 0, adapte: 0, n1: 0, saisie: 50, engage: 40, qte: 10, qteN1: 6 })
    // Une marque engagée l'est pour tous les magasins
    assert.equal(t.s.lf.engage, 5)
  })
  it('répartit le budget groupe au prorata de la base, sans toucher à la base', () => {
    const t = computeTotals([{ id: 's' }, { id: 'u' }], { s: { cht: 300 }, u: { cht: 100, lf: 600 } }, [], 1.1)
    assert.deepEqual(t.s.cht, { base: 300, groupe: 330, adapte: 0, n1: 0, saisie: 0, engage: 0, qte: 0, qteN1: 0 })
    assert.equal(Math.round(addTotals([t.s.cht, t.u.cht, t.u.lf]).groupe), 1100)
  })
})

describe('budget groupe', () => {
  it('se fixe en montant ou en % du N-1 total', () => {
    assert.equal(groupeTotal({ mode: 'montant', montant: 950000 }, 1000000), 950000)
    assert.equal(groupeTotal({ mode: 'pct', pct: -3 }, 1000000), 970000)
    assert.equal(groupeTotal({ mode: 'pct', pct: 5 }, 0), null)
    assert.equal(groupeTotal(null, 1000000), null)
  })
  it('donne le coefficient appliqué à la base et le reste à répartir', () => {
    assert.equal(groupeRatio(970000, 800000), 1.2125)
    assert.equal(groupeRatio(970000, 0), null)
    assert.equal(groupeRatio(null, 800000), null)
    const cell = { base: 100, groupe: 120, saisie: 0 }
    assert.equal(objectif(cell, true), 120)
    assert.equal(objectif(cell, false), 100)
  })
  it('affiche les évolutions en %', () => {
    assert.equal(evolution(970000, 1000000).toFixed(1), '-3.0')
    assert.equal(evolution(5, 0), null)
    assert.equal(formatPct(-3), '−3 %')
    assert.equal(formatPct(2.46), '+2,5 %')
    assert.equal(formatPct(null), '—')
  })
})

describe('notation des marques et budget adapté', () => {
  const notes = n => ({ reassort: n, conditions: n, service: n })
  const seg = { id: 'run', univers: 'RUNNING', nom: '' }
  const totals = { run: { m: { base: 90000, groupe: 100000 } } }
  const marque = (id, nom, n1) => ({ id, nom, segId: 'run', line: { n1: { m: n1 } } })
  const run = (fiches, brands = [marque('nike', 'NIKE', 60), marque('asics', 'ASICS', 40)]) => computeAdapte({
    segments: [seg], totals, brandsBySeg: new Map([['run', brands]]), magIds: ['m'],
    fiche: k => fiches[k], reglages: null, hasGroupe: true,
  })

  it('calcule la note pondérée et le coefficient', () => {
    assert.equal(noteMarque({ reassort: 8, conditions: 6, service: 10 }), 8)
    assert.equal(noteMarque({ reassort: 8, conditions: 4 }, { reassort: 3, conditions: 1, service: 1 }), 7)
    assert.equal(noteMarque({}), null)
    assert.equal(coefMarque(10), 1.2)
    assert.equal(coefMarque(0), 0.8)
    assert.equal(coefMarque(null), 1)
    assert.equal(fournisseurKey('Le Coq Sportif'), 'LE-COQ-SPORTIF')
  })
  it("reprend l'exemple validé : note, recalage puis demande", () => {
    const r = run({ NIKE: { notes: notes(8), demande: 70000 }, ASICS: { notes: notes(4) } })
    assert.equal(Math.round(r.byBrand.get('nike').m), 68727)
    assert.equal(Math.round(r.byBrand.get('asics').m), 31273)
    assert.equal(Math.round(r.cells.run.m), 100000)
    assert.equal(Math.round(r.marques.get('NIKE').avant), 63636)
  })
  it('sans note ni demande : la part du N-1', () => {
    const r = run({})
    assert.equal(r.byBrand.get('nike').m, 60000)
    assert.equal(r.byBrand.get('asics').m, 40000)
  })
  it("une marque nouvelle part de 0 et prend sa demande sur l'enveloppe, à hauteur de sa note", () => {
    const r = run({ ON: { demande: 10000 } }, [marque('nike', 'NIKE', 60), marque('asics', 'ASICS', 40), marque('on', 'ON', 0)])
    assert.equal(Math.round(r.byBrand.get('on').m), 5000)
    assert.equal(Math.round(r.cells.run.m), 100000)
  })
  it("une marque retirée de la liste n'a pas de budget adapté", () => {
    const r = run({}, [marque('nike', 'NIKE', 60), { ...marque('puma', 'PUMA', 40), orphan: true }])
    assert.equal(r.byBrand.get('nike').m, 100000)
    assert.equal(r.byBrand.get('puma'), undefined)
  })
  it('une demande déjà couverte ne change rien', () => {
    const r = run({ NIKE: { demande: 50000 } })
    assert.equal(r.byBrand.get('nike').m, 60000)
  })
  it('regroupe les déclinaisons sous leur fournisseur', () => {
    const noms = ['ADIDAS', 'ADIDAS FEMME', 'ADIDAS OFFRE TERRAIN', 'ADIDAS OFFRE TERRAIN KIDS', 'NIKE Q3', 'NIKE Q4', 'ON', 'ONE WAY']
    const f = fournisseurResolver(noms, { 'NIKE-Q4': 'NIKE', 'NIKE-Q3': 'nike', 'ADIDAS-FEMME': '' })
    assert.equal(f('ADIDAS OFFRE TERRAIN KIDS').nom, 'ADIDAS')
    assert.equal(f('ADIDAS').key, 'ADIDAS')
    assert.equal(f('ADIDAS FEMME').nom, 'ADIDAS FEMME') // séparée à la main
    assert.equal(f('NIKE Q3').key, 'NIKE')
    assert.equal(f('NIKE Q4').nom, 'NIKE')
    assert.equal(f('ONE WAY').nom, 'ONE WAY')
    assert.equal(f('ADIDAS OFFRE TERRAIN').auto, 'ADIDAS')
  })
  it('les déclinaisons partagent la note et la demande du fournisseur', () => {
    const brands = [marque('a', 'ADIDAS', 50), marque('af', 'ADIDAS FEMME', 10), marque('p', 'PUMA', 40)]
    const r = computeAdapte({
      segments: [seg], totals, brandsBySeg: new Map([['run', brands]]), magIds: ['m'], reglages: null, hasGroupe: true,
      fiche: k => ({ ADIDAS: { notes: notes(10), demande: 80000 } })[k], fournisseur: fournisseurResolver(brands.map(b => b.nom)),
    })
    const adidas = r.marques.get('ADIDAS')
    assert.equal(adidas.coef, 1.2)
    assert.equal(r.marques.has('ADIDAS-FEMME'), false)
    assert.equal(Math.round(adidas.total), Math.round(r.byBrand.get('a').m + r.byBrand.get('af').m))
    assert.ok(adidas.total > adidas.avant)
  })
  it('range les budgets dans le temps', () => {
    assert.ok(budgetRank({ saison: 'PE', annee: 2027 }) < budgetRank({ saison: 'AH', annee: 2027 }))
    assert.ok(budgetRank({ saison: 'AH', annee: 2026 }) < budgetRank({ saison: 'PE', annee: 2027 }))
  })
  it('ajoute le budget adapté aux totaux', () => {
    const t = withAdapte({ run: { m: { base: 1, groupe: 2 } } }, { run: { m: 3 } })
    assert.deepEqual(t.run.m, { base: 1, groupe: 2, adapte: 3 })
  })
})
