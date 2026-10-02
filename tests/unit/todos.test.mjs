import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, atelierTodoSpecs, autoObsolete, joursLabel, motRecent, opTodoSpecs, recurrenceSpecs,
  sortTodos, todoAutoId, weekdayIndex, transfertTodoSpecs, classement, tigreDeLaSemaine, lundi,
} from '../../src/lib/todos.js'

describe('dates', () => {
  it('jour de la semaine, lundi = 0', () => {
    assert.equal(weekdayIndex('2026-10-05'), 0)
    assert.equal(weekdayIndex('2026-10-04'), 6)
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  })
})

describe('tâches des OP', () => {
  const op = { id: 'anniv', nom: 'OP ANNIVERSAIRE', dateDebut: '2026-10-07', dateFin: '2026-10-19', rayonTypes: ['velo'] }
  const ctx = today => ({ magasinId: 'nord', rayon: 'velo', today })
  it('mise en place le jour du début', () => {
    assert.deepEqual(opTodoSpecs([op], ctx('2026-10-06')), [])
    const [t] = opTodoSpecs([op], ctx('2026-10-07'))
    assert.equal(t.auto.type, 'op_debut')
    assert.equal(t.titre, 'Mettre en place l’OP « OP ANNIVERSAIRE »')
    assert.equal(t.id, todoAutoId('op_debut', 'anniv', 'nord', 'velo'))
  })
  it('fin de l’OP le jour de la fin, mise en place retirée après la fin', () => {
    assert.deepEqual(opTodoSpecs([op], ctx('2026-10-18')).map(t => t.auto.type), ['op_debut'])
    assert.deepEqual(opTodoSpecs([op], ctx('2026-10-19')).map(t => t.auto.type), ['op_debut', 'op_fin'])
    assert.deepEqual(opTodoSpecs([op], ctx('2026-10-21')).map(t => t.auto.type), ['op_fin'])
    assert.deepEqual(opTodoSpecs([op], ctx('2026-10-27')), [])
  })
  it('seulement pour les rayons et magasins ciblés', () => {
    assert.deepEqual(opTodoSpecs([op], { magasinId: 'nord', rayon: 'chaussure', today: '2026-10-07' }), [])
    assert.deepEqual(opTodoSpecs([{ ...op, magasinIds: ['sud'] }], ctx('2026-10-07')), [])
    assert.equal(opTodoSpecs([{ ...op, rayonTypes: [] }], { magasinId: 'nord', rayon: 'caisse', today: '2026-10-07' }).length, 1)
  })
})

describe('tâches atelier', () => {
  it('vélo prêt depuis 7 jours : relancer le client, sans son nom', () => {
    const tickets = [
      { id: 't1', ticketNumber: 'SAV-2026-0005', status: 'Ready', readySince: new Date(2026, 8, 24) },
      { id: 't2', ticketNumber: 'SAV-2026-0006', status: 'Ready', readySince: new Date(2026, 8, 30) },
      { id: 't3', ticketNumber: 'SAV-2026-0007', status: 'Closed', readySince: new Date(2026, 8, 1) },
    ]
    const specs = atelierTodoSpecs(tickets, { magasinId: 'nord', today: '2026-10-02' })
    assert.deepEqual(specs.map(s => s.auto.refId), ['t1'])
    assert.equal(specs[0].titre, 'Relancer le client du ticket SAV-2026-0005 : vélo prêt depuis le 24/09')
  })
})

describe('tâches récurrentes', () => {
  const recs = [
    { id: 'r1', titre: 'Vérifier les vélos prêts', jours: [0, 3], assigneA: 'Julie' },
    { id: 'r2', titre: 'Inventaire', jours: [4], actif: false },
  ]
  it('créées les jours prévus, une par jour', () => {
    const [t] = recurrenceSpecs(recs, { today: '2026-10-05' }) // lundi
    assert.equal(t.id, 'rec_r1_2026-10-05')
    assert.equal(t.assigneA, 'Julie')
    assert.deepEqual(recurrenceSpecs(recs, { today: '2026-10-06' }), [])
    assert.deepEqual(recurrenceSpecs(recs, { today: '2026-10-09' }), []) // vendredi, récurrence en pause
  })
  it('jours en clair', () => {
    assert.equal(joursLabel([0, 2, 4]), 'lun., mer. et ven.')
    assert.equal(joursLabel([0, 1, 2, 3, 4]), 'du lundi au vendredi')
    assert.equal(joursLabel([0, 1, 2, 3, 4, 5, 6]), 'tous les jours')
  })
})

