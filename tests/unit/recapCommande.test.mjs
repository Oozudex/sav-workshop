import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nomFichierRecap, recapClient, recapObut } from '../../src/lib/recapCommande.js'

describe('récapitulatif d’une commande client', () => {
  const order = {
    numero: 'C-2026-0142', client: ' Dupont Julie ', tel: '06 12 34 56 78', type: 'piece', produit: 'Dérailleur Deore',
    ref_produit: 'RD-M6100', quantite: 2, fournisseur: 'Shimano', prix: 64.9, fraisPort: 6.9, acompte: 20, createur: 'Karim',
    createdAt: new Date(2026, 9, 14),
  }
  it('client, commande, ligne du produit et frais de port', () => {
    const r = recapClient(order, 'Magasin Nord')
    assert.equal(r.kind, 'client')
    assert.equal(r.magasin, 'Magasin Nord')
    assert.equal(r.numero, 'C-2026-0142')
    assert.equal(r.date, '14/10/2026')
    assert.equal(r.client, 'Dupont Julie')
    assert.deepEqual(r.lignes, [
      { label: 'Dérailleur Deore', detail: 'Pièce · fournisseur Shimano', ref: 'RD-M6100', qte: 2, prix: 64.9 },
      { label: 'Frais de port', ref: null, qte: null, prix: 6.9 },
    ])
    assert.equal(r.total, 71.8)
    assert.equal(r.acompte, 20)
    assert.equal(r.reste, 51.8)
  })
  it('sans frais de port ni acompte, ancien numéro', () => {
    const r = recapClient({ ...order, fraisPort: null, acompte: null, numero: '0012', fournisseur: '' }, '')
    assert.equal(r.lignes.length, 1)
    assert.equal(r.lignes[0].detail, 'Pièce')
    assert.equal(r.numero, '#0012')
    assert.equal(r.acompte, 0)
    assert.equal(r.reste, 64.9)
  })
})

describe('récapitulatif d’une commande SAV', () => {
  it('aucun montant, même si des prix traînent dans la commande', () => {
    const r = recapClient({ numero: 'C-2026-0150', sav: true, client: 'Durand', produit: 'Patte de dérailleur', prix: 12, fraisPort: 5, acompte: 3 }, '')
    assert.equal(r.sav, true)
    assert.deepEqual(r.lignes.map(l => l.prix), [null])
    assert.deepEqual([r.total, r.acompte, r.reste], [null, 0, null])
  })
})

describe('récapitulatif d’une commande OBUT', () => {
  const cmd = {
    clientNom: 'Martin', clientPrenom: 'Jean', clientTel: '06 98 76 54 32', dateCommande: '2026-10-14', vendeur: 'Karim',
    modele: 'MATCH +', prixModele: 180, diametre: '74 mm', strie: '2', poids: '690 g',
    marquageLabel: 'Marquage stylisé', marquage: 'JEAN 13', prixMarquage: 19,
    options: [{ id: 'livraison', label: 'Livraison', prix: 7.1 }], totalTTC: 206.1, acompte: 62, resteARegler: 144.1,
  }
  it('boules, gravure, lignes de prix et montants', () => {
    const r = recapObut(cmd, 'Magasin Nord')
    assert.equal(r.kind, 'obut')
    assert.equal(r.date, '14/10/2026')
    assert.equal(r.client, 'Martin Jean')
    assert.equal(r.modele, 'MATCH +')
    assert.deepEqual([r.diametre, r.poids, r.stries], ['74 mm', '690 g', '2'])
    assert.equal(r.marquage, 'JEAN 13')
    assert.deepEqual(r.lignes.map(l => [l.label, l.detail, l.prix]), [
      ['Boules MATCH +', null, 180], ['Marquage stylisé', '« JEAN 13 »', 19], ['Livraison', null, 7.1],
    ])
    assert.deepEqual([r.total, r.acompte, r.reste], [206.1, 62, 144.1])
  })
  it('sans gravure', () => {
    const r = recapObut({ ...cmd, marquage: null, marquageLabel: null, prixMarquage: null }, '')
    assert.equal(r.marquage, '')
    assert.equal(r.marquageLabel, '')
    assert.equal(r.lignes.length, 2)
  })
})

describe('nom du fichier', () => {
  it('numéro de commande ou OBUT, puis le client', () => {
    assert.equal(nomFichierRecap({ kind: 'client', numero: 'C-2026-0142', client: 'Dupont / Julie' }), 'Récapitulatif C-2026-0142 Dupont Julie.pdf')
    assert.equal(nomFichierRecap({ kind: 'obut', numero: '', client: 'Martin Jean' }), 'Récapitulatif OBUT Martin Jean.pdf')
  })
})
