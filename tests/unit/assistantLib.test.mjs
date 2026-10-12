import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NE_SAIT_PAS, construireRequete, decouper, estSansReponse, grouperParDocument, historiqueValide, motsCles,
  nettoyerTexte, peutUtiliserAssistant, reponseSimulee, sourcesCitees, tableauEnTexte, texteXmlOffice, vecteurLocal,
} from '../../functions/assistantLib.js'

const cosinus = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

describe('accès à l’assistant', () => {
  it('rayon vélo et administrateur seulement, comptes actifs', () => {
    assert.equal(peutUtiliserAssistant({ role: 'velo' }), true)
    assert.equal(peutUtiliserAssistant({ role: 'admin' }), true)
    assert.equal(peutUtiliserAssistant({ role: 'chaussure' }), false)
    assert.equal(peutUtiliserAssistant({ role: 'directeurgen' }), false)
    assert.equal(peutUtiliserAssistant({ role: 'velo', isActive: false }), false)
    assert.equal(peutUtiliserAssistant(null), false)
  })
})

describe('découpage des procédures', () => {
  it('nettoie les échappements et les espaces du texte extrait', () => {
    assert.equal(nettoyerTexte('\\>\\>PRIX ENGAGE :\r\n\n\n\nPrix   conseillé \\[1\\]'), '>>PRIX ENGAGE :\n\nPrix conseillé [1]')
  })
  it('un texte court donne un seul passage', () => {
    assert.deepEqual(decouper('Étape 1 : créer la fiche.\nÉtape 2 : appeler le client.'), ['Étape 1 : créer la fiche.\nÉtape 2 : appeler le client.'])
    assert.deepEqual(decouper('   '), [])
  })
  it('un long texte est coupé aux paragraphes, avec reprise de la fin du passage précédent', () => {
    const paragraphes = Array.from({ length: 30 }, (_, i) => `Paragraphe ${i} : ${'mot '.repeat(25)}fin${i}.`)
    const passages = decouper(paragraphes.join('\n'), { taille: 600, recouvrement: 100 })
    assert.ok(passages.length > 3)
    assert.ok(passages.every(p => p.length <= 700))
    // Rien ne se perd, et chaque passage reprend le bout du précédent
    for (let i = 0; i < 30; i++) assert.ok(passages.some(p => p.includes(`fin${i}.`)), `fin${i}`)
    assert.ok(passages[1].startsWith(passages[0].slice(-40).split(' ').slice(1).join(' ').slice(0, 10)))
  })
  it('un paragraphe énorme sans retour à la ligne est quand même coupé', () => {
    const passages = decouper('Phrase longue. '.repeat(400), { taille: 1000, recouvrement: 100 })
    assert.ok(passages.length >= 5)
    assert.ok(passages.every(p => p.length <= 1100))
  })
})

describe('recherche simulée (émulateur)', () => {
  it('mots utiles sans accents ni mots vides', () => {
    assert.deepEqual(motsCles('Comment faire un transfert de vélo entre magasins ?'), ['transfert', 'velo', 'magasins'])
  })
  it('une question est plus proche de la procédure qui en parle', () => {
    const transfert = vecteurLocal('Transfert d’un vélo entre deux magasins du groupe : délai, acompte, carton')
    const pret = vecteurLocal('Vélo de prêt pendant la réparation : caution, pièce d’identité, fiche signée')
    const q = vecteurLocal('Comment je fais un transfert de vélo vers un autre magasin ?')
    assert.equal(transfert.length, 768)
    assert.ok(cosinus(q, transfert) > cosinus(q, pret))
    assert.ok(Math.abs(cosinus(q, q) - 1) < 1e-9)
  })
})

