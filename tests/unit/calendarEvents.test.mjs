import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  absencesFor, canMarkPresence, formatPhone, opWeekBars, rdvClientErrors, rdvToCheck, reschedulePrefill, ticketPrefill,
} from '../../src/lib/calendarEvents.js'

const OK = { customerName: 'Marie Dubois', customerPhone: '06 12 34 56 78', description: 'Freins avant qui frottent et vitesses qui sautent' }

describe('RDV client', () => {
  it('complet : aucune erreur', () => {
    assert.deepEqual(rdvClientErrors(OK), {})
    assert.deepEqual(rdvClientErrors({ ...OK, customerPhone: '+33 6 12 34 56 78' }), {})
  })

  it('nom et prénom, téléphone et description détaillée obligatoires', () => {
    const e = rdvClientErrors({ customerName: ' ', customerPhone: '', description: '' })
    assert.deepEqual(Object.keys(e).sort(), ['customerName', 'customerPhone', 'description'])
    assert.ok(rdvClientErrors({ ...OK, customerName: 'Dubois' }).customerName)
    assert.ok(rdvClientErrors({ ...OK, customerPhone: '06 12 34' }).customerPhone)
    assert.ok(rdvClientErrors({ ...OK, description: 'Freins' }).description)
  })

  it('formate les numéros français', () => {
    assert.equal(formatPhone('0612345678'), '06 12 34 56 78')
    assert.equal(formatPhone('06.12.34.56.78'), '06 12 34 56 78')
    assert.equal(formatPhone('+33 6 12 34 56 78'), '+33 6 12 34 56 78')
    assert.equal(formatPhone(null), '')
  })

  it('pré-remplit la fiche atelier', () => {
    assert.deepEqual(ticketPrefill({ ...OK, customerPhone: '0612345678' }), {
      customerName: 'Marie Dubois',
      customerPhone: '06 12 34 56 78',
      issueDescription: 'Freins avant qui frottent et vitesses qui sautent',
    })
    assert.deepEqual(ticketPrefill({}), { customerName: '', customerPhone: '', issueDescription: '' })
  })
})

describe('présence au RDV', () => {
  const TODAY = '2026-09-30'
  const rdv = (id, date, extra = {}) => ({ id, type: 'rdv_client', date, customerPhone: '06 12 34 56 78', ...extra })

  it("se pointe à partir du jour du RDV", () => {
    assert.equal(canMarkPresence(rdv('a', '2026-09-30'), TODAY), true)
    assert.equal(canMarkPresence(rdv('a', '2026-10-01'), TODAY), false)
    assert.equal(canMarkPresence({ type: 'teams', id: 'x', date: '2026-09-01' }, TODAY), false)
  })
  it("signale les RDV passés non pointés", () => {
    assert.equal(rdvToCheck(rdv('a', '2026-09-29'), TODAY), true)
    assert.equal(rdvToCheck(rdv('a', '2026-09-30'), TODAY), false)
    assert.equal(rdvToCheck(rdv('a', '2026-09-29', { presence: 'venu' }), TODAY), false)
  })
  it("retrouve les absences d'un numéro, quel que soit le format", () => {
    const events = [
      rdv('a', '2026-09-10', { presence: 'absent' }),
      rdv('b', '2026-09-20', { presence: 'absent', customerPhone: '0612345678' }),
      rdv('c', '2026-09-21', { presence: 'venu' }),
      rdv('d', '2026-09-22', { presence: 'absent', customerPhone: '07 00 00 00 00' }),
    ]
    assert.deepEqual(absencesFor(events, '06.12.34.56.78').map(e => e.id), ['b', 'a'])
    assert.deepEqual(absencesFor(events, '06 12 34 56 78', 'b').map(e => e.id), ['a'])
    assert.deepEqual(absencesFor(events, '0612'), [])
  })
  it("prépare la reprogrammation", () => {
    const p = reschedulePrefill(rdv('a', '2026-09-29', { customerName: ' Marie Dubois ', description: 'Freins', rayonType: 'velo' }))
    assert.deepEqual(p, { type: 'rdv_client', customerName: 'Marie Dubois', customerPhone: '06 12 34 56 78', description: 'Freins', rayonType: 'velo', rescheduledFrom: '2026-09-29' })
  })
})

describe('OP du calendrier', () => {
  const op = (id, dateDebut, dateFin) => ({ id, nom: id, dateDebut, dateFin })
  const LUNDI = '2026-10-05'
  it('une barre sur toute la durée, coupée aux bords de la semaine', () => {
    const [b] = opWeekBars([op('a', '2026-09-28', '2026-10-15')], LUNDI)
    assert.deepEqual({ col: b.col, span: b.span, avant: b.avant, apres: b.apres, lane: b.lane }, { col: 0, span: 7, avant: true, apres: true, lane: 0 })
    const [c] = opWeekBars([op('c', '2026-10-07', '2026-10-09')], LUNDI)
    assert.deepEqual({ col: c.col, span: c.span, avant: c.avant, apres: c.apres }, { col: 2, span: 3, avant: false, apres: false })
  })
  it('ignore les OP hors de la semaine et range les barres sur le moins de lignes possible', () => {
    const bars = opWeekBars([
      op('hors', '2026-10-12', '2026-10-20'),
      op('lundi-mardi', '2026-10-05', '2026-10-06'),
      op('mercredi', '2026-10-07', '2026-10-07'),
      op('longue', '2026-10-01', '2026-10-31'),
    ], LUNDI)
    assert.deepEqual(bars.map(b => [b.op.id, b.lane]), [['longue', 0], ['lundi-mardi', 1], ['mercredi', 1]])
  })
  it('passage à l’heure d’hiver sans décalage', () => {
    const [b] = opWeekBars([op('a', '2026-10-25', '2026-10-27')], '2026-10-19')
    assert.deepEqual([b.col, b.span], [6, 1])
  })
})
