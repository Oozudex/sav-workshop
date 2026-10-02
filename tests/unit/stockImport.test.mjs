import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogueExportTable, cleanCouleur, cleanNom, packPourFamille, parseStockSheet, planStockImport, stockImportData, stockSummary,
  withPacksFromBase,
} from '../../src/lib/stockImport.js'

const HEAD = ['Magasin', 'Univers', 'Segment', 'Famille', 'Sous-Famille', 'Modèle', 'Fourn. stat', 'Marque', 'Réf', 'Chrono', 'Couleur', 'Act.', 'QtStkFin', 'PV Mag']
const row = (mag, famille, sous, nom, marque, ref, chrono, couleur, stock, pv) =>
  [mag, 'CYCLE', 'VELO', famille, sous, nom, 'INTERSPORT FRANCE', marque, ref, chrono, couleur, 'Active', stock, pv]
const ROWS = [
  HEAD,
  row('LAVAL', 'VTT', 'LOISIR HOMME', 'SPIKE 2.0 VTT', 'BH', 'A2096 B05JFS', '0-263804', 'BCC BLUE-COPPER-COPPER', 3, 499.99),
  row('VITRE', 'VTT', 'LOISIR HOMME', 'SPIKE 2.0 VTT', 'BH', 'A2096 B05JFS', '0-263804', 'BCC BLUE-COPPER-COPPER', 2, 499.99),
  row('SARAN', 'VTT', 'LOISIR HOMME', 'CLIFF 700 "PRESQUE PARFAIT"', 'NAKAMURA', 'YF60K2PF B02KHV', '0-252592', 'BLEU BRISBANE', 1, 229.99),
  row('LAVAL', 'JUNIOR', "GARCON 20''", 'ROCKY 20', 'NAKAMURA', 'R1', '0-1', 'ROUGE', 4, 199.99),
  row('LAVAL', 'ELECTRIQUE', 'JUNIOR', 'E-SUMMIT EVO', 'NAKAMURA', 'R2', '0-2', 'NOIR JAUNE', 2, 1099.99),
  row('LAVAL', 'VTC', 'HOMME', 'CROSSLAND B 7V VTC 28" "PRESQUE PARFAIT"', 'NAKAMURA', 'R3', '0-3', 'SABLE', -1, 349.99),
  [null, null, null, null, null, null, null, null, 880, null, null, null, 1857, null],
]

describe('état de stock', () => {
  const { produits, ecartes, error } = parseStockSheet(ROWS)

  it("un vélo par chrono, stock des magasins additionné, sans stock écarté", () => {
    assert.equal(error, null)
    assert.deepEqual(produits.map(p => p.chrono), ['0-263804', '0-252592', '0-2', '0-1'])
    assert.equal(produits[0].stock, 5)
    assert.deepEqual(ecartes.map(p => p.chrono), ['0-3'])
  })
  it("prix fort = prix de vente magasin", () => {
    assert.equal(produits[0].prixFort, 499.99)
  })
  it("nettoie nom et couleur, repère les presque parfaits", () => {
    const pp = produits.find(p => p.chrono === '0-252592')
    assert.equal(pp.nom, 'CLIFF 700')
    assert.equal(pp.segment, 'velo_pp')
    assert.equal(pp.presqueParfait, true)
    assert.equal(produits[0].couleur, 'BLUE-COPPER-COPPER')
    assert.equal(produits[0].sousFamille, 'LOISIR HOMME')
  })
  it("déduit le pack : électrique d'abord (même junior), puis enfant", () => {
    assert.equal(produits.find(p => p.chrono === '0-2').pack, 'electrique')
    assert.equal(produits.find(p => p.chrono === '0-1').pack, 'enfant')
    assert.deepEqual(stockSummary(produits), { total: 4, presqueParfaits: 1, sansPrix: 0, packEnfant: 1, packElectrique: 1, packARenseigner: 2 })
  })
  it("refuse un fichier sans en-têtes", () => {
    assert.ok(parseStockSheet([['a', 'b'], [1, 2]]).error)
  })
})

