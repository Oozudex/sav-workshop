import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { blocs, coutEstime, peutVoirAssistant, segments } from '../../src/lib/assistant.js'

describe('bulle de l’assistant', () => {
  it('visible pour le rayon vélo et l’administrateur', () => {
    assert.equal(peutVoirAssistant({ role: 'velo' }), true)
    assert.equal(peutVoirAssistant({ role: 'directeurgen', isAdmin: true }), true)
    assert.equal(peutVoirAssistant({ role: 'directeurgen' }), false)
    assert.equal(peutVoirAssistant({ role: 'textile' }), false)
    assert.equal(peutVoirAssistant({ role: 'velo', isActive: false }), false)
    assert.equal(peutVoirAssistant(null), false)
  })
})

describe('mise en forme des réponses', () => {
  it('gras, italique et sources dans une ligne', () => {
    assert.deepEqual(segments('Il faut un **acompte** [1], *toujours*.'), [
      { type: 'texte', valeur: 'Il faut un ' }, { type: 'gras', valeur: 'acompte' }, { type: 'texte', valeur: ' ' },
      { type: 'source', n: 1 }, { type: 'texte', valeur: ', ' }, { type: 'italique', valeur: 'toujours' }, { type: 'texte', valeur: '.' },
    ])
  })
  it('paragraphes, puces et étapes numérotées', () => {
    const b = blocs('Voici la marche à suivre :\n1. Créer la fiche [1]\n2. Appeler le client\n\n- Caution\n- Pièce d’identité\nFin.')
    assert.deepEqual(b.map(x => x.type), ['paragraphe', 'numeros', 'puces', 'paragraphe'])
    assert.equal(b[1].elements.length, 2)
    assert.equal(b[1].debut, 1)
    assert.deepEqual(b[1].elements[0].at(-1), { type: 'source', n: 1 })
    assert.equal(b[2].elements.length, 2)
  })
  it('coût estimé à partir des jetons', () => {
    const c = coutEstime([{ jetons: { entree: 1_000_000, sortie: 0 } }, { jetons: { entree: 0, sortie: 1_000_000 } }, { jetons: null }], 1)
    assert.ok(Math.abs(c - 2.8) < 1e-9)
  })
})
