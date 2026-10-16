import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoMapping, chunkBytes, datasetTotals, dimValues, findHeaderRow, gunzipJson, gzipJson, indicateurs, isoWeek, joinBytes,
  classement, filtresTexte, isoMoinsAns, lundiSemaine, matchSemaine, anciennete, completerAxes, jourCourt, missingMeasures, parseJour, parseSortie, recepRaccourcis, pivot, pivotExport, possibleValues, resumeSortie, saisonDe, semainesEntre, semaineId, semaineN1, semaineNom,
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

describe('taux de sortie : date de dernière réception', () => {
  const H = [...HEADER, 'Der Recep', 'Der Recep Ts Mags']
  const r = (mag, ref, recep, vte, stk, recepTs = '') => ['' + mag, 'RUNNING', 'SEG', 'FAM', 'SFAM', 'ASICS', 'FRS', 'MOD', ref, 'NOIR', 100, 10, 1, vte, stk, recep, recepTs]
  const mk = lines => parseSortie([H, ...lines], { headerRow: 0, mapping: autoMapping(H) })
  const j = iso => parseJour(iso)

  it('lit les dates (texte court, long, ISO, date Excel) et prend « Der Recep » plutôt que « Ts Mags »', () => {
    assert.equal(parseJour('01/10/26'), j('2026-10-01'))
    assert.equal(parseJour('1/10/2026'), j('2026-10-01'))
    assert.equal(parseJour(46296), j('2026-10-01')) // date Excel
    assert.equal(parseJour(new Date(2026, 9, 1)), j('2026-10-01'))
    assert.equal(parseJour('31/02/26'), null)
    assert.equal(parseJour(''), null)
    assert.equal(autoMapping(H).derRecep, 15)
    const ds = mk([r('LAVAL', 'A', '01/10/26', 1, 1, '05/10/26'), r('LAVAL', 'B', '', 1, 1)])
    assert.deepEqual(ds.recep, [j('2026-10-01'), -1])
    assert.equal(mk([]).recep.length, 0)
    assert.equal(parseSortie([HEADER], { headerRow: 0, mapping: autoMapping(HEADER) }).recep, undefined)
  })
  it('décale les dates d’un an et trouve le lundi d’une semaine', () => {
    assert.equal(isoMoinsAns('2026-09-01', 1), '2025-09-01')
    assert.equal(isoMoinsAns('2028-02-29', 1), '2027-02-28')
    assert.equal(lundiSemaine(2026, 42), '2026-10-12')
    assert.equal(lundiSemaine(2026, 1), '2025-12-29')
    assert.deepEqual(recepRaccourcis({ annee: 2026, semaine: 42 }, { AH: 23, PE: 49 }), [
      { label: '4 dernières semaines', du: '2026-09-21', au: '2026-10-18' },
      { label: '8 dernières semaines', du: '2026-08-24', au: '2026-10-18' },
      { label: 'Depuis le début de saison (S23 2026)', du: '2026-06-01', au: '2026-10-18' },
    ])
  })
  it('filtre N sur la période et N-1 sur la même période un an plus tôt', () => {
    const n = mk([
      r('LAVAL', 'A', '01/09/26', 4, 6), // dans la période
      r('LAVAL', 'B', '15/08/26', 1, 1), // avant
      r('CHECY', 'C', '', 2, 2), // sans date : écartée
    ])
    const n1 = mk([r('LAVAL', 'A', '10/09/25', 3, 1), r('SARAN', 'D', '10/09/26', 5, 5)])
    const filters = { recep: { du: '2026-09-01', au: '2026-09-30' } }
    const p = pivot({ n, n1, levels: ['magasin'], filters })
    assert.deepEqual(p.total.n.slice(3), [4, 6])
    assert.deepEqual(p.total.n1.slice(3), [3, 1]) // 10/09/25 gardé, 10/09/26 hors de la période N-1
    assert.deepEqual(p.children('').map(c => c.label), ['LAVAL'])
    // Seule borne de début
    assert.deepEqual(pivot({ n, n1, levels: [], filters: { recep: { du: '2026-08-20' } } }).total.n.slice(3), [4, 6])
    // Les listes des filtres se limitent aussi à la période
    assert.deepEqual([...possibleValues([n, n1], filters).magasin].sort(), ['LAVAL'])
    // Semaine importée sans la colonne : rien ne passe le filtre
    const sans = parseSortie([HEADER, row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', 1, 1, 1, 1, 1)], { headerRow: 0, mapping: autoMapping(HEADER) })
    assert.deepEqual(pivot({ n: sans, n1: null, levels: [], filters }).total.n, [0, 0, 0, 0, 0])
    assert.equal(filtresTexte(filters), 'Der Recep : du 01/09/2026 au 30/09/2026 (N-1 : du 01/09/2025 au 30/09/2025)')
  })
  it('donne la dernière réception à partir du niveau Modèle / Référence / Couleur', () => {
    const n = mk([
      r('LAVAL', 'A', '01/09/26', 1, 1), r('CHECY', 'A', '20/09/26', 1, 1), r('LAVAL', 'B', '', 1, 1),
    ])
    const n1 = mk([r('LAVAL', 'A', '10/09/25', 1, 1)])
    // Magasin › Référence : rien sur le magasin, la date sur la référence de ce magasin
    let p = pivot({ n, n1, levels: ['magasin', 'reference'] })
    const laval = p.children('').find(c => c.label === 'LAVAL')
    assert.deepEqual(laval.recep, { n: null, n1: null })
    const lavalA = p.children(laval.path).find(c => c.label === 'A')
    assert.deepEqual(lavalA.recep, { n: j('2026-09-01'), n1: j('2025-09-10') })
    assert.deepEqual(p.children(laval.path).find(c => c.label === 'B').recep, { n: null, n1: null }) // sans date
    // Référence seule : la plus récente de tous les magasins
    p = pivot({ n, n1, levels: ['reference'] })
    assert.equal(p.children('').find(c => c.label === 'A').recep.n, j('2026-09-20'))
    // Référence › Magasin : la date reste sur les magasins sous la référence
    p = pivot({ n, n1, levels: ['reference', 'magasin'] })
    assert.equal(p.children('A').find(c => c.label === 'LAVAL').recep.n, j('2026-09-01'))
    assert.equal(jourCourt(j('2026-10-01')), '01/10/26')
    assert.equal(anciennete(j('2026-10-01'), j('2026-10-18')), '2 sem.')
    assert.equal(anciennete(j('2026-10-15'), j('2026-10-18')), '3 j')
  })
  it('exporte la date de dernière réception en date Excel avec un niveau Référence', () => {
    const n = mk([r('LAVAL', 'A', '01/10/26', 1, 1), r('CHECY', 'A', '20/09/26', 1, 1)])
    const levels = ['reference', 'magasin']
    const p = pivot({ n, n1: null, levels })
    const x = pivotExport({ total: p.total, children: path => p.children(path), levels, titre: 'T', labelN: 'S42 2026', labelN1: 'S42 2025' })
    const head = x.table[4]
    assert.deepEqual(head.slice(0, 2), ['Référence', 'Magasin'])
    assert.equal(head[9], 'Der Recep') // 2 niveaux + 7 indicateurs N
    assert.equal(head[17], 'Der Recep')
    assert.equal(x.table[3][10], 'N-1 · S42 2025')
    const laval = x.table.find(row => row[1] === 'LAVAL')
    assert.equal(laval[9], j('2026-10-01') + 25569)
    assert.equal(laval[17], '') // pas de N-1
    assert.equal(x.table.find(row => row[0] === 'Total A')[9], j('2026-10-01') + 25569)
    assert.equal(x.table.at(-1)[9], '') // total général
    assert.equal(x.formats[9], 'dd/mm/yy')
  })
})

describe('taux de sortie : code chrono', () => {
  // En-tête comme l'extraction Intersport : Réf puis Chrono puis Couleur
  const H = ['Magasin', 'Univers', 'Segment', 'Famille', 'Sous-Famille', 'Modèle', 'Fourn. stat', 'Marque', 'Réf', 'Chrono', 'Couleur',
    'QtRecep', 'QtVte', 'QtStkFin', 'MtMrg', 'CANet']
  const r = (mag, ref, chrono, vte, stk) => [mag, 'RUNNING', 'SEG', 'FAM', 'SFAM', 'MOD', 'FRS', 'ASICS', ref, chrono, 'NOIR', 1, vte, stk, 10, 100]
  const mk = lines => parseSortie([H, ...lines], { headerRow: 0, mapping: autoMapping(H) })

  it('lit la colonne Chrono comme un axe (filtre et niveau de lignes)', () => {
    assert.equal(autoMapping(H).chrono, 9)
    const ds = mk([r('LAVAL', 'R1', '0-163546', 4, 6), r('CHECY', 'R1', '0-163546', 1, 1), r('LAVAL', 'R2', '980-112417', 2, 2)])
    assert.deepEqual(ds.dims.chrono, ['0-163546', '980-112417'])
    assert.deepEqual(ds.absentes, [])
    const p = pivot({ n: ds, n1: null, levels: ['chrono'], filters: { chrono: new Set(['0-163546']) } })
    assert.deepEqual(p.children('').map(c => [c.label, c.n[3]]), [['0-163546', 5]])
  })
  it('complète une semaine importée avant l’axe Chrono', () => {
    const old = mk([r('LAVAL', 'R1', '0-1', 4, 6)])
    delete old.dims.chrono; delete old.codes.chrono; delete old.absentes
    completerAxes(old)
    assert.deepEqual(old.dims.chrono, ['(vide)'])
    assert.deepEqual(old.codes.chrono, [0])
    assert.deepEqual(old.absentes, ['chrono'])
    assert.deepEqual(pivot({ n: old, n1: null, levels: ['chrono'] }).children('').map(c => c.label), ['(vide)'])
    // Fichier sans la colonne : l'axe vaut « (vide) » et il est noté absent
    assert.ok(parseSortie([HEADER, row('LAVAL', 'RUNNING', 'ASICS', 'R1', 'NOIR', 1, 1, 1, 1, 1)], { headerRow: 0, mapping: autoMapping(HEADER) }).absentes.includes('chrono'))
  })
})
