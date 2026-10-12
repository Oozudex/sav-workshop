// Assistant vélo, côté appli (tests/unit/assistant.test.mjs) : qui voit la bulle, mise en forme
// des réponses (gras, listes, numéros de sources), coût estimé pour l'administrateur.

// Rayon vélo, et l'administrateur (dans l'appli, son rôle devient « directeurgen » avec isAdmin)
export function peutVoirAssistant(profile) {
  return !!profile && profile.isActive !== false && (profile.role === 'velo' || !!profile.isAdmin)
}

export const SUGGESTIONS = [
  'Comment faire un transfert de vélo vers un autre magasin ?',
  'Un client veut rendre son vélo, qu’est-ce que je vérifie ?',
  'Que comprend le pack service ?',
]

// « **gras** », « *italique* » et « [2] » (source) dans une ligne
export function segments(ligne) {
  const out = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[(\d{1,2})\]/g
  let fin = 0, m
  while ((m = re.exec(ligne))) {
    if (m.index > fin) out.push({ type: 'texte', valeur: ligne.slice(fin, m.index) })
    if (m[1] != null) out.push({ type: 'gras', valeur: m[1] })
    else if (m[2] != null) out.push({ type: 'italique', valeur: m[2] })
    else out.push({ type: 'source', n: Number(m[3]) })
    fin = re.lastIndex
  }
  if (fin < ligne.length) out.push({ type: 'texte', valeur: ligne.slice(fin) })
  return out
}

/** Texte de la réponse → blocs : paragraphes, listes à puces, listes numérotées. */
export function blocs(texte) {
  const out = []
  for (const brut of String(texte ?? '').split('\n')) {
    const ligne = brut.trim()
    if (!ligne) { out.push(null); continue }
    const puce = ligne.match(/^[-•*]\s+(.*)$/)
    const numero = ligne.match(/^(\d{1,2})[.)]\s+(.*)$/)
    const type = puce ? 'puces' : numero ? 'numeros' : 'paragraphe'
    const contenu = puce ? puce[1] : numero ? numero[2] : ligne
    const dernier = out.at(-1)
    if (type !== 'paragraphe' && dernier?.type === type) dernier.elements.push(segments(contenu))
    else if (type === 'paragraphe') out.push({ type, segments: segments(contenu) })
    else out.push({ type, debut: numero ? Number(numero[1]) : undefined, elements: [segments(contenu)] })
  }
  return out.filter(Boolean)
}

// Coût indicatif en euros (Gemini Flash-Lite : 0,30 $ / 2,50 $ le million de jetons en entrée / sortie)
export function coutEstime(questions, dollarEnEuro = 0.92) {
  const usd = questions.reduce((s, q) => s + (q.jetons?.entree || 0) * 0.30e-6 + (q.jetons?.sortie || 0) * 2.5e-6, 0)
  return usd * dollarEnEuro
}