describe('nettoyage', () => {
  it("couleurs : codes fournisseur retirés, vraies couleurs gardées", () => {
    const cases = {
      'SNS SNS SILVER-BLACK-SILVER': 'SILVER-BLACK-SILVER',
      'SNS  SILVER-BLACK-SILVER': 'SILVER-BLACK-SILVER',
      'Z99 AZUL CAMALEON': 'AZUL CAMALEON',
      '00017Z NOIR': 'NOIR',
      '013VRH PET PETROL-BLUE MAT': 'PETROL-BLUE MAT',
      'CNN COPPER - NEGRO - NEGRO': 'COPPER-NEGRO-NEGRO',
      'C74 NOIR / OR': 'NOIR/OR',
      '302 CONCEPT-GREY': 'CONCEPT-GREY',
      'NGH NIGHT BLUE': 'NIGHT BLUE',
      'IV IVORY': 'IVORY',
      'PI PEARL-IVORY': 'PEARL-IVORY',
      'VYN VIOLET-YELLOW-NOIR': 'VIOLET-YELLOW-NOIR',
      'NOIR OR': 'NOIR OR',
      'GRIS VERT': 'GRIS VERT',
      'RED-RED-RED': 'RED-RED-RED',
      'PETROL BLUE MAT F': 'PETROL BLUE MAT F',
      'BLEU': 'BLEU',
    }
    for (const [raw, clean] of Object.entries(cases)) assert.equal(cleanCouleur(raw), clean, raw)
  })
  it("nom : mention presque parfait retirée, pouces gardés", () => {
    assert.equal(cleanNom('CROSSLAND B 7V VTC 28" "PRESQUE PARFAIT"'), 'CROSSLAND B 7V VTC 28"')
    assert.equal(cleanNom('ALLROAD 450 PRESQUE PARFAIT'), 'ALLROAD 450')
  })
  it("packs", () => {
    assert.equal(packPourFamille('JUNIOR'), 'enfant')
    assert.equal(packPourFamille('JOUET'), 'enfant')
    assert.equal(packPourFamille('ELECTRIQUE'), 'electrique')
    assert.equal(packPourFamille('VTT'), null)
  })
  it("réimport : prix fort du fichier, pack déjà choisi conservé", () => {
    const p = { chrono: '0-1', nom: 'X', pack: 'enfant', prixFort: 199.99, stock: 3 }
    assert.deepEqual(stockImportData(p, { pack: 'sport', prixFort: 150 }), { chrono: '0-1', nom: 'X', prixFort: 199.99 })
    assert.deepEqual(stockImportData(p, null), { chrono: '0-1', nom: 'X', prixFort: 199.99, pack: 'enfant' })
    assert.deepEqual(stockImportData({ ...p, prixFort: null }, { prixFort: 150, pack: 'sport' }), { chrono: '0-1', nom: 'X' })
  })
})

describe('export Excel', () => {
  const { produits } = parseStockSheet(ROWS)
  const items = produits.map(p => ({ v: { ...p, prixEngage: p.chrono === '0-1' ? 179.99 : null }, bp: p.presqueParfait ? { prixBonPlan: '199,99' } : null }))
  const table = catalogueExportTable(items)

  it("une ligne par vélo, prix en nombres", () => {
    assert.equal(table.length, produits.length + 1)
    const pp = table.find(r => r[0] === '0-252592')
    assert.deepEqual(pp.slice(2, 12), ['CLIFF 700', 'NAKAMURA', 'BLEU BRISBANE', 'VTT', 'LOISIR HOMME', 'OUI', 229.99, '', '', 199.99])
    assert.equal(table.find(r => r[0] === '0-1')[10], 179.99)
  })
  it("se réimporte à l'identique", () => {
    const again = parseStockSheet(table).produits.map(({ stock: _s, pack: _p, ...p }) => p)
    assert.deepEqual(again, produits.map(({ stock: _s, pack: _p, ...p }) => p))
  })
})