describe('affichage', () => {
  it('en retard d’abord, puis par échéance, puis les plus récentes', () => {
    const list = sortTodos([
      { id: 'a', createdAt: 1 }, { id: 'b', echeance: '2026-10-10' }, { id: 'c', echeance: '2026-10-01' }, { id: 'd', createdAt: 5 },
    ], '2026-10-02')
    assert.deepEqual(list.map(t => t.id), ['c', 'b', 'd', 'a'])
  })
  it('mot du soir affiché 36 h', () => {
    const now = new Date('2026-10-02T09:00:00').getTime()
    assert.equal(motRecent({ texte: 'Bonne journée', at: new Date('2026-10-01T19:30:00') }, now), true)
    assert.equal(motRecent({ texte: 'Ancien', at: new Date('2026-09-30T19:30:00') }, now), false)
    assert.equal(motRecent({ texte: '', at: new Date() }, now), false)
  })
  it('tâche auto obsolète : pas cochée et sa raison a disparu', () => {
    const ids = new Set(['x'])
    assert.equal(autoObsolete({ id: 'y', auto: { type: 'atelier' } }, ids), true)
    assert.equal(autoObsolete({ id: 'y', auto: { type: 'atelier' }, fait: true }, ids), false)
    assert.equal(autoObsolete({ id: 'y', auto: { type: 'recurrente' } }, ids), false)
    assert.equal(autoObsolete({ id: 'y' }, ids), false)
  })
})

describe('transferts', () => {
  // Demande d'un vendeur : from = magasin qui demande (reçoit), to = magasin qui a le vélo (envoie)
  const t = { id: 'tr1', modele: 'ALLROAD 450', fromMagasinId: 'nord', fromMagasinNom: 'Laval', toMagasinId: 'sud', toMagasinNom: 'Vitré' }
  it('une tâche par étape, pour le magasin qui doit agir', () => {
    assert.deepEqual(transfertTodoSpecs([{ ...t, status: 'pending' }], { magasinId: 'sud' }).map(x => x.titre),
      ['Répondre à la demande de transfert « ALLROAD 450 » pour Laval'])
    assert.deepEqual(transfertTodoSpecs([{ ...t, status: 'pending' }], { magasinId: 'nord' }), [])
    assert.deepEqual(transfertTodoSpecs([{ ...t, status: 'accepted' }], { magasinId: 'sud' }).map(x => x.titre),
      ['Envoyer « ALLROAD 450 » à Laval et le marquer envoyé'])
    assert.deepEqual(transfertTodoSpecs([{ ...t, status: 'shipped' }], { magasinId: 'nord' }).map(x => x.titre),
      ['Confirmer la réception de « ALLROAD 450 » envoyé par Vitré'])
  })
  it('l’étape suivante a son propre identifiant (l’ancienne tâche devient inutile)', () => {
    const [a] = transfertTodoSpecs([{ ...t, status: 'pending' }], { magasinId: 'sud' })
    const [b] = transfertTodoSpecs([{ ...t, status: 'accepted' }], { magasinId: 'sud' })
    assert.notEqual(a.id, b.id)
    assert.equal(autoObsolete({ id: a.id, auto: a.auto }, new Set([b.id])), true)
  })
})

describe('tigre de la semaine', () => {
  const fait = (faitPar, jour) => ({ fait: true, faitPar, faitAt: new Date(`${jour}T12:00:00`) })
  const todos = [
    fait('Julie', '2026-09-28'), fait('Julie', '2026-10-01'), fait('Karim', '2026-10-04'),
    fait('Karim', '2026-09-30'), fait('Thomas', '2026-10-06'), { fait: true, faitAt: new Date('2026-09-29T12:00:00') },
  ]
  it('lundi de la semaine', () => {
    assert.equal(lundi('2026-10-08'), '2026-10-05')
    assert.equal(lundi('2026-10-05'), '2026-10-05')
  })
  it('classement sur une période, sans les tâches sans nom', () => {
    assert.deepEqual(classement(todos, '2026-09-28', '2026-10-04'), [{ nom: 'Julie', total: 2 }, { nom: 'Karim', total: 2 }])
  })
  it('tigre(s) de la semaine dernière, ex aequo compris', () => {
    assert.deepEqual(tigreDeLaSemaine(todos, '2026-10-08'), { noms: ['Julie', 'Karim'], total: 2, debut: '2026-09-28', fin: '2026-10-04' })
    assert.equal(tigreDeLaSemaine(todos, '2026-10-20'), null)
  })
})
