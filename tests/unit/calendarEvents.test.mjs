import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatPhone, rdvClientErrors, ticketPrefill } from '../../src/lib/calendarEvents.js'

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
