import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoMapping, chunkBytes, datasetTotals, dimValues, findHeaderRow, gunzipJson, gzipJson, indicateurs, isoWeek, joinBytes,
  missingMeasures, parseSortie, pivot, semaineId, semaineN1, semaineNom,
} from '../../src/lib/sorties.js'

const HEADER = ['Magasin', 'Univers', 'Segment', 'Famille', 'Sous-famille', 'Marque', 'Fournisseur', 'Modèle', 'Référence', 'Couleur',
  'CANet', 'MtMrg', 'QtRecep', 'QtVte', 'QtStkFin']
const row = (mag, univ, marque, ref, coul, ca, mrg, rec, vte, stk) =>
  [mag, univ, 'SEG', 'FAM', 'SFAM', marque, 'FRS', 'MOD', ref, coul, ca, mrg, rec, vte, stk]

describe('taux de sortie : semaines', () => {
  it('numérote les semaines ISO et trouve la même semaine N-1', () => {
    assert.deepEqual(isoWeek(new Date(2026, 9, 15)), { annee: 2026, semaine: 42 })
    assert.deepEqual(isoWeek(new Date(2027, 0, 1)), { annee: 2026, semaine: 53 })
    assert.deepEqual(semaineN1({ annee: 2026, semaine: 42 }), { annee: 2025, semaine: 42 })
    assert.deepEqual(semaineN1({ annee: 2027, semaine: 53 }), { annee: 2026, semaine: 53 })
    assert.deepEqual(semaineN1({ annee: 2026, semaine: 53 }), { annee: 2025, semaine: 52 })
    assert.equal(semaineId(2026, 7), '2026-S07')
    assert.equal(semaineNom(2026, 42), 'TAUX DE SORTIE S42 2026')
  })
})

describe('taux de sortie : fichier', () => {
  const rows = [['Extraction semaine 42'], [], HEADER,
    row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', '1 200,00', 200, 10, 4, 6),
    row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'BLEU', 600, 100, 5, 2, 3),
    row('CHECY', 'CYCLE', 'GRANVILLE', 'V1', '', 2400, 300, 2, 1, 1),
    ['Total', '', '', '', '', '', '', '', '', '', 4200, 600, 17, 7, 10],
    [],
  ]

  it("trouve l'en-tête et les colonnes", () => {
    const h = findHeaderRow(rows)
    assert.equal(h, 2)
    const map = autoMapping(rows[h])
    assert.equal(map.magasin, 0)
    assert.equal(map.sousFamille, 4)
    assert.equal(map.reference, 8)
    assert.equal(map.qtStkFin, 14)
    assert.deepEqual(missingMeasures(map), [])
    assert.deepEqual(missingMeasures({ ...map, mtMrg: -1 }).map(m => m.key), ['mtMrg'])
  })
  it('lit les lignes en colonnes compactes, sans les totaux', () => {
    const ds = parseSortie(rows, { headerRow: 2, mapping: autoMapping(rows[2]), canon: { magasin: v => (v === 'CHECY' ? 'CHECY (45)' : null) } })
    assert.equal(ds.n, 3)
    assert.equal(ds.skipped, 1)
    assert.deepEqual(ds.dims.magasin, ['LAVAL', 'CHECY (45)'])
    assert.deepEqual(ds.codes.magasin, [0, 0, 1])
    assert.deepEqual(ds.dims.couleur, ['NOIR', 'BLEU', '(vide)'])
    assert.deepEqual(datasetTotals(ds), { caNet: 4200, mtMrg: 600, qtRecep: 17, qtVte: 7, qtStkFin: 10 })
  })
  it('se compresse et se découpe pour le stockage', async () => {
    const ds = parseSortie(rows, { headerRow: 2, mapping: autoMapping(rows[2]) })
    const bytes = await gzipJson(ds)
    const parts = chunkBytes(bytes, 50)
    assert.ok(parts.length > 1)
    assert.deepEqual(await gunzipJson(joinBytes(parts)), JSON.parse(JSON.stringify(ds)))
  })
})

describe('taux de sortie : tableau croisé', () => {
  const mk = lines => parseSortie([HEADER, ...lines], { headerRow: 0, mapping: autoMapping(HEADER) })
  const n = mk([
    row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', 1200, 200, 10, 4, 6),
    row('LAVAL', 'CYCLE', 'GRANVILLE', 'V1', 'GRIS', 2400, 300, 2, 1, 1),
    row('CHECY', 'RUNNING', 'NIKE', 'R2', 'NOIR', 600, 60, 5, 5, 0),
  ])
  const n1 = mk([
    row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', 1000, 150, 8, 2, 8),
    row('SARAN', 'RUNNING', 'ASICS', 'R1', 'NOIR', 500, 50, 3, 3, 1),
  ])

  it('calcule CA HT, marge % et taux de sortie (formule du groupe)', () => {
    const i = indicateurs([1200, 200, 10, 4, 6])
    assert.equal(i.caHt, 1000)
    assert.equal(i.marge, 0.2)
    assert.equal(Math.round(i.taux * 1000) / 1000, 1.667) // (4 + 6) / 6
    assert.equal(indicateurs([600, 60, 5, 5, 0]).taux, null)
  })
  it('regroupe sur plusieurs niveaux et rapproche N et N-1', () => {
    const p = pivot({ n, n1, levels: ['magasin', 'univers'] })
    assert.deepEqual(p.total.n, [4200, 560, 17, 10, 7])
    assert.deepEqual(p.total.n1, [1500, 200, 11, 5, 9])
    const mags = p.children('')
    assert.deepEqual(mags.map(m => m.label).sort(), ['CHECY', 'LAVAL', 'SARAN'])
    const laval = mags.find(m => m.label === 'LAVAL')
    assert.deepEqual(laval.n, [3600, 500, 12, 5, 7])
    assert.deepEqual(laval.n1, [1000, 150, 8, 2, 8])
    const saran = mags.find(m => m.label === 'SARAN')
    assert.deepEqual(saran.n, [0, 0, 0, 0, 0])
    assert.deepEqual(p.children(laval.path).map(c => c.label).sort(), ['CYCLE', 'RUNNING'])
    assert.equal(p.children(laval.path)[0].depth, 1)
  })
  it('filtre comme un TCD (plusieurs valeurs, plusieurs axes)', () => {
    const p = pivot({ n, n1, levels: ['marque'], filters: { univers: new Set(['RUNNING']), magasin: new Set(['LAVAL', 'CHECY']) } })
    assert.deepEqual(p.total.n, [1800, 260, 15, 9, 6])
    assert.deepEqual(p.total.n1, [1000, 150, 8, 2, 8])
    assert.deepEqual(p.children('').map(c => c.label).sort(), ['ASICS', 'NIKE'])
    assert.deepEqual(dimValues([n, n1], 'magasin'), ['CHECY', 'LAVAL', 'SARAN'])
  })
  it('sans niveau : seulement le total', () => {
    const p = pivot({ n, n1: null, levels: [] })
    assert.deepEqual(p.children(''), [])
    assert.deepEqual(p.total.n1, [0, 0, 0, 0, 0])
  })
})
