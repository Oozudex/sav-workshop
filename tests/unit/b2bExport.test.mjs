import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCredentialRows, credentialStores, exportFileName, exportTable, groupRows, moveItem, orderChanges, sheetName, toCsv,
} from '../../src/lib/b2bExport.js'

const MAGASINS = [{ id: 'nord', nom: 'Magasin Nord' }, { id: 'sud', nom: 'Magasin Sud' }, { id: 'est', nom: 'Magasin Est' }]
const TOOLS = [
  { id: 'shimano', label: 'Shimano B2B', url: 'https://b2b.shimano.com', order: 0, credentialStoreIds: ['nord', 'sud'] },
  { id: 'trek', label: 'Trek', url: 'https://trek.com', order: 1, storeIds: ['nord'], credentialStoreIds: [] },
]
const CREDS = {
  shimano: { nord: { email: 'nord@shop.fr', password: 'a;b"c' }, sud: { email: 'sud@shop.fr', password: 'x' } },
  trek: {},
}
const all = { tools: TOOLS, magasins: MAGASINS, creds: CREDS, toolIds: ['shimano', 'trek'], storeIds: ['nord', 'sud', 'est'] }

describe('export des identifiants', () => {
  it('une ligne par identifiant existant', () => {
    const rows = buildCredentialRows(all)
    assert.deepEqual(rows.map(r => `${r.b2b}/${r.magasin}`), ['Shimano B2B/Magasin Nord', 'Shimano B2B/Magasin Sud'])
  })
  it('avec les accès manquants, sans les magasins exclus du B2B', () => {
    const rows = buildCredentialRows({ ...all, includeMissing: true })
    assert.deepEqual(rows.map(r => `${r.b2b}/${r.magasin}/${r.statut}`), [
      'Shimano B2B/Magasin Nord/', 'Shimano B2B/Magasin Sud/', 'Shimano B2B/Magasin Est/Aucun identifiant', 'Trek/Magasin Nord/Aucun identifiant',
    ])
  })
  it('un seul magasin ou un seul B2B', () => {
    assert.equal(buildCredentialRows({ ...all, storeIds: ['sud'] }).length, 1)
    assert.equal(buildCredentialRows({ ...all, toolIds: ['trek'] }).length, 0)
  })
  it('feuilles par B2B ou par magasin', () => {
    const rows = buildCredentialRows(all)
    assert.deepEqual(groupRows(rows, 'magasin').map(g => g.name), ['Magasin Nord', 'Magasin Sud'])
    assert.equal(groupRows(rows, 'b2b').length, 1)
    assert.equal(groupRows(rows).length, 1)
  })
  it('noms de feuille valides et uniques', () => {
    const used = new Set()
    assert.equal(sheetName('Pièces/Accessoires [2026]', used), 'Pièces Accessoires  2026')
    assert.equal(sheetName('x'.repeat(40), used).length, 31)
    assert.equal(sheetName('x'.repeat(40), used), 'x'.repeat(27) + ' (2)')
  })
  it('CSV pour Excel : point-virgule, guillemets, BOM', () => {
    const csv = toCsv(exportTable(buildCredentialRows({ ...all, storeIds: ['nord'] })))
    assert.ok(csv.startsWith('﻿B2B;Magasin;Identifiant;Mot de passe;Adresse'))
    assert.ok(csv.includes('"a;b""c"'))
    assert.ok(!csv.includes('Remarque'))
  })
  it('nom du fichier selon la sélection', () => {
    const date = new Date('2026-09-25T10:00:00Z')
    assert.equal(exportFileName({ ...all, date }), 'identifiants-b2b-tous-2026-09-25')
    assert.equal(exportFileName({ ...all, toolIds: ['shimano'], date }), 'identifiants-b2b-shimano-b2b-2026-09-25')
    assert.equal(exportFileName({ ...all, storeIds: ['nord'], date }), 'identifiants-b2b-magasin-nord-2026-09-25')
  })
  it('magasins qui ont les accès', () => {
    assert.deepEqual(credentialStores(TOOLS[0], MAGASINS).map(m => m.nom), ['Magasin Nord', 'Magasin Sud'])
  })
})

describe('ordre des B2B', () => {
  it('déplace un B2B et ne réécrit que les ordres modifiés', () => {
    const list = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }]
    const moved = moveItem(list, 2, 0)
    assert.deepEqual(moved.map(t => t.id), ['c', 'a', 'b'])
    assert.deepEqual(orderChanges(moved.slice(0, 1), moved.slice(1)), [{ id: 'c', order: 0 }, { id: 'a', order: 1 }, { id: 'b', order: 2 }])
    assert.deepEqual(orderChanges(list, []), [])
  })
})
