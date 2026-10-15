import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  baliseFormErrors, baliseFormInitial, balisePayload, demandesActivesParBalise, enTransfert, estCompteMagasin, etapeDemande,
  balisesACreer, grilleBalises, peutGererBalises, raisonPasDemande, typesBalises,
} from '../../src/lib/balises.js'
import { autoObsolete, baliseTodoSpecs } from '../../src/lib/todos.js'

const balises = [
  { id: 'b1', type: 'Bosch', nom: 'Bosch n° 1', magasinId: 'nord' },
  { id: 'b2', type: 'Bosch', nom: 'Bosch n° 2', magasinId: 'sud' },
  { id: 'b3', type: 'Shimano', nom: 'E-Tube', magasinId: 'nord' },
]
const magasins = [{ id: 'sud', nom: 'Magasin Sud' }, { id: 'nord', nom: 'Magasin Nord' }]
const demande = { id: 'd1', baliseId: 'b1', baliseNom: 'Bosch · Bosch n° 1', fromMagasinId: 'nord', fromMagasinNom: 'Magasin Nord', toMagasinId: 'sud', toMagasinNom: 'Magasin Sud', status: 'pending' }

describe('balises : où elles sont', () => {
  it('une ligne par type, une case par magasin', () => {
    const { types, magasins: cols } = grilleBalises(balises, magasins)
    assert.deepEqual(cols.map(m => m.nom), ['Magasin Nord', 'Magasin Sud'])
    assert.deepEqual(types.map(t => [t.type, t.total]), [['Bosch', 2], ['Shimano', 1]])
    assert.deepEqual(types[0].cellules.nord.map(b => b.id), ['b1'])
    assert.equal(grilleBalises(balises, magasins, { filtreType: 'Shimano' }).types.length, 1)
    assert.deepEqual(typesBalises(balises), ['Bosch', 'Shimano'])
  })
  it('en transfert dès que la demande est acceptée', () => {
    assert.equal(enTransfert(null), false)
    assert.equal(enTransfert(demande), false)
    assert.equal(enTransfert({ ...demande, status: 'accepted' }), true)
    assert.equal(enTransfert({ ...demande, status: 'shipped' }), true)
    assert.equal(demandesActivesParBalise([demande, { ...demande, id: 'd0', baliseId: 'b2', status: 'completed' }]).size, 1)
  })
})

