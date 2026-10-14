import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CONTACT_EMAIL, lienContact } from '../../src/lib/contact.js'

describe('bouton Contact', () => {
  it('e-mail prérempli avec la page et le compte', () => {
    const lien = lienContact({ page: 'Réparation / SAV', compte: 'Rayon Vélo', magasin: 'Magasin Nord' })
    assert.ok(lien.startsWith(`mailto:${CONTACT_EMAIL}?subject=`))
    const params = new URLSearchParams(lien.split('?')[1])
    assert.equal(params.get('subject'), 'Atelier SAV – Réparation / SAV')
    assert.equal(params.get('body'), '\n\n\n---\nPage : Réparation / SAV\nCompte : Rayon Vélo · Magasin Nord')
  })
  it('sans contexte : juste l’objet', () => {
    assert.equal(lienContact(), `mailto:${CONTACT_EMAIL}?subject=Atelier%20SAV`)
  })
})
