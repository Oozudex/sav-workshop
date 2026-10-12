import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { impressionData, impressionSources, impressionsExpirees, trierImpressions } from '../../src/lib/ilvImpressions.js'
import { ilvChoisie } from '../../src/lib/ilv.js'

const SOURCE = { key: 'p1', label: 'Vert · 0-267416', chrono: '0-267416', nom: 'EXR 6.4 MS', marque: 'SUPERIOR', couleur: 'SOFT GREEN',
  prixFort: 1299.99, prixOp: 999.99, pack: 'sport', dateDebut: '2026-10-01', dateFin: '2026-10-31', inconnu: 'x', vide: undefined }

describe('envoi à l’impression', () => {
  it('garde le produit et les choix, sans champ inconnu ni vide', () => {
    const d = impressionData({ uid: 'u1', magasinId: 'm1', source: SOURCE, choix: { type: 'promo', duree: 2, oney: 3, packChoisi: '' } })
    assert.equal(d.uid, 'u1')
    assert.equal(d.source.chrono, '0-267416')
    assert.equal('inconnu' in d.source, false)
    assert.equal('vide' in d.source, false)
    assert.deepEqual([d.type, d.duree, d.oney, d.packChoisi, d.imprimeAt], ['promo', 2, null, null, null]) // Oney : ILV normale seulement
  })
  it('redevient une source d’ILV avec la clé de l’envoi', () => {
    assert.deepEqual(impressionSources([{ id: 'imp1', source: { chrono: '0-1' } }]), [{ chrono: '0-1', key: 'imp1' }])
  })
  it('à imprimer d’abord, puis imprimées ; suppression après 7 jours', () => {
    const jour = 86400000, now = Date.UTC(2026, 9, 12)
    const list = [
      { id: 'a', envoyeAt: now - 2 * jour, imprimeAt: null },
      { id: 'b', envoyeAt: now - 3 * jour, imprimeAt: null },
      { id: 'c', envoyeAt: now - 9 * jour, imprimeAt: now - 8 * jour },
      { id: 'd', envoyeAt: now - 2 * jour, imprimeAt: now - jour },
    ]
    const { aImprimer, imprimees } = trierImpressions(list)
    assert.deepEqual(aImprimer.map(i => i.id), ['b', 'a'])
    assert.deepEqual(imprimees.map(i => i.id), ['d', 'c'])
    assert.deepEqual(impressionsExpirees(list, now).map(i => i.id), ['c'])
  })
})

describe('ILV selon les choix', () => {
  const item = { nom: 'EXR 6.4 MS', marque: 'SUPERIOR', prixFort: 1299.99, prixOp: 999.99, pack: 'sport', dateDebut: '2026-10-01', dateFin: '2026-10-31' }
  it('reprend le modèle et le pack choisis', () => {
    const ilv = ilvChoisie(item, { type: 'promo', duree: 2 })
    assert.equal(ilv.error, undefined)
    assert.equal(ilv.type, 'promo')
  })
  it('refuse un modèle devenu impossible (OP terminée, bon plan retiré)', () => {
    assert.match(ilvChoisie({ ...item, prixOp: null }, { type: 'promo' }).error, /plus possible/)
  })
  it('pack choisi à la main quand la base n’en a pas', () => {
    assert.match(ilvChoisie({ ...item, pack: null }, { type: 'normal' }).error, /Pack/)
    assert.equal(ilvChoisie({ ...item, pack: null }, { type: 'normal', packChoisi: 'classique' }).error, undefined)
  })
})