describe('réimport', () => {
  const { produits } = parseStockSheet(ROWS) // 0-263804, 0-252592, 0-2, 0-1
  const existing = [
    { id: 'a', chrono: '0-263804', nom: 'SPIKE', prixFort: 449.99, prixEngage: 399.99 }, // prix modifié, engagé
    { id: 'b', chrono: '0-1', nom: 'ROCKY', prixFort: 199.99 },                          // inchangé
    { id: 'c', chrono: '9-999', nom: 'ANCIEN', prixFort: 99 },                           // plus en stock
    { id: 'd', chrono: '9-998', nom: 'ANCIEN PP', prixFort: 99 },                        // plus en stock, bon plan
  ]
  const plan = planStockImport(produits, existing, new Set(['0-1', '9-998']))

  it("nouveaux, mis à jour et retirés", () => {
    assert.deepEqual(plan.nouveaux.map(p => p.chrono), ['0-252592', '0-2'])
    assert.deepEqual(plan.misAJour.map(p => p.chrono), ['0-263804', '0-1'])
    assert.deepEqual(plan.retires.map(e => e.id), ['c', 'd'])
  })
  it("prix fort modifiés", () => {
    assert.deepEqual(plan.prixChanges.map(p => [p.chrono, p.ancienPrix, p.prixFort]), [['0-263804', 449.99, 499.99]])
  })
  it("prix engagés et bon plan conservés, bon plan des vélos retirés supprimés", () => {
    assert.equal(plan.engagesConserves, 1)
    assert.equal(plan.bonPlansConserves, 1)
    assert.deepEqual(plan.bonPlansRetires.map(e => e.chrono), ['9-998'])
  })
  it("base vide : tout est nouveau", () => {
    const p = planStockImport(produits)
    assert.equal(p.nouveaux.length, produits.length)
    assert.equal(p.retires.length, 0)
  })
})

describe('packs repris de la base', () => {
  const nouveaux = [
    { chrono: '1', reference: 'YF60K2 000AAA', nom: 'CLIFF 700', marque: 'NAKAMURA', pack: null },   // même modèle, autre couleur
    { chrono: '2', reference: 'YF60K2PF B02KHV', nom: 'CLIFF 700', marque: 'NAKAMURA', pack: null }, // version presque parfaite
    { chrono: '3', reference: 'ZZ99 X', nom: 'SPIKE 2.0 VTT', marque: 'BH', pack: null },            // même nom et marque
    { chrono: '4', reference: 'QQ11 X', nom: 'INCONNU', marque: 'BH', pack: null },                   // rien dans la base
    { chrono: '5', reference: 'YF60K2 000BBB', nom: 'CLIFF 700', marque: 'NAKAMURA', pack: 'enfant' }, // pack déjà déduit
    { chrono: '6', reference: 'AA11 X', nom: 'GRAVEL', marque: 'BH', pack: null },                     // même chrono
  ]
  const base = [
    { chrono: '0-9', reference: 'YF60K2 022XSW', nom: 'CLIFF 700', marque: 'NAKAMURA', pack: 'sport' },
    { chrono: '0-8', reference: 'A2096 B05JFS', nom: 'SPIKE 2.0 VTT', marque: 'BH', pack: 'classique' },
    { chrono: '6', reference: 'AA11 X', nom: 'GRAVEL', marque: 'BH', pack: 'sport' },
  ]
  it("reprend le pack du même chrono, puis du même modèle, puis du même nom", () => {
    const r = withPacksFromBase(nouveaux, base)
    assert.deepEqual(r.map(p => p.pack), ['sport', 'sport', 'classique', null, 'enfant', 'sport'])
    assert.deepEqual(r.map(p => !!p.packRepris), [true, true, true, false, false, true])
  })
  it("le drapeau n'est pas enregistré", () => {
    assert.equal('packRepris' in stockImportData(withPacksFromBase(nouveaux, base)[0], null), false)
  })
  it("compté dans l'aperçu du réimport", () => {
    assert.equal(planStockImport(nouveaux, base).packsRepris, 3)
  })
})
