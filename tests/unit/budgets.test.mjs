import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTRE_SANS_ACHETEUR, acheteurCouvre, segmentsAuChoix, universLabel, addTotals, budgetRank, fournisseurResolver, coefMarque, computeAdapte, fournisseurKey, noteMarque, withAdapte, evolution, formatPct, groupeRatio, groupeTotal, objectif, brandsBySegment, budgetName, buyerFilterTest, defaultBuyerFilter, filtreAcheteur, canEditUnivers, computeTotals, segmentsCatalog, findN1Sheet, linesFromBudget, magasinMatcher, mergeSegments, n1Columns,
  parseBaseSheet, parseN1Sheet, planN1Import, previousSeason, segmentId, sortSegments, mergeCommandes, parseCommandeSheet, parseMoreSheet, saisieFromNextN1, planCommande, cibleCommande, CIBLE_IGNORER, CIBLE_NOUVELLE,
} from '../../src/lib/budgets.js'

const MAGASINS = [
  { id: 'cht', nom: 'CHATEAU GONTIER', code: 'CHT 274/0', alias: [] },
  { id: 'lf', nom: 'LA FERTE', code: 'LF 458/0', alias: ['LA FERTE BERNARD'] },
]
const matchMagasin = magasinMatcher(MAGASINS)
const UNIVERS = ['ACCESSOIRE TEXTILE', 'ALPINISME ET ESCALADE', 'BAGAGERIE', 'RANDONNEE']

// Extrait de « BASE BUDGET AH27 TYPE » (colonnes réduites : Univers, Magasin, …, Budget détail marques)
const BASE = [
  ['Budget édition - 724 - AH2027', '', '', ''],
  ['', '', 'Historique', 'Budget'],
  ['Univers', 'Magasin', 'CA TTC', 'Budget détail marques'],
  ['', 'TOTAUX', 999, 999],
  ['ACCESSOIRE TEXTILE', 'CHT 274/0', 1, 150],
  ['ACCESSOIRE TEXTILE', 'LF 458/0', 1, 80],
  ['  CEINTURE', 'CHT 274/0', 1, 100],
  ['  CEINTURE', 'LF 458/0', 1, 30],
  ['  CHAUSSETTES', 'CHT 274/0', 1, 50],
  ['  CHAUSSETTES', 'LF 458/0', 1, 50],
  ['ALPINISME ET ESCALADE', 'CHT 274/0', 1, 40],
  ['ALPINISME ET ESCALADE', 'LF 458/0', 1, 10],
  ['RANDONNEE', 'CHT 274/0', 1, 70],
  ['  BAGAGERIE', 'CHT 274/0', 1, 70],
  ['  BAGAGERIE', 'XYZ 1/0', 1, 5],
]

describe('saisons', () => {
  it('nomme le budget et trouve son N-1', () => {
    assert.equal(budgetName('AH', 2027), 'BUDGET AH27')
    assert.deepEqual(previousSeason({ saison: 'PE', annee: 2028 }), { saison: 'PE', annee: 2027 })
  })
})

describe('droits', () => {
  const acheteur = { role: 'acheteur', univers: ['CYCLE'] }
  it("la direction modifie tout, l'acheteur ses univers attitrés", () => {
    assert.equal(canEditUnivers({ role: 'directeurgen' }, 'GOLF'), true)
    assert.equal(canEditUnivers(acheteur, 'CYCLE'), true)
    assert.equal(canEditUnivers(acheteur, 'GOLF'), false)
    assert.equal(canEditUnivers({ role: 'acheteur' }, 'CYCLE'), false)
    assert.equal(canEditUnivers({ role: 'velo', univers: ['CYCLE'] }, 'CYCLE'), false)
  })
  it("un acheteur n'importe que ses univers", () => {
  })
})

describe('filtre par acheteur', () => {
  const ACHETEURS = [{ id: 'paul', univers: ['CYCLE', 'GOLF'] }, { id: 'lea', univers: ['RUNNING'] }]
  const garde = (filtre, univers) => { const keep = buyerFilterTest(filtre, ACHETEURS); return univers.filter(u => keep(u)) }
  const TOUS = ['CYCLE', 'GOLF', 'RUNNING', 'PECHE']

  it("un acheteur part de ses univers, la direction de tout", () => {
    assert.equal(defaultBuyerFilter({ role: 'acheteur', uid: 'paul', univers: ['CYCLE'] }), filtreAcheteur('paul'))
    assert.equal(defaultBuyerFilter({ role: 'acheteur', uid: 'x', univers: [] }), '')
    assert.equal(defaultBuyerFilter({ role: 'directeurgen', uid: 'd' }), '')
  })
  it("garde les univers de l'acheteur choisi, ou ceux sans acheteur", () => {
    assert.deepEqual(garde('', TOUS), TOUS)
    assert.deepEqual(garde(filtreAcheteur('paul'), TOUS), ['CYCLE', 'GOLF'])
    assert.deepEqual(garde(FILTRE_SANS_ACHETEUR, TOUS), ['PECHE'])
    assert.deepEqual(garde(filtreAcheteur('inconnu'), TOUS), [])
  })
})

