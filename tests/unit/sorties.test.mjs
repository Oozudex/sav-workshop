import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoMapping, chunkBytes, datasetTotals, dimValues, findHeaderRow, gunzipJson, gzipJson, indicateurs, isoWeek, joinBytes,
  classement, matchSemaine, missingMeasures, parseSortie, pivot, pivotExport, possibleValues, resumeSortie, saisonDe, semainesEntre, semaineId, semaineN1, semaineNom,
} from '../../src/lib/sorties.js'

const HEADER = ['Magasin', 'Univers', 'Segment', 'Famille', 'Sous-famille', 'Marque', 'Fournisseur', 'Modèle', 'Référence', 'Couleur',
  'CANet', 'MtMrg', 'QtRecep', 'QtVte', 'QtStkFin']
const row = (mag, univ, marque, ref, coul, ca, mrg, rec, vte, stk) =>
  [mag, univ, 'SEG', 'FAM', 'SFAM', marque, 'FRS', 'MOD', ref, coul, ca, mrg, rec, vte, stk]

describe('taux de sortie : semaines', () => {
  it('recherche une semaine par numéro, année ou nom', () => {
    const s = { annee: 2026, semaine: 42, nom: 'TAUX DE SORTIE S42 2026' }
    for (const q of ['42', 's42', 'S42 2026', '2026', 'sortie', '']) assert.equal(matchSemaine(s, q), true, q)
    for (const q of ['4', 'S41', '2025', 'S42 2025']) assert.equal(matchSemaine(s, q), false, q)
    assert.equal(matchSemaine({ annee: 2026, semaine: 3 }, 'S03'), true)
  })
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

  it('calcule CA HT, marge % et taux de sortie (vendu ÷ vendu + stock)', () => {
    const i = indicateurs([1200, 200, 10, 4, 6])
    assert.equal(i.caHt, 1000)
    assert.equal(i.marge, 0.2)
    assert.equal(i.taux, 0.4) // 4 / (4 + 6)
    assert.equal(indicateurs([600, 60, 5, 5, 0]).taux, 1) // tout vendu
    assert.equal(indicateurs([0, 0, 5, 0, 0]).taux, null)
  })
  it('classe les lignes sœurs de la meilleure à la moins bonne', () => {
    const c = classement([0.6, 0.7, null, 0.8, 0.7])
    assert.deepEqual(c.map(x => x?.pos ?? null), [4, 2, null, 1, 2])
    assert.deepEqual(c.map(x => x?.t ?? null), [0, 0.5, null, 1, 0.5])
    assert.equal(c[0].k, 4)
    assert.deepEqual(classement([0.5, null]), [null, null])
    assert.deepEqual(classement([0.5, 0.5]).map(x => x.t), [0.5, 0.5])
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
  it('limite les listes des filtres les unes par les autres (tous les sens)', () => {
    const sorted = set => [...set].sort()
    const sans = possibleValues([n, n1])
    assert.deepEqual(sorted(sans.univers), ['CYCLE', 'RUNNING'])
    // Univers coché : les autres axes se limitent au running, la liste des univers reste entière
    const run = possibleValues([n, n1], { univers: new Set(['RUNNING']) })
    assert.deepEqual(sorted(run.marque), ['ASICS', 'NIKE'])
    assert.deepEqual(sorted(run.couleur), ['NOIR'])
    assert.deepEqual(sorted(run.univers), ['CYCLE', 'RUNNING'])
    // Dans l'autre sens : une marque limite les univers et les magasins (N et N-1 confondus)
    const asics = possibleValues([n, n1], { marque: new Set(['ASICS']) })
    assert.deepEqual(sorted(asics.univers), ['RUNNING'])
    assert.deepEqual(sorted(asics.magasin), ['LAVAL', 'SARAN'])
    // Deux filtres : chacun est limité par l'autre seulement
    const deux = possibleValues([n, n1], { magasin: new Set(['CHECY']), marque: new Set(['ASICS']) })
    assert.deepEqual(sorted(deux.magasin), ['LAVAL', 'SARAN'])
    assert.deepEqual(sorted(deux.marque), ['NIKE'])
    assert.deepEqual(sorted(deux.univers), [])
  })
  it('résume une semaine (sans modèle, référence ni couleur) sans changer les totaux', () => {
    const r = resumeSortie(mk([
      row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', 1200, 200, 10, 4, 6),
      row('LAVAL', 'RUNNING', 'ASICS', 'R3', 'BLANC', 300, 50, 1, 1, 0),
      row('CHECY', 'RUNNING', 'NIKE', 'R2', 'NOIR', 600, 60, 5, 5, 0),
    ]))
    assert.equal(r.n, 2) // les deux références ASICS de LAVAL fusionnent
    assert.equal(r.dims.reference, undefined)
    const p = pivot({ n: r, n1: null, levels: [], filters: { magasin: new Set(['LAVAL']) } })
    assert.deepEqual(p.total.n, [1500, 250, 11, 5, 6])
    assert.deepEqual([...possibleValues([r], { magasin: new Set(['CHECY']) }, ['magasin', 'univers', 'segment']).univers], ['RUNNING'])
  })
  it('exporte le tableau à plat avec les sous-totaux et le total', () => {
    const levels = ['magasin', 'univers']
    const filters = { univers: new Set(['RUNNING', 'CYCLE']) }
    const p = pivot({ n, n1, levels, filters })
    const byLabel = path => p.children(path).sort((a, b) => a.label.localeCompare(b.label))
    const x = pivotExport({ total: p.total, children: byLabel, levels, titre: 'TAUX DE SORTIE S42 2026', filters, labelN: 'S42 2026', labelN1: 'S42 2025' })
    assert.equal(x.firstRow, 5)
    assert.deepEqual(x.table[1], ['Filtres : Univers : RUNNING, CYCLE'])
    assert.deepEqual(x.table[4].slice(0, 3), ['Magasin', 'Univers', 'CANet'])
    assert.equal(x.table[3][2], 'N · S42 2026')
    assert.equal(x.table[3][9], 'N-1 · S42 2025')
    const rows = x.table.slice(5).map(r => r.slice(0, 3))
    assert.deepEqual(rows, [
      ['CHECY', 'RUNNING', 600], ['Total CHECY', '', 600],
      ['LAVAL', 'CYCLE', 2400], ['LAVAL', 'RUNNING', 1200], ['Total LAVAL', '', 3600],
      ['SARAN', 'RUNNING', 0], ['Total SARAN', '', 0],
      ['Total (filtré)', '', 4200],
    ])
    const laval = x.table.find(r => r[0] === 'Total LAVAL')
    assert.equal(laval[8], 5 / 12) // taux N : 5 vendus / (5 + 7)
    assert.equal(laval[9], 1000) // CANet N-1
    assert.equal(x.formats[2], '#,##0 "€"')
    assert.equal(x.formats[8], '0.0%')
  })
  it('sans niveau : seulement le total', () => {
    const p = pivot({ n, n1: null, levels: [] })
    assert.deepEqual(p.children(''), [])
    assert.deepEqual(p.total.n1, [0, 0, 0, 0, 0])
  })
})

describe('taux de sortie : saisons', () => {
  it('AH dès la S23, PE dès la S49 (de l’année précédente en début d’année)', () => {
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 42 }), { saison: 'AH', debut: { annee: 2026, semaine: 23 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 23 }), { saison: 'AH', debut: { annee: 2026, semaine: 23 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 22 }), { saison: 'PE', debut: { annee: 2025, semaine: 49 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 50 }), { saison: 'PE', debut: { annee: 2026, semaine: 49 } })
  })
  it('suit les semaines de début réglées dans les paramètres', () => {
    const d = { AH: 30, PE: 5 }
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 42 }, d), { saison: 'AH', debut: { annee: 2026, semaine: 30 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 10 }, d), { saison: 'PE', debut: { annee: 2026, semaine: 5 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 3 }, d), { saison: 'AH', debut: { annee: 2025, semaine: 30 } })
    // Réglage incomplet ou incohérent : valeurs par défaut
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 42 }, { AH: 23, PE: 23 }), { saison: 'AH', debut: { annee: 2026, semaine: 23 } })
    assert.deepEqual(saisonDe({ annee: 2026, semaine: 42 }, null), { saison: 'AH', debut: { annee: 2026, semaine: 23 } })
  })
  it('liste les semaines en passant d’une année à l’autre', () => {
    const w = semainesEntre({ annee: 2026, semaine: 49 }, { annee: 2027, semaine: 2 })
    assert.deepEqual(w.map(x => `${x.annee}-${x.semaine}`), ['2026-49', '2026-50', '2026-51', '2026-52', '2026-53', '2027-1', '2027-2'])
    assert.equal(semainesEntre({ annee: 2026, semaine: 23 }, { annee: 2026, semaine: 42 }).length, 20)
  })
})