describe('réponse de Gemini', () => {
  const passages = [
    { fileId: 'a', titre: 'Transferts', url: 'https://drive/a', texte: 'Délai 7 jours.' },
    { fileId: 'b', titre: 'Vélos de prêt', url: null, texte: 'Caution 100 €.' },
    { fileId: 'a', titre: 'Transferts', url: 'https://drive/a', texte: 'Acompte obligatoire.' },
  ]
  it('passages regroupés et numérotés par document', () => {
    const docs = grouperParDocument(passages)
    assert.deepEqual(docs.map(d => [d.n, d.titre, d.extraits.length]), [[1, 'Transferts', 2], [2, 'Vélos de prêt', 1]])
    assert.equal(grouperParDocument(passages, 1).length, 1)
  })
  it('requête : consigne, extraits numérotés, échanges précédents puis question', () => {
    const docs = grouperParDocument(passages)
    const r = construireRequete({ question: 'Et le délai ?', documents: docs, historique: [
      { role: 'user', texte: 'Comment faire un transfert ?' }, { role: 'assistant', texte: 'Avec un acompte [1].' }] })
    assert.match(r.systemInstruction.parts[0].text, /UNIQUEMENT sur les extraits/)
    assert.deepEqual(r.contents.map(c => c.role), ['user', 'model', 'user'])
    const dernier = r.contents.at(-1).parts[0].text
    assert.match(dernier, /\[1\] Transferts\nDélai 7 jours\.\n…\nAcompte obligatoire\./)
    assert.match(dernier, /Question du vendeur : Et le délai \?$/)
  })
  it('sources : seulement les documents cités', () => {
    const docs = grouperParDocument(passages)
    assert.deepEqual(sourcesCitees('Il faut un acompte [1].', docs), [{ n: 1, titre: 'Transferts', url: 'https://drive/a' }])
    assert.deepEqual(sourcesCitees(NE_SAIT_PAS, docs), [])
  })
  it('réponse « je ne sais pas » ou hors sujet repérée', () => {
    assert.equal(estSansReponse(NE_SAIT_PAS), true)
    assert.equal(estSansReponse('Je ne traite que les questions sur les procédures du rayon cycle.'), true)
    assert.equal(estSansReponse('Il faut un acompte [1].'), false)
  })
  it('réponse simulée : documents trouvés, cités', () => {
    const r = reponseSimulee(grouperParDocument(passages))
    assert.match(r, /\*\*Transferts\*\* \[1\]/)
    assert.equal(reponseSimulee([]), NE_SAIT_PAS)
  })
  it('historique nettoyé et borné', () => {
    const h = historiqueValide([{ role: 'user', texte: 'a' }, { role: 'system', texte: 'x' }, { role: 'assistant', texte: ' ' },
      ...Array.from({ length: 6 }, (_, i) => ({ role: 'user', texte: `q${i}${'x'.repeat(2000)}` }))])
    assert.equal(h.length, 4)
    assert.ok(h.every(x => x.texte.length === 1500 && x.role === 'user'))
    assert.deepEqual(historiqueValide('pas un tableau'), [])
  })
})

describe('fichiers bureautiques', () => {
  it('Word : un paragraphe par ligne, entités décodées', () => {
    const xml = '<w:body><w:p><w:r><w:t xml:space="preserve">L&apos;assurance </w:t></w:r><w:r><w:t>vol</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>U &amp; chaîne</w:t><w:tab/><w:t>&#233;t&#xE9;</w:t></w:r></w:p><w:tbl/></w:body>'
    assert.equal(texteXmlOffice(xml, 'w'), 'L\'assurance vol\nU & chaîne été')
  })
  it('PowerPoint : texte des diapositives (préfixe a)', () => {
    assert.equal(texteXmlOffice('<a:p><a:r><a:t>Étape 1</a:t></a:r></a:p><a:p><a:r><a:t>Facture</a:t></a:r></a:p>', 'a'), 'Étape 1\nFacture')
    assert.equal(texteXmlOffice('', 'a'), '')
  })
  it('tableau : titre, puis une ligne par phrase avec le nom des colonnes', () => {
    const { texte } = tableauEnTexte([{ nom: 'Tarifs', lignes: [
      ['Tarifs atelier', '', ''], ['', '', ''], ['Prestation', 'Prix TTC', 'Durée'],
      ['Chambre à air', '12 €', '15 min'], ['Révision VAE', '75 €', ''],
    ] }])
    assert.equal(texte, 'Tarifs atelier\nPrestation : Chambre à air · Prix TTC : 12 € · Durée : 15 min\nPrestation : Révision VAE · Prix TTC : 75 €')
  })
  it('plusieurs onglets nommés ; tableau sans en-tête lu tel quel', () => {
    const { texte } = tableauEnTexte([{ nom: 'A', lignes: [['x', 'y'], ['1', '2']] }, { nom: 'B', lignes: [['seul'], ['autre']] }])
    assert.equal(texte, 'Onglet « A »\nx : 1 · y : 2\n\nOnglet « B »\nseul\nautre')
  })
  it('tableau trop grand ignoré', () => {
    const r = tableauEnTexte([{ nom: 'C', lignes: Array.from({ length: 30 }, (_, i) => ['r', i]) }], { maxLignes: 20 })
    assert.match(r.ignore, /30 lignes/)
  })
})