describe('univers partagé par segment (TEXTILE : LOISIR / MULTISPORT)', () => {
  const loisir = { id: 'paul', role: 'acheteur', univers: ['TEXTILE HOMME', 'CYCLE'], universSegments: { 'TEXTILE HOMME': ['LOISIR'] } }
  const multi = { id: 'lea', role: 'acheteur', univers: ['TEXTILE HOMME'], universSegments: { 'TEXTILE HOMME': ['MULTISPORT'] } }

  it('propose Loisir / Multisport aux univers qui ont les deux, Habillement / Chaussures au TRAINING', () => {
    assert.deepEqual(segmentsAuChoix('TEXTILE HOMME', ['LOISIR', 'MULTISPORT']), ['LOISIR', 'MULTISPORT'])
    assert.deepEqual(segmentsAuChoix('TEXTILE FEMME', ['Multisport', 'Loisir', 'AUTRE']), ['Loisir', 'Multisport'])
    assert.deepEqual(segmentsAuChoix('TEXTILE HOMME', ['LOISIR', 'VELO']), [])
    assert.deepEqual(segmentsAuChoix('TRAINING', ['CHAUSSURES', 'HABILLEMENT']), ['HABILLEMENT', 'CHAUSSURES'])
    assert.deepEqual(segmentsAuChoix('RUNNING', ['CHAUSSURES', 'HABILLEMENT']), [])
  })

  it('un acheteur limité à un segment ne modifie que celui-là', () => {
    assert.equal(canEditUnivers(loisir, 'TEXTILE HOMME', 'LOISIR'), true)
    assert.equal(canEditUnivers(loisir, 'TEXTILE HOMME', 'MULTISPORT'), false)
    assert.equal(canEditUnivers(loisir, 'CYCLE', 'VELO'), true) // univers non limité : tous ses segments
    assert.equal(acheteurCouvre(loisir, 'TEXTILE HOMME'), true) // l'univers en partie
    assert.equal(universLabel(loisir, 'TEXTILE HOMME'), 'TEXTILE HOMME (LOISIR)')
    assert.equal(universLabel(loisir, 'CYCLE'), 'CYCLE')
  })

  it('le filtre par acheteur garde ses segments ; « sans acheteur » ce que personne n’a', () => {
    const keepPaul = buyerFilterTest(filtreAcheteur('paul'), [loisir, multi])
    assert.equal(keepPaul('TEXTILE HOMME', 'LOISIR'), true)
    assert.equal(keepPaul('TEXTILE HOMME', 'MULTISPORT'), false)
    const sans = buyerFilterTest(FILTRE_SANS_ACHETEUR, [loisir])
    assert.equal(sans('TEXTILE HOMME', 'LOISIR'), false)
    assert.equal(sans('TEXTILE HOMME', 'MULTISPORT'), true)
    assert.equal(buyerFilterTest(FILTRE_SANS_ACHETEUR, [loisir, multi])('TEXTILE HOMME', 'MULTISPORT'), false)
  })
})

describe('magasins', () => {
  it('reconnaît le code base, le nom et les alias, sans tenir compte des accents', () => {
    assert.equal(matchMagasin('CHT 274/0'), 'cht')
    assert.equal(matchMagasin('CHÂTEAU GONTIER '), 'cht')
    assert.equal(matchMagasin('la ferte bernard'), 'lf')
    assert.equal(matchMagasin('SARAN'), null)
  })
})

