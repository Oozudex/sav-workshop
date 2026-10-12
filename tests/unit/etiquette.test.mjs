import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chronosLus, refsLues, termeEtiquette } from '../../src/lib/etiquette.js'

// Texte de l'étiquette d'un vélo (photo du magasin)
const ETIQUETTE = `INTERSPORT
EXR 6.4 MS TRAPE,
SUPERIOR SOFT GREEN GLOSS
EXR-64-MS630 BOLD 215116
0-267416/662331/60608
2 000016 742299
VTC HOMME
M`

describe('lecture d’une étiquette', () => {
  it('trouve le chrono au-dessus du code-barres', () => {
    assert.deepEqual(chronosLus(ETIQUETTE), ['0-267416'])
  })
  it('corrige les erreurs de lecture courantes', () => {
    assert.deepEqual(chronosLus('O-2674l6/662331'), ['0-267416'])
    assert.deepEqual(chronosLus('0 – 267416'), ['0-267416'])
    assert.deepEqual(chronosLus('1-17587'), ['1-17587'])
  })
  it('ne confond pas le code-barres ni les autres nombres', () => {
    assert.deepEqual(chronosLus('2 000016 742299\n662331/60608'), [])
  })
  it('lit la réf. fournisseur', () => {
    assert.deepEqual(refsLues(ETIQUETTE), ['EXR-64-MS630'])
  })
  it('choisit le chrono connu, sinon la réf. connue, sinon le chrono lu', () => {
    const base = new Set(['0-267416'])
    assert.equal(termeEtiquette(ETIQUETTE, t => base.has(t)), '0-267416')
    assert.equal(termeEtiquette(ETIQUETTE.replace('0-267416', '0-999999'), t => t === 'EXR-64-MS630'), 'EXR-64-MS630')
    assert.equal(termeEtiquette(ETIQUETTE), '0-267416')
    assert.equal(termeEtiquette('rien de lisible'), null)
  })
})