describe('balises : droits et demandes', () => {
  const velosSud = { role: 'velo', magasinId: 'sud' }
  it('acheteur et admin gèrent les fiches ; les comptes magasin demandent', () => {
    assert.equal(peutGererBalises({ role: 'acheteur', univers: ['CYCLE', 'GOLF'] }), true)
    assert.equal(peutGererBalises({ role: 'acheteur', univers: ['GOLF'] }), false)
    assert.equal(peutGererBalises({ role: 'acheteur' }), false)
    assert.equal(peutGererBalises({ role: 'admin' }), true)
    assert.equal(peutGererBalises({ role: 'directeurgen', isAdmin: true }), true)
    assert.equal(peutGererBalises({ role: 'directeurgen' }), false)
    assert.equal(peutGererBalises({ role: 'directeurmag' }), false)
    assert.equal(estCompteMagasin(velosSud), true)
    assert.equal(estCompteMagasin({ role: 'directeurmag', magasinId: 'nord' }), true)
    assert.equal(estCompteMagasin({ role: 'acheteur' }), false)
  })
  it('on ne demande ni sa propre balise, ni une balise déjà demandée', () => {
    assert.equal(raisonPasDemande(balises[0], null, velosSud), null)
    assert.ok(raisonPasDemande(balises[1], null, velosSud))
    assert.match(raisonPasDemande(balises[0], demande, { role: 'velo', magasinId: 'est' }), /Magasin Sud/)
    assert.ok(raisonPasDemande(balises[0], null, { role: 'acheteur' }))
    assert.match(raisonPasDemande(balises[0], demande, velosSud), /déjà demandée/)
  })
  it('chacun son étape : répondre, envoyer, recevoir', () => {
    assert.equal(etapeDemande(demande, 'nord').action, 'respond')
    assert.equal(etapeDemande(demande, 'sud').action, 'cancel')
    assert.equal(etapeDemande({ ...demande, status: 'accepted' }, 'nord').action, 'ship')
    assert.equal(etapeDemande({ ...demande, status: 'accepted' }, 'sud').action, null)
    assert.equal(etapeDemande({ ...demande, status: 'shipped' }, 'sud').action, 'receive')
    assert.match(etapeDemande({ ...demande, status: 'refused', motif: 'on l’utilise' }, 'sud').texte, /on l’utilise/)
  })
  it('tâches automatiques du magasin qui doit agir', () => {
    const [t] = baliseTodoSpecs([demande], { magasinId: 'nord' })
    assert.match(t.titre, /Répondre à la demande de balise « Bosch · Bosch n° 1 » de Magasin Sud/)
    assert.equal(t.auto.type, 'balise')
    assert.equal(baliseTodoSpecs([demande], { magasinId: 'sud' }).length, 0)
    assert.equal(baliseTodoSpecs([{ ...demande, status: 'shipped' }], { magasinId: 'sud' }).length, 1)
    assert.equal(autoObsolete({ id: 'x', auto: { type: 'balise' }, fait: false }, new Set()), true)
  })
  it('relance du demandeur après 2 jours sans réponse ou sans envoi', () => {
    const jour = 86400000, now = Date.UTC(2026, 9, 14)
    const vieille = { ...demande, createdAt: new Date(now - 3 * jour) }
    const relance = baliseTodoSpecs([vieille], { magasinId: 'sud', now })
    assert.equal(relance.length, 1)
    assert.match(relance[0].titre, /Relancer Magasin Nord : pas encore de réponse/)
    assert.equal(baliseTodoSpecs([{ ...demande, createdAt: new Date(now - jour) }], { magasinId: 'sud', now }).length, 0)
    const acceptee = { ...demande, status: 'accepted', respondedAt: new Date(now - 2 * jour) }
    assert.match(baliseTodoSpecs([acceptee], { magasinId: 'sud', now })[0].titre, /pas encore partie/)
    // Le magasin qui a la balise garde sa tâche « envoyer », sans relance
    assert.deepEqual(baliseTodoSpecs([acceptee], { magasinId: 'nord', now }).map(t => t.id.split('_')[1]), ['ship'])
  })
})

describe('balises : fiche', () => {
  it('champs obligatoires et données enregistrées', () => {
    const vide = baliseFormInitial()
    assert.deepEqual(Object.keys(baliseFormErrors(vide)).sort(), ['magasinId', 'nom', 'type'])
    const f = { ...vide, type: ' Bosch ', nom: 'Bosch n° 3', magasinId: 'sud', numeroSerie: '' }
    assert.deepEqual(baliseFormErrors(f), {})
    assert.deepEqual(balisePayload(f, magasins), {
      type: 'Bosch', nom: 'Bosch n° 3', numeroSerie: null, magasinId: 'sud', magasinNom: 'Magasin Sud', note: null,
    })
  })
  it('création : au moins un magasin coché, une balise du même nom par magasin', () => {
    const f = { ...baliseFormInitial(), type: 'Bosch', nom: 'Bosch', numeroSerie: 'SN1' }
    assert.ok(baliseFormErrors(f, { creation: true }).magasinId)
    const deux = balisesACreer({ ...f, magasinIds: ['sud', 'nord'] }, magasins)
    assert.deepEqual(deux.map(b => [b.nom, b.magasinId, b.numeroSerie]), magasins.filter(m => ['sud', 'nord'].includes(m.id)).map(m => ['Bosch', m.id, null]))
    assert.equal(balisesACreer({ ...f, magasinIds: ['sud'] }, magasins)[0].numeroSerie, 'SN1')
  })
})
