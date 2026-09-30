import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  absencesFor, canMarkPresence, formatPhone, rdvClientErrors, rdvToCheck, reschedulePrefill, ticketPrefill,
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