describe('parseBaseSheet', () => {
  const r = parseBaseSheet(BASE, { univers: UNIVERS, matchMagasin })

  it('range les segments sous leur univers et prend la colonne Budget détail marques', () => {
    assert.deepEqual(r.base[segmentId('ACCESSOIRE TEXTILE', 'CEINTURE')], { cht: 100, lf: 30 })
    assert.deepEqual(r.base[segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES')], { cht: 50, lf: 50 })
  })

  it("un segment décalé qui porte le nom d'un univers reste un segment (RANDONNEE > BAGAGERIE)", () => {
    assert.ok(r.segments.some(s => s.univers === 'RANDONNEE' && s.nom === 'BAGAGERIE'))
    assert.ok(!r.segments.some(s => s.univers === 'BAGAGERIE'))
  })

  it("un univers sans segment garde son budget sur l'univers entier", () => {
    const id = segmentId('ALPINISME ET ESCALADE')
    assert.deepEqual(r.segments.find(s => s.id === id), { id, univers: 'ALPINISME ET ESCALADE', nom: '' })
    assert.deepEqual(r.base[id], { cht: 40, lf: 10 })
    assert.equal(r.base[segmentId('ACCESSOIRE TEXTILE')], undefined)
  })

  it('signale les magasins inconnus et ignore la ligne TOTAUX', () => {
    assert.deepEqual(r.unknownMagasins, ['XYZ 1/0'])
    assert.deepEqual(r.stats, { univers: 3, segments: 3, lignes: 10 })
  })

  it("refuse un fichier sans colonnes Univers / Magasin", () => {
    assert.ok(parseBaseSheet([['a', 'b']], { univers: UNIVERS, matchMagasin }).error)
  })
})

// Extrait de l'onglet « BUDGET PAR MARQUES » du budget AH26
const N1 = [
  ['Univers New arbo', 'Segment New arbo', 'Segment ', 'Marques ', 'CHÂTEAU GONTIER ', '', 'LA FERTE BERNARD', '', 'BUDGET TOTAL', 'COMMENTAIRES'],
  ['', '', '', '', 'BUDGET AH25', 'BUDGET AH26', 'BUDGET AH25', 'BUDGET AH26', 'AH25', ''],
  ['ACCESSOIRE TEXTILE', 'ACCESSOIRE TEXTILECHAUSSETTES', 'CHAUSSETTES', 'Budget par segment ', 5958, '', 4323, '', 50000, ''],
  ['ACCESSOIRE TEXTILE', '', 'CHAUSSETTES', 'ADIDAS', 12454, 12393, 7344, 6174, 1, 'Voir\nconditions'],
  ['ACCESSOIRE TEXTILE', '', 'CHAUSSETTES', 'PUMA ', '', 588, '', '#DIV/0!', 1, ''],
  ['', '', '', 'TOTAL', 12454, 12981, 7344, 6174, 1, ''],
  ['ALPINISME ET ESCALADE', '', 'HABILLEMENT', 'MILLET', '', 200, '', '', 1, ''],
  ['SURF', '', 'PLANCHE', 'RIP CURL', '', 100, '', '', 1, ''],
]

describe('parseN1Sheet', () => {
  it("trouve l'onglet des marques", () => {
    assert.equal(findN1Sheet(['POIDS UNIVERS', 'BUDGET PAR MARQUES ', 'POIDS MARQUE']), 'BUDGET PAR MARQUES ')
  })

  it('propose les colonnes sous les magasins reconnus', () => {
    assert.deepEqual(n1Columns(N1, matchMagasin), ['BUDGET AH25', 'BUDGET AH26'])
  })

  const r = parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH26' })

  it('lit le budget par marque et par magasin de la colonne choisie', () => {
    const adidas = r.lines.find(l => l.nom === 'ADIDAS')
    assert.deepEqual(adidas.n1, { cht: 12393, lf: 6174 })
    assert.equal(adidas.commentaire, 'Voir conditions')
    assert.equal(adidas.segId, segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES'))
  })

  it('nettoie les noms de marque et ignore les cellules vides ou en erreur', () => {
    assert.deepEqual(r.lines.find(l => l.nom === 'PUMA').n1, { cht: 588 })
  })

  it('ignore les lignes Budget par segment et TOTAL, signale les univers inconnus', () => {
    assert.deepEqual(r.lines.map(l => l.nom), ['ADIDAS', 'PUMA', 'MILLET'])
    assert.deepEqual(r.unknownUnivers, ['SURF'])
    assert.equal(r.magasins, 2)
  })

  it("refuse une colonne absente", () => {
    assert.ok(parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH30' }).error)
  })
})

// Extrait d'une commande MesAchats (« CDE ENERGETICS AH27 ») : colonne Note au milieu des magasins
const CDE_HEAD = ['Code modèle Fournisseur', 'Libellé modèle', 'Libellé Couleur', 'Univers', 'Segment', 'Famille', 'Marque', 'PAJA',
  '% Remise', 'PA net saisi', 'PV', 'Total', 'CHT 274/0', 'Note', 'LF 458/0', 'XYZ 1/0']
const cde = (ref, coul, univ, seg, marque, paja, remise, paNet, total, cht, lf, xyz = '') =>
  [ref, `MODELE ${ref}`, coul, univ, seg, 'FAM', marque, paja, remise, paNet, 19.99, total, cht, 'D:\\pas-note.png', lf, xyz]
const CDE = [CDE_HEAD,
  cde('A1', 'NOIR', 'RANDONNEE', 'BAGAGERIE', 'Energetics', 10, 0, 0, 36, 24, 12),
  cde('A1', 'BLEU', 'RANDONNEE', 'BAGAGERIE', 'ENERGETICS', 10, 0, 0, 12, '', 12),
  cde('B2', 'GRIS', 'RANDONNEE', 'BAGAGERIE', 'ENERGETICS', 10, 10, 0, 12, 12, ''), // remise 10 %
  cde('C3', 'NOIR', 'BAGAGERIE', 'BAGAGERIE', 'ENERGETICS', 5, 0, 4, 10, 6, 4, 3), // PA net saisi, univers sans segment
  cde('D4', 'NOIR', 'ACCESSOIRE TEXTILE', 'CEINTURE', 'ENERGETICS', '', 0, 0, 20, 12, 6), // sans prix, Total faux
  cde('E5', 'NOIR', 'SURF', 'SURF', 'ENERGETICS', 10, 0, 0, 12, 12, ''),
  ['', '', '', '', '', '', '', '', '', '', '', 102, 66, '', 34, 3],
]

describe('commandes fournisseur', () => {
  const r = parseCommandeSheet(CDE, { univers: UNIVERS, matchMagasin })
  const rando = r.lines.find(l => l.univers === 'RANDONNEE')

  it('regroupe par marque : pièces et montant au prix d’achat net', () => {
    assert.equal(rando.nom, 'ENERGETICS')
    assert.equal(rando.segId, segmentId('RANDONNEE', 'BAGAGERIE'))
    assert.deepEqual(rando.quantite, { cht: 36, lf: 24 })
    assert.deepEqual(rando.saisie, { cht: 24 * 10 + 12 * 9, lf: 24 * 10 }) // B2 : 10 € − 10 %
    assert.equal(rando.lignes, 3)
  })

  it('prend le PA net saisi, range un univers sans segment, ignore la colonne Note', () => {
    const bag = r.lines.find(l => l.univers === 'BAGAGERIE')
    assert.equal(bag.segId, segmentId('BAGAGERIE'))
    assert.deepEqual(bag.saisie, { cht: 24, lf: 16 })
  })

  it('signale magasins et univers inconnus, lignes sans prix et Total faux', () => {
    assert.deepEqual(r.magIds, ['cht', 'lf'])
    assert.deepEqual(r.unknownMagasins, ['XYZ 1/0'])
    assert.deepEqual(r.unknownUnivers, ['SURF'])
    assert.deepEqual(r.sansPrix, ['MODELE D4 NOIR'])
    assert.deepEqual(r.ecartsTotal, ['MODELE D4 NOIR (Total 20, magasins 18)'])
    assert.equal(r.lignes, 5)
  })

  it('refuse un fichier qui n’est pas une commande', () => {
    assert.ok(parseCommandeSheet(BASE, { univers: UNIVERS, matchMagasin }).error)
    assert.ok(parseCommandeSheet([CDE_HEAD.map(c => (c.endsWith('/0') ? 'X' : c))], { univers: UNIVERS, matchMagasin }).error)
  })

  it('additionne une même marque venue de plusieurs fichiers', () => {
    const m = mergeCommandes([r, r])
    assert.deepEqual(m.lines.find(l => l.univers === 'RANDONNEE').quantite, { cht: 72, lf: 48 })
    assert.equal(m.lignes, 10)
  })

  const segId = segmentId('RANDONNEE', 'BAGAGERIE')
  const brands = [{ id: 'en', univers: 'RANDONNEE', segId, segment: 'BAGAGERIE', nom: 'ENERGETICS' }]
  const budgetLines = [{ id: 'en', saisie: { cht: 100, lf: 50, autre: 7 }, quantite: { cht: 5 } }]
  const segments = [{ id: segId, univers: 'RANDONNEE', nom: 'BAGAGERIE' }]
  const direction = { role: 'directeurgen' }

  it('remplace la saisie dans les magasins du fichier (un magasin sans pièce est vidé)', () => {
    const one = { ...r, lines: [{ ...rando, saisie: { cht: 348 }, quantite: { cht: 36 } }] }
    const it0 = planCommande(one, { brands, segments, budgetLines, user: direction }).items[0]
    assert.equal(it0.id, 'en')
    assert.deepEqual(it0.saisie, { cht: 348, lf: null })
    assert.deepEqual(it0.quantite, { cht: 36, lf: null })
    assert.equal(it0.avant, 157)
    assert.equal(it0.apres, 355) // le magasin absent du fichier garde sa saisie
  })

  it('ou s’ajoute à la saisie existante', () => {
    const it0 = planCommande({ ...r, lines: [rando] }, { brands, segments, budgetLines, user: direction, ajouter: true }).items[0]
    assert.deepEqual(it0.saisie, { cht: 448, lf: 290 })
    assert.deepEqual(it0.quantite, { cht: 41, lf: 24 })
  })

  it('ajoute les marques et segments absents, écarte les univers de l’acheteur qui ne sont pas les siens', () => {
    const acheteur = { role: 'acheteur', univers: ['RANDONNEE', 'BAGAGERIE'] }
    const p = planCommande(r, { brands, segments, budgetLines, user: acheteur })
    assert.deepEqual(p.items.map(i => [i.identity.univers, i.nouvelle]), [['BAGAGERIE', true], ['RANDONNEE', false]])
    assert.deepEqual(p.items[0].identity, { univers: 'BAGAGERIE', segId: segmentId('BAGAGERIE'), segment: '', nom: 'ENERGETICS' })
    assert.deepEqual(p.horsDroits, ['ACCESSOIRE TEXTILE › CEINTURE'])
    assert.deepEqual(p.newSegments.map(s => s.id), [segmentId('BAGAGERIE')])
  })
})

describe('commandes : déclinaisons de marque', () => {
  const seg = segmentId('TRAINING', 'HABILLEMENT')
  const b = (id, nom) => ({ id, univers: 'TRAINING', segId: seg, segment: 'HABILLEMENT', nom })
  const variantes = [b('f', 'ENERGETICS FEMME'), b('h', 'ENERGETICS HOMME'), b('fi', 'ENERGETICS FILLE'), b('n', 'NIKE Q3'), b('n4', 'NIKE Q4'),
    b('p', 'PUMA'), b('pt', 'PUMA OP TOP'), b('x', 'ENERGETICS-X')]
  const l = (nom, contexte) => ({ nom, contexte })

  it('choisit la déclinaison qui correspond à la famille ou au nom du fichier', () => {
    assert.equal(cibleCommande(l('ENERGETICS', 'FEMME COLLANT GAMME 0 CDE ENERGETICS AH27'), variantes), 'f')
    assert.equal(cibleCommande(l('ENERGETICS', 'FILLE SHORT'), variantes), 'fi')
    assert.equal(cibleCommande(l('NIKE', 'HOMME SHORT CDE NIKE Q3 AH27'), variantes), 'n')
  })

  it('sinon la marque seule, sinon à choisir, sinon une nouvelle marque', () => {
    assert.equal(cibleCommande(l('PUMA', 'HOMME SHORT'), variantes), 'p')
    assert.equal(cibleCommande(l('PUMA', 'OP TOP HOMME'), variantes), 'pt')
    assert.equal(cibleCommande(l('ENERGETICS', 'GARCON SHORT'), variantes), '')
    assert.equal(cibleCommande(l('NIKE', 'HOMME'), variantes), '')
    assert.equal(cibleCommande(l('ADIDAS', 'HOMME'), variantes), CIBLE_NOUVELLE)
  })

  const HEAD = ['Libellé modèle', 'Libellé Couleur', 'Univers', 'Segment', 'Famille', 'SousFamille', 'Marque', 'Gamme', 'PAJA', 'Total', 'CHT 274/0', 'LF 458/0']
  const row = (mod, fam, cht, lf) => [mod, 'NOIR', 'RANDONNEE', 'HABILLEMENT', fam, 'SHORT', 'ENERGETICS', 'Gamme 0', 10, cht + lf, cht, lf]
  const cde = parseCommandeSheet([HEAD, row('A', 'FEMME', 12, 0), row('B', 'FEMME', 6, 6), row('C', 'HOMME', 0, 24), row('D', 'GARCON', 12, 0)],
    { univers: UNIVERS, matchMagasin, fichier: 'CDE ENERGETICS AH27' })
  const segR = segmentId('RANDONNEE', 'HABILLEMENT')
  const br = (id, nom) => ({ id, univers: 'RANDONNEE', segId: segR, segment: 'HABILLEMENT', nom })
  const brands = [br('f', 'ENERGETICS FEMME'), br('h', 'ENERGETICS HOMME')]
  const opts = { brands, segments: [{ id: segR }], budgetLines: [], user: { role: 'directeurgen' } }

  it('sépare le fichier par famille et répartit sur les déclinaisons', () => {
    assert.deepEqual(cde.lines.map(x => [x.famille, x.contexte]), [
      ['FEMME', 'FEMME SHORT GAMME 0 CDE ENERGETICS AH27'], ['HOMME', 'HOMME SHORT GAMME 0 CDE ENERGETICS AH27'], ['GARCON', 'GARCON SHORT GAMME 0 CDE ENERGETICS AH27'],
    ])
    const p = planCommande(cde, opts)
    assert.deepEqual(p.rows.map(r => [r.familles.join(), r.cible, r.pieces]), [['FEMME', 'f', 24], ['GARCON', '', 12], ['HOMME', 'h', 24]])
    assert.equal(p.aChoisir, 1)
    assert.deepEqual(p.items.map(i => [i.id, i.quantite]), [['f', { cht: 18, lf: 6 }], ['h', { cht: null, lf: 24 }]])
  })

  it('applique le choix de l’utilisateur (une ligne existante, une nouvelle marque ou rien)', () => {
    const garcon = planCommande(cde, opts).rows.find(r => r.familles[0] === 'GARCON').key
    const vers = cible => planCommande(cde, { ...opts, choix: { [garcon]: cible } })
    assert.deepEqual(vers('h').items.find(i => i.id === 'h').quantite, { cht: 12, lf: 24 })
    assert.equal(vers('h').aChoisir, 0)
    assert.deepEqual(vers(CIBLE_NOUVELLE).items.find(i => i.nouvelle).identity.nom, 'ENERGETICS')
    assert.equal(vers(CIBLE_IGNORER).items.length, 2)
  })
})

describe('commandes MORE (Bestseller)', () => {
  const HEAD = ['Marque', 'Sous-marque', 'Style numéro', 'Nom du style', 'Catégorie', 'Sous-catégorie', 'Nom de la couleur', 'Taille', 'Genre',
    'Style NOOS', 'Quantité', 'WSP', 'Prix net unitaire', 'ID du compte', 'Nom du compte', 'Total commande line prix', 'Total unit prix']
  const row = (taille, q, genre = 'Homme', noos = 'Noos', compte = 'Intersport / Franck III sarl') =>
    ['Jack & Jones', 'JACK&JONES PREMIUM', '12136668', 'JPRPAULOS SS POLO NOOS', 'T-Shirts et tops', 'Polos', 'Navy Blazer', taille, genre, noos, q, 10.71, 10.65, '335213', compte, '127.87', String(q * 10.65)]
  const mags = magasinMatcher([...MAGASINS, { id: 'sar', nom: 'SARAN', code: 'SAR 650/0', alias: ['INTERSPORT / FRANCK III SARL'] }])
  const rows = [HEAD, row('M', 3), row('L', 3), row('XL', 2, 'Femme', '')]

  it('reconnaît le magasin par le nom du compte, additionne les tailles au prix net (pas le total de groupe répété)', () => {
    const r = parseMoreSheet(rows, { matchMagasin: mags, fichier: 'Order_53896835' })
    assert.deepEqual(r.magIds, ['sar'])
    const homme = r.lines.find(l => l.genre === 'Homme')
    assert.deepEqual(homme.quantite, { sar: 6 })
    assert.deepEqual(homme.saisie, { sar: 63.9 })
    assert.equal(homme.segId, null)
    assert.equal(r.lines.length, 2)
  })

  it('demande le magasin si le compte n’est reconnu nulle part', () => {
    const r = parseMoreSheet([HEAD, row('M', 1, 'Homme', 'Noos', 'Autre sarl')], { matchMagasin: mags })
    assert.deepEqual(r.magasinManquant, { id: '335213', nom: 'Autre sarl' })
    assert.deepEqual(parseMoreSheet([HEAD, row('M', 1, 'Homme', 'Noos', 'Autre sarl')], { matchMagasin: mags, magasinId: 'cht' }).magIds, ['cht'])
    assert.ok(parseMoreSheet(CDE, { matchMagasin: mags }).error)
  })

  it('trouve la ligne de budget par la marque, le genre et NOOS ; sinon à choisir', () => {
    const seg = (u, s2) => ({ univers: u, segId: segmentId(u, s2), segment: s2 })
    const brands = [
      { id: 'noos', nom: 'JACK & JONES noos', ...seg('TEXTILE HOMME', 'LOISIR') },
      { id: 'bas', nom: 'JACK & JONES NOOS BAS', ...seg('TEXTILE HOMME', 'LOISIR') },
      { id: 'col', nom: 'JACK & JONES COL', ...seg('TEXTILE HOMME', 'LOISIR') },
      { id: 'jr', nom: 'JACK & JONES', ...seg('TEXTILE GARCON JUNIOR', 'LOISIR') },
      { id: 'f1', nom: 'JACK & JONES', ...seg('TEXTILE FEMME', 'LOISIR') },
      { id: 'f2', nom: 'JACK & JONES', ...seg('TEXTILE FEMME', 'MULTISPORT') },
    ]
    const cde = parseMoreSheet(rows, { matchMagasin: mags, fichier: 'Order_53896835' })
    const p = planCommande(cde, { brands, segments: [], budgetLines: [], user: { role: 'directeurgen' } })
    const homme = p.rows.find(r => r.familles[0].startsWith('Homme'))
    assert.equal(homme.cible, 'noos')
    assert.equal(homme.univers, 'TEXTILE HOMME')
    const femme = p.rows.find(r => r.familles[0].startsWith('Femme'))
    assert.equal(femme.cible, '') // deux segments possibles
    assert.deepEqual(femme.options.map(b => b.id), ['f1', 'f2'])
    assert.equal(p.aChoisir, 1)
    assert.deepEqual(p.items.map(i => [i.id, i.quantite]), [['noos', { sar: 6 }]])
    assert.deepEqual(planCommande(cde, { brands: [], segments: [], budgetLines: [], user: { role: 'directeurgen' } }).absentes, ['JACK & JONES'])
  })
})

describe('historique : saisie reprise du N-1 du budget suivant', () => {
  it('le N-1 de AH27 devient la saisie de AH26, même marque, segments dans l’ordre de AH27', () => {
    const lines = [
      { id: 'm1', univers: 'U', segId: 's2', segment: 'B', nom: 'NIKE', n1: { cht: 100 }, quantiteN1: { cht: 4 }, commentaireN1: 'ok', saisie: { cht: 999 } },
      { id: 'm2', univers: 'U', segId: 's1', segment: 'A', nom: 'PUMA', n1: { lf: 50 } },
      { id: 'm3', univers: 'U', segId: 's3', segment: 'C', nom: 'VIDE', saisie: { cht: 5 } }, // pas de N-1 : pas reprise
      { id: 'm4', univers: 'V', segId: 's9', segment: '', nom: 'ASICS', n1: { cht: 10 } }, // segment absent du budget suivant
    ]
    const r = saisieFromNextN1(lines, [{ id: 's1', univers: 'U', nom: 'A' }, { id: 's2', univers: 'U', nom: 'B' }, { id: 's3', univers: 'U', nom: 'C' }])
    assert.deepEqual(r.lines.map(l => [l.id, l.saisie, l.quantite, l.commentaire]),
      [['m1', { cht: 100 }, { cht: 4 }, 'ok'], ['m2', { lf: 50 }, {}, ''], ['m4', { cht: 10 }, {}, '']])
    assert.deepEqual(r.segments.map(sg => sg.id), ['s1', 's2', 's9'])
  })
})

describe('planN1Import', () => {
  const base = parseBaseSheet(BASE, { univers: UNIVERS, matchMagasin })
  const { lines } = parseN1Sheet(N1, { univers: UNIVERS, matchMagasin, column: 'BUDGET AH26' })
  const brands = [{ id: 'x', segId: segmentId('ACCESSOIRE TEXTILE', 'CHAUSSETTES'), nom: 'adidas' }]
  const plan = planN1Import(lines, brands, base.segments)

  it('rattache les marques de la liste et ajoute les autres à la liste', () => {
    assert.deepEqual(plan.matched.map(m => [m.id, m.line.nom]), [['x', 'ADIDAS']])
    assert.deepEqual(plan.missing.map(l => l.nom), ['PUMA', 'MILLET'])
  })

  it('ajoute les segments absents de la base', () => {
    assert.deepEqual(plan.newSegments, [{ id: segmentId('ALPINISME ET ESCALADE', 'HABILLEMENT'), univers: 'ALPINISME ET ESCALADE', nom: 'HABILLEMENT' }])
  })

  it('reprend la saisie du budget précédent comme N-1, sur la même marque', () => {
    const l = linesFromBudget([{ id: 'm1', segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', saisie: { cht: 10 }, quantite: { cht: 4 }, commentaire: 'ok' }])
    assert.deepEqual(l, [{ id: 'm1', segId: 's', univers: 'U', segment: 'S', nom: 'NIKE', n1: { cht: 10 }, quantiteN1: { cht: 4 }, commentaire: 'ok' }])
  })
})

describe('marques des segments', () => {
  const brands = [
    { id: 'b', segId: 's1', univers: 'U', nom: 'PUMA' },
    { id: 'a', segId: 's1', univers: 'U', nom: 'ADIDAS' },
    { id: 'c', segId: 's2', univers: 'U', nom: 'NIKE' },
  ]
  const lines = [
    { id: 'a', segId: 's1', saisie: { cht: 5 } },
    { id: 'old', segId: 's1', nom: 'LEVIS', n1: { cht: 3 } },
    { id: 'vide', segId: 's1', nom: 'KAPPA', saisie: {} },
  ]
  const bySeg = brandsBySegment(brands, lines)

  it('liste les marques du segment, triées, avec leur ligne du budget', () => {
    assert.deepEqual(bySeg.get('s1').map(b => [b.nom, b.orphan]), [['ADIDAS', false], ['LEVIS', true], ['PUMA', false]])
    assert.deepEqual(bySeg.get('s1')[0].line.saisie, { cht: 5 })
    assert.equal(bySeg.get('s1')[2].line, null)
  })

  it('garde une marque retirée de la liste tant que le budget a des montants pour elle', () => {
    assert.ok(!bySeg.get('s1').some(b => b.id === 'vide'))
  })

  it('rassemble les segments de tous les budgets', () => {
    const cat = segmentsCatalog([{ segments: [{ id: 'x' }, { id: 'y' }] }, { segments: [{ id: 'y' }, { id: 'z' }] }])
    assert.deepEqual(cat.map(s => s.id), ['x', 'y', 'z'])
  })
})

describe('segments et totaux', () => {
  it('garde les segments du N-1 absents de la nouvelle base', () => {
    const merged = mergeSegments([{ id: 'a' }, { id: 'n1' }], [{ id: 'b' }, { id: 'a' }])
    assert.deepEqual(merged.map(s => s.id), ['b', 'a', 'n1'])
  })

  it("trie par ordre des univers, l'univers entier en premier", () => {
    const segs = [
      { id: '1', univers: 'RANDONNEE', nom: 'X' },
      { id: '2', univers: 'ALPINISME ET ESCALADE', nom: 'HABILLEMENT' },
      { id: '3', univers: 'ALPINISME ET ESCALADE', nom: '' },
      { id: '4', univers: 'INCONNU', nom: '' },
    ]
    assert.deepEqual(sortSegments(segs, UNIVERS).map(s => s.id), ['3', '2', '1', '4'])
  })

  it('additionne base, N-1 et saisie par segment et magasin', () => {
    const t = computeTotals([{ id: 's' }], { s: { cht: 100 } }, [
      { segId: 's', n1: { cht: 30 }, saisie: { cht: 40, lf: 5 } },
      { segId: 's', n1: { cht: 20 }, saisie: { cht: 10 } },
    ])
    assert.deepEqual(t.s.cht, { base: 100, groupe: 0, adapte: 0, n1: 50, saisie: 50, engage: 0, qte: 0, qteN1: 0 })
    assert.deepEqual(addTotals([t.s.cht, t.s.lf]), { base: 100, groupe: 0, adapte: 0, n1: 50, saisie: 55, engage: 0, qte: 0, qteN1: 0 })
  })
  it('additionne les quantités et la part engagée de la saisie', () => {
    const t = computeTotals([{ id: 's' }], {}, [
      { segId: 's', saisie: { cht: 40, lf: 5 }, quantite: { cht: 8 }, quantiteN1: { cht: 6 }, engage: true },
      { segId: 's', saisie: { cht: 10 }, quantite: { cht: 2 }, engage: false },
    ])
    assert.deepEqual(t.s.cht, { base: 0, groupe: 0, adapte: 0, n1: 0, saisie: 50, engage: 40, qte: 10, qteN1: 6 })
    // Une marque engagée l'est pour tous les magasins
    assert.equal(t.s.lf.engage, 5)
  })
  it('répartit le budget groupe au prorata de la base, sans toucher à la base', () => {
    const t = computeTotals([{ id: 's' }, { id: 'u' }], { s: { cht: 300 }, u: { cht: 100, lf: 600 } }, [], 1.1)
    assert.deepEqual(t.s.cht, { base: 300, groupe: 330, adapte: 0, n1: 0, saisie: 0, engage: 0, qte: 0, qteN1: 0 })
    assert.equal(Math.round(addTotals([t.s.cht, t.u.cht, t.u.lf]).groupe), 1100)
  })
})

describe('budget groupe', () => {
  it('se fixe en montant ou en % du N-1 total', () => {
    assert.equal(groupeTotal({ mode: 'montant', montant: 950000 }, 1000000), 950000)
    assert.equal(groupeTotal({ mode: 'pct', pct: -3 }, 1000000), 970000)
    assert.equal(groupeTotal({ mode: 'pct', pct: 5 }, 0), null)
    assert.equal(groupeTotal(null, 1000000), null)
  })
  it('donne le coefficient appliqué à la base et le reste à répartir', () => {
    assert.equal(groupeRatio(970000, 800000), 1.2125)
    assert.equal(groupeRatio(970000, 0), null)
    assert.equal(groupeRatio(null, 800000), null)
    const cell = { base: 100, groupe: 120, saisie: 0 }
    assert.equal(objectif(cell, true), 120)
    assert.equal(objectif(cell, false), 100)
  })
  it('affiche les évolutions en %', () => {
    assert.equal(evolution(970000, 1000000).toFixed(1), '-3.0')
    assert.equal(evolution(5, 0), null)
    assert.equal(formatPct(-3), '−3 %')
    assert.equal(formatPct(2.46), '+2,5 %')
    assert.equal(formatPct(null), '—')
  })
})

describe('notation des marques et budget adapté', () => {
  const notes = n => ({ reassort: n, conditions: n, service: n })
  const seg = { id: 'run', univers: 'RUNNING', nom: '' }
  const totals = { run: { m: { base: 90000, groupe: 100000 } } }
  const marque = (id, nom, n1) => ({ id, nom, segId: 'run', line: { n1: { m: n1 } } })
  const run = (fiches, brands = [marque('nike', 'NIKE', 60), marque('asics', 'ASICS', 40)]) => computeAdapte({
    segments: [seg], totals, brandsBySeg: new Map([['run', brands]]), magIds: ['m'],
    fiche: k => fiches[k], reglages: null, hasGroupe: true,
  })

  it('calcule la note pondérée et le coefficient', () => {
    assert.equal(noteMarque({ reassort: 8, conditions: 6, service: 10 }), 8)
    assert.equal(noteMarque({ reassort: 8, conditions: 4 }, { reassort: 3, conditions: 1, service: 1 }), 7)
    assert.equal(noteMarque({}), null)
    assert.equal(coefMarque(10), 1.2)
    assert.equal(coefMarque(0), 0.8)
    assert.equal(coefMarque(null), 1)
    assert.equal(fournisseurKey('Le Coq Sportif'), 'LE-COQ-SPORTIF')
  })
  it("reprend l'exemple validé : note, recalage puis demande", () => {
    const r = run({ NIKE: { notes: notes(8), demande: 70000 }, ASICS: { notes: notes(4) } })
    assert.equal(Math.round(r.byBrand.get('nike').m), 68727)
    assert.equal(Math.round(r.byBrand.get('asics').m), 31273)
    assert.equal(Math.round(r.cells.run.m), 100000)
    assert.equal(Math.round(r.marques.get('NIKE').avant), 63636)
  })
  it('sans note ni demande : la part du N-1', () => {
    const r = run({})
    assert.equal(r.byBrand.get('nike').m, 60000)
    assert.equal(r.byBrand.get('asics').m, 40000)
  })
  it("une marque nouvelle part de 0 et prend sa demande sur l'enveloppe, à hauteur de sa note", () => {
    const r = run({ ON: { demande: 10000 } }, [marque('nike', 'NIKE', 60), marque('asics', 'ASICS', 40), marque('on', 'ON', 0)])
    assert.equal(Math.round(r.byBrand.get('on').m), 5000)
    assert.equal(Math.round(r.cells.run.m), 100000)
  })
  it("une marque retirée de la liste n'a pas de budget adapté", () => {
    const r = run({}, [marque('nike', 'NIKE', 60), { ...marque('puma', 'PUMA', 40), orphan: true }])
    assert.equal(r.byBrand.get('nike').m, 100000)
    assert.equal(r.byBrand.get('puma'), undefined)
  })
  it('une demande déjà couverte ne change rien', () => {
    const r = run({ NIKE: { demande: 50000 } })
    assert.equal(r.byBrand.get('nike').m, 60000)
  })
  it('regroupe les déclinaisons sous leur fournisseur', () => {
    const noms = ['ADIDAS', 'ADIDAS FEMME', 'ADIDAS OFFRE TERRAIN', 'ADIDAS OFFRE TERRAIN KIDS', 'NIKE Q3', 'NIKE Q4', 'ON', 'ONE WAY']
    const f = fournisseurResolver(noms, { 'NIKE-Q4': 'NIKE', 'NIKE-Q3': 'nike', 'ADIDAS-FEMME': '' })
    assert.equal(f('ADIDAS OFFRE TERRAIN KIDS').nom, 'ADIDAS')
    assert.equal(f('ADIDAS').key, 'ADIDAS')
    assert.equal(f('ADIDAS FEMME').nom, 'ADIDAS FEMME') // séparée à la main
    assert.equal(f('NIKE Q3').key, 'NIKE')
    assert.equal(f('NIKE Q4').nom, 'NIKE')
    assert.equal(f('ONE WAY').nom, 'ONE WAY')
    assert.equal(f('ADIDAS OFFRE TERRAIN').auto, 'ADIDAS')
  })
  it('les déclinaisons partagent la note et la demande du fournisseur', () => {
    const brands = [marque('a', 'ADIDAS', 50), marque('af', 'ADIDAS FEMME', 10), marque('p', 'PUMA', 40)]
    const r = computeAdapte({
      segments: [seg], totals, brandsBySeg: new Map([['run', brands]]), magIds: ['m'], reglages: null, hasGroupe: true,
      fiche: k => ({ ADIDAS: { notes: notes(10), demande: 80000 } })[k], fournisseur: fournisseurResolver(brands.map(b => b.nom)),
    })
    const adidas = r.marques.get('ADIDAS')
    assert.equal(adidas.coef, 1.2)
    assert.equal(r.marques.has('ADIDAS-FEMME'), false)
    assert.equal(Math.round(adidas.total), Math.round(r.byBrand.get('a').m + r.byBrand.get('af').m))
    assert.ok(adidas.total > adidas.avant)
  })
  it('range les budgets dans le temps', () => {
    assert.ok(budgetRank({ saison: 'PE', annee: 2027 }) < budgetRank({ saison: 'AH', annee: 2027 }))
    assert.ok(budgetRank({ saison: 'AH', annee: 2026 }) < budgetRank({ saison: 'PE', annee: 2027 }))
  })
  it('ajoute le budget adapté aux totaux', () => {
    const t = withAdapte({ run: { m: { base: 1, groupe: 2 } } }, { run: { m: 3 } })
    assert.deepEqual(t.run.m, { base: 1, groupe: 2, adapte: 3 })
  })
})
