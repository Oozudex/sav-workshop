import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addTotals, budgetName, canEditUnivers, computeTotals, editableLines, findN1Sheet, linesFromBudget, magasinMatcher, mergeSegments, n1Columns,
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
  const existing = [{ id: 'x', segId: segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES'), nom: 'adidas', n1: { cht: 1 } }]
  const plan = planN1Import(lines, existing, base.segments)

  it('met à jour les marques existantes et crée les autres', () => {
    assert.deepEqual(plan.updates, [{ id: 'x', n1: { cht: 12393, lf: 6174 }, commentaireN1: 'Voir conditions' }])
    assert.deepEqual(plan.creates.map(l => l.nom), ['PUMA', 'MILLET'])
  })

  it('ajoute les segments absents de la base', () => {
    assert.deepEqual(plan.newSegments, [{ id: segmentId('ALPINISME ET ESCALADE', 'HABILLEMENT'), univers: 'ALPINISME ET ESCALADE', nom: 'HABILLEMENT' }])
  })

  it('reprend la saisie du budget précédent comme N-1', () => {
    const l = linesFromBudget([{ segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', saisie: { cht: 10 }, commentaire: 'ok' }])
    assert.deepEqual(l, [{ segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', n1: { cht: 10 }, commentaire: 'ok' }])
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
    assert.deepEqual(t.s.cht, { base: 100, n1: 50, saisie: 50 })
    assert.deepEqual(addTotals([t.s.cht, t.s.lf]), { base: 100, n1: 50, saisie: 55 })
  })
})
