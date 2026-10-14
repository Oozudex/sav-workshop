import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arrangeHome, canSeeSection, groupTools } from '../../src/lib/homeLayout.js'

// Même rôles que les cartes de l'accueil (components/home/sections.jsx)
const SECTIONS = [
  { path: '/tickets', group: 'velo', roles: null, acheteurRayons: ['velo'] },
  { path: '/orders', group: 'velo', roles: ['velo', 'acheteur', 'directeurmag', 'directeurgen'], acheteurRayons: ['velo'] },
  { path: '/operations', roles: null },
  { path: '/flocage', group: 'chaussure', roles: ['chaussure', 'directeurmag', 'acheteur', 'directeurgen'], acheteurRayons: ['chaussure'] },
  { path: '/transfert', group: 'velo', roles: ['velo', 'acheteur', 'directeurmag', 'directeurgen'], acheteurRayons: ['velo'] },
  { path: 'drive', group: 'velo', roles: ['velo', 'acheteur'], acheteurRayons: ['velo'] },
  { path: '/b2b', roles: null },
  { path: '/budgets', lead: true, roles: ['acheteur', 'directeurgen'] },
  { path: '/settings', roles: ['directeurmag', 'acheteur'] },
]
const GROUPS = ['velo', 'chaussure']
const labels = cards => cards.map(c => (c.type === 'group' ? `[${c.group}]` : c.section.path))

describe('accueil', () => {
  it('le rayon cycle voit tous ses outils directement', () => {
    assert.deepEqual(labels(arrangeHome(SECTIONS, GROUPS, { role: 'velo' })),
      ['/tickets', '/orders', '/operations', '/transfert', 'drive', '/b2b'])
  })

  it('le directeur de magasin a une carte Vélo ; Flocage, seul outil chaussure, reste direct', () => {
    const cards = arrangeHome(SECTIONS, GROUPS, { role: 'directeurmag' })
    assert.deepEqual(labels(cards), ['[velo]', '/flocage', '/operations', '/b2b', '/settings'])
    assert.deepEqual(cards[0].tools.map(s => s.path), ['/tickets', '/orders', '/transfert'])
  })

  it("l'acheteur avec le service Cycle a la carte Vélo puis Budgets", () => {
    const cards = arrangeHome(SECTIONS, GROUPS, { role: 'acheteur', rayons: ['velo'] })
    assert.deepEqual(labels(cards), ['[velo]', '/budgets', '/operations', '/b2b', '/settings'])
    assert.deepEqual(cards[0].tools.map(s => s.path), ['/tickets', '/orders', '/transfert', 'drive'])
  })

  it("l'acheteur sans service n'a pas de carte Vélo", () => {
    assert.deepEqual(labels(arrangeHome(SECTIONS, GROUPS, { role: 'acheteur', rayons: [] })),
      ['/budgets', '/operations', '/b2b', '/settings'])
  })

  it('la direction a la carte Vélo, Flocage et Budgets', () => {
    assert.deepEqual(labels(arrangeHome(SECTIONS, GROUPS, { role: 'directeurgen' })),
      ['[velo]', '/flocage', '/budgets', '/operations', '/b2b'])
  })

  it("l'espace d'un rayon ne contient que les outils visibles du compte", () => {
    assert.deepEqual(groupTools(SECTIONS, 'velo', { role: 'acheteur', rayons: ['chaussure'] }), [])
    assert.equal(canSeeSection(SECTIONS[5], { role: 'directeurmag' }), false)
  })
})
