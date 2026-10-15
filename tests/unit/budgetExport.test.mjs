import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { budgetWorkbook, exportFileName, reimportColumn } from '../../src/lib/budgetExport.js'
import { brandsBySegment, computeAdapte, computeTotals, fournisseurResolver, magasinMatcher, parseN1Sheet, withAdapte } from '../../src/lib/budgets.js'

const magasins = [{ id: 'cht', nom: 'CHATEAU GONTIER', code: 'CHT 274/0', alias: [] }, { id: 'lf', nom: 'LA FERTE', code: 'LF 458/0', alias: [] }]
const segments = [{ id: 'cycle', univers: 'CYCLE', nom: '' }, { id: 'run__chaussures', univers: 'RUNNING', nom: 'CHAUSSURES' }]
const brands = [
  { id: 'g', nom: 'GRANVILLE', univers: 'CYCLE', segId: 'cycle', segment: '' },
  { id: 'a', nom: 'ASICS', univers: 'RUNNING', segId: 'run__chaussures', segment: 'CHAUSSURES' },
  { id: 'af', nom: 'ASICS FEMME', univers: 'RUNNING', segId: 'run__chaussures', segment: 'CHAUSSURES' },
]
const lines = [
  { id: 'g', segId: 'cycle', univers: 'CYCLE', nom: 'GRANVILLE', n1: { cht: 100 }, saisie: { cht: 120, lf: 30 }, quantite: { cht: 4 }, engage: true, commentaire: 'ok' },
  { id: 'a', segId: 'run__chaussures', univers: 'RUNNING', segment: 'CHAUSSURES', nom: 'ASICS', n1: { cht: 50, lf: 50 }, saisie: { lf: 80 } },
  { id: 'af', segId: 'run__chaussures', univers: 'RUNNING', segment: 'CHAUSSURES', nom: 'ASICS FEMME', n1: { cht: 10 } },
]
const base = { cycle: { cht: 200, lf: 100 }, 'run__chaussures': { cht: 100, lf: 100 } }

function model() {
  const raw = computeTotals(segments, base, lines, 1.1)
  const brandsBySeg = brandsBySegment(brands, lines)
  const fournisseur = fournisseurResolver(brands.map(b => b.nom))
  const fiche = k => ({ ASICS: { notes: { reassort: 8, conditions: 8, service: 8 }, demande: 300, herite: true, source: 'BUDGET AH26' } })[k]
  const adapte = computeAdapte({ segments, totals: raw, brandsBySeg, magIds: ['cht', 'lf'], fiche, reglages: null, hasGroupe: true, fournisseur })
  return {
    budget: { nom: 'BUDGET AH27', saison: 'AH', annee: 2027, groupe: { mode: 'pct', pct: -5 } }, segments, magasins,
    totals: withAdapte(raw, adapte.cells), brandsBySeg, adapte, fournisseur, fiche, hasGroupe: true, groupeMontant: 550,
    sums: { n1: 210, base: 500 }, reglages: null, exportedAt: new Date(2026, 9, 15),
  }
}

describe('export Excel du budget', () => {
  const sheets = budgetWorkbook(model())
  const [marques, synthese, parMag, fournisseurs] = sheets

  it('crée 4 feuilles', () => {
    assert.deepEqual(sheets.map(s => s.name), ['BUDGET PAR MARQUES', 'SYNTHESE', 'PAR MAGASIN', 'FOURNISSEURS'])
    assert.equal(exportFileName({ nom: 'BUDGET AH27' }, new Date(2026, 9, 5)), 'BUDGET AH27 - export 2026-10-05')
  })
  it('présente les marques comme le fichier N-1 (magasins en colonnes)', () => {
    assert.deepEqual(marques.table[0].slice(0, 7), ['UNIVERS', 'SEGMENT', 'MARQUES', 'CHATEAU GONTIER', '', '', ''])
    assert.deepEqual(marques.table[1].slice(3, 7), ['BUDGET AH26', 'ADAPTÉ AH27', 'BUDGET AH27', 'QTÉ AH27'])
    const g = marques.table.find(r => r[2] === 'GRANVILLE')
    assert.deepEqual(g.slice(0, 7), ['CYCLE', 'CYCLE', 'GRANVILLE', 100, g[4], 120, 4])
    assert.ok(g.includes('Engagé'))
    assert.ok(marques.table.find(r => r[2] === 'ASICS FEMME').includes('ASICS'))
    assert.equal(marques.table.at(-1)[2], 'TOTAL')
  })
  it("se réimporte comme N-1 l'année suivante (colonne BUDGET AH27)", () => {
    assert.equal(reimportColumn({ saison: 'AH', annee: 2027 }), 'BUDGET AH27')
    const r = parseN1Sheet(marques.table, { univers: ['CYCLE', 'RUNNING'], matchMagasin: magasinMatcher(magasins), column: 'BUDGET AH27' })
    assert.equal(r.error, undefined)
    assert.deepEqual(r.unknownMagasins, [])
    const byNom = Object.fromEntries(r.lines.map(l => [l.nom, l]))
    assert.deepEqual(byNom.GRANVILLE.n1, { cht: 120, lf: 30 })
    assert.equal(byNom.GRANVILLE.segment, '')
    assert.deepEqual(byNom.ASICS.n1, { lf: 80 })
    assert.equal(byNom.ASICS.segment, 'CHAUSSURES')
    assert.equal(byNom.GRANVILLE.commentaire, 'ok')
    assert.equal(r.lines.length, 3)
  })
  it('synthèse, magasins et fournisseurs', () => {
    const total = synthese.table.at(-1)
    assert.equal(total[0], 'TOTAL')
    assert.equal(total[2], 500) // base
    assert.equal(total[6], 230) // saisi
    assert.equal(total[7], 150) // engagé
    assert.deepEqual(parMag.table.map(r => r[0]), ['MAGASIN', 'CHATEAU GONTIER', 'LA FERTE', 'TOTAL'])
    assert.equal(parMag.table[1][5], 120)
    const asics = fournisseurs.table.find(r => r[0] === 'ASICS')
    assert.equal(asics[1], 'ASICS, ASICS FEMME')
    assert.equal(asics[6], 8) // note
    assert.equal(asics.at(-1), 'BUDGET AH26')
  })
})
