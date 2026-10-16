import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { empreinteBudget, jourParis, peutSauvegarderBudgets, sauvegardesAJeter } from '../../functions/lib.js'
import { dossierDriveId } from '../../src/lib/drive.js'

describe('sauvegarde automatique des budgets', () => {
  it('garde les 30 derniers jours, puis la dernière sauvegarde de chaque mois', () => {
    const f = (id, date) => ({ id, date })
    const fichiers = [f('a', '2026-08-03'), f('b', '2026-08-28'), f('c', '2026-09-10'), f('d', '2026-09-15'), f('e', '2026-09-20'), f('g', '2026-10-15')]
    assert.deepEqual(sauvegardesAJeter(fichiers, '2026-10-16'), ['a', 'c'])
    assert.deepEqual(sauvegardesAJeter([f('x', '2026-09-17'), f('y', '2026-09-16')], '2026-10-16'), []) // 17/09 : moins de 30 jours ; 16/09 : seule de son mois
    assert.deepEqual(sauvegardesAJeter([f('z', undefined)], '2026-10-16'), [])
  })

  it('ne sauvegarde que si le contenu change (pas pour une date de modification)', () => {
    const data = l => ({ budget: { nom: 'BUDGET AH27', base: { s: { a: 1 } }, sauvegarde: { empreinte: 'x' } }, lines: l, fiches: [], brands: [], universList: [], magasins: [], reglages: null, liens: {} })
    const ligne = (v, at) => ({ id: 'm', saisie: { a: v }, updatedAt: { toMillis: () => at } })
    const e = empreinteBudget(data([ligne(10, 1)]))
    assert.equal(empreinteBudget(data([ligne(10, 2)])), e)
    assert.notEqual(empreinteBudget(data([ligne(11, 2)])), e)
    assert.equal(empreinteBudget({ ...data([ligne(10, 1)]), budget: { base: { s: { a: 1 } }, nom: 'BUDGET AH27' } }), e) // ordre des clés, champ sauvegarde
  })

  it('jour à Paris et droits du bouton « Sauvegarder maintenant »', () => {
    assert.equal(jourParis(new Date('2026-10-16T23:30:00Z')), '2026-10-17')
    const ok = { firebase: { sign_in_second_factor: 'totp' } }
    assert.equal(peutSauvegarderBudgets({ role: 'directeurgen' }, ok), true)
    assert.equal(peutSauvegarderBudgets({ role: 'admin' }, ok), true)
    assert.equal(peutSauvegarderBudgets({ role: 'directeurgen' }, {}), false) // sans double authentification
    assert.equal(peutSauvegarderBudgets({ role: 'acheteur' }, ok), false)
    assert.equal(peutSauvegarderBudgets({ role: 'directeurgen', isActive: false }, ok), false)
  })

  it('lit le lien d’un dossier ou d’un Drive partagé', () => {
    assert.equal(dossierDriveId('https://drive.google.com/drive/folders/0ABcdEFgh123456789?usp=sharing'), '0ABcdEFgh123456789')
    assert.equal(dossierDriveId('https://drive.google.com/drive/u/1/folders/1a2B3c4D5e6F7g8H9i'), '1a2B3c4D5e6F7g8H9i')
    assert.equal(dossierDriveId('0ABcdEFgh123456789'), '0ABcdEFgh123456789')
    assert.equal(dossierDriveId('pas un lien'), null)
  })
})
