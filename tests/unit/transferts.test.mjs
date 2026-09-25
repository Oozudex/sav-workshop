import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  myTransferRole, otherReadField, transferNeedsAction, transferNextStep, transferProgress, transferSides,
} from '../../src/lib/transferts.js'

// Demande d'un vendeur de Nord : il veut un vélo que Sud possède
const DEMANDE = { fromMagasinId: 'nord', fromMagasinNom: 'Nord', toMagasinId: 'sud', toMagasinNom: 'Sud', status: 'pending' }
// Transfert décidé par l'acheteur : Est envoie à Ouest
const ACHETEUR = { fromMagasinId: 'est', fromMagasinNom: 'Est', toMagasinId: 'ouest', toMagasinNom: 'Ouest', status: 'pending', createdByAcheteur: true }

describe('qui envoie, qui reçoit', () => {
  it('demande d’un vendeur : le magasin demandé envoie, le demandeur reçoit', () => {
    const s = transferSides(DEMANDE)
    assert.equal(s.senderNom, 'Sud')
    assert.equal(s.receiverNom, 'Nord')
    assert.equal(myTransferRole(DEMANDE, 'nord'), 'receiver')
    assert.equal(myTransferRole(DEMANDE, 'sud'), 'sender')
    assert.equal(myTransferRole(DEMANDE, 'est'), null)
  })
  it('transfert de l’acheteur : l’envoyeur envoie, le receveur reçoit', () => {
    const s = transferSides(ACHETEUR)
    assert.equal(s.senderNom, 'Est')
    assert.equal(s.receiverNom, 'Ouest')
  })
  it('champ non lu de l’autre magasin', () => {
    assert.equal(otherReadField(DEMANDE, 'sud'), 'readByFrom')
    assert.equal(otherReadField(DEMANDE, 'nord'), 'readByTo')
  })
})

describe('prochaine étape', () => {
  const opts = m => ({ magasinId: m, canAct: true })
  it('en attente : c’est au magasin qui a le vélo de répondre', () => {
    assert.equal(transferNextStep(DEMANDE, opts('sud')).action, 'respond')
    assert.equal(transferNextStep(DEMANDE, opts('nord')).mine, false)
    assert.equal(transferNextStep(ACHETEUR, opts('est')).action, 'respond')
    assert.equal(transferNeedsAction(ACHETEUR, 'ouest'), false)
  })
  it('accepté : l’envoyeur envoie, le receveur peut déjà confirmer l’arrivée', () => {
    const t = { ...DEMANDE, status: 'accepted' }
    assert.equal(transferNextStep(t, opts('sud')).action, 'ship')
    const r = transferNextStep(t, opts('nord'))
    assert.equal(r.action, 'receive')
    assert.equal(r.mine, false)
  })
  it('en route : au receveur de confirmer', () => {
    const t = { ...ACHETEUR, status: 'shipped' }
    assert.ok(transferNeedsAction(t, 'ouest'))
    assert.ok(!transferNeedsAction(t, 'est'))
  })
  it('refusé : classé par le demandeur (vendeur ou acheteur)', () => {
    assert.equal(transferNextStep({ ...DEMANDE, status: 'refused' }, opts('nord')).action, 'close')
    assert.equal(transferNextStep({ ...ACHETEUR, status: 'refused' }, opts('ouest')).mine, false)
    assert.equal(transferNextStep({ ...ACHETEUR, status: 'refused' }, { isAcheteur: true }).action, 'close')
    assert.equal(transferNextStep({ ...DEMANDE, status: 'refused' }, opts('sud')).text, 'Vous avez refusé. Nord classera la demande.')
  })
  it('lecture seule sans droit d’agir', () => {
    assert.equal(transferNextStep(DEMANDE, { magasinId: 'sud' }).mine, false)
  })
  it('frise', () => {
    assert.equal(transferProgress(DEMANDE), 1)
    assert.equal(transferProgress({ status: 'shipped' }), 3)
    assert.equal(transferProgress({ status: 'completed' }), 4)
  })
})
