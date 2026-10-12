// Fonctions pures de l'assistant vélo (tests/unit/assistantLib.test.mjs) : droits, découpage des
// procédures en passages, vecteurs simulés de l'émulateur, consigne envoyée à Gemini, sources citées.

// Comptes qui voient la bulle : rayon vélo, et l'administrateur (tests, suivi)
export const ASSISTANT_ROLES = ['velo', 'admin']
export const QUESTIONS_PAR_JOUR = 15
export const QUESTION_MAX = 500
export const DIMENSIONS = 768

// Réponse imposée quand les procédures ne disent rien : repérée pour l'onglet « sans réponse »
export const NE_SAIT_PAS = 'Je ne trouve pas cette information dans les procédures. Demande à l’administrateur.'

export function peutUtiliserAssistant(profil) {
  return !!profil && profil.isActive !== false && ASSISTANT_ROLES.includes(profil.role)
}

// AAAA-MM-JJ, heure de Paris
export function jourParis(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
}

// Texte extrait d'un PDF ou d'un document : échappements markdown retirés, espaces resserrés
export function nettoyerTexte(t) {
  return String(t ?? '')
    .replace(/\\([\\>[\]*!#_\-.()`|])/g, '$1')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Coupe un bloc trop long en morceaux d'au plus `taille` caractères, de préférence en fin de phrase
function couperLong(bloc, taille) {
  const out = []
  let reste = bloc
  while (reste.length > taille) {
    const fenetre = reste.slice(0, taille)
    const fin = Math.max(fenetre.lastIndexOf('. '), fenetre.lastIndexOf('\n'), fenetre.lastIndexOf(' '))
    const cut = fin > taille * 0.5 ? fin + 1 : taille
    out.push(reste.slice(0, cut).trim())
    reste = reste.slice(cut).trim()
  }
  if (reste) out.push(reste)
  return out
}

// Fin d'un passage reprise au début du suivant (une idée coupée en deux reste trouvable)
function queue(texte, n) {
  if (texte.length <= n) return texte
  const t = texte.slice(-n)
  const espace = t.indexOf(' ')
  return espace > 0 ? t.slice(espace + 1) : t
}

/**
 * Découpe un document en passages d'environ `taille` caractères, aux paragraphes,
 * avec `recouvrement` caractères repris du passage précédent.
 */
export function decouper(texte, { taille = 1500, recouvrement = 200 } = {}) {
  const propre = nettoyerTexte(texte)
  if (!propre) return []
  const blocs = propre.split(/\n+/).flatMap(b => couperLong(b, taille - recouvrement))
  const passages = []
  let courant = ''
  for (const bloc of blocs) {
    if (courant && courant.length + bloc.length + 1 > taille) {
      passages.push(courant)
      courant = `${queue(courant, recouvrement)}\n${bloc}`
    } else {
      courant = courant ? `${courant}\n${bloc}` : bloc
    }
  }
  if (courant) passages.push(courant)
  return passages
}

const MOTS_VIDES = new Set(('les des une est pas pour par sur dans que qui quoi avec son ses sont aux leur plus mais '
  + 'comment faire fait peut peux dois doit quel quelle quels quelles ont avez vous nous elle ils cette ces tout '
  + 'tous etre avoir faut entre sans sous').split(' '))

// Mots utiles d'un texte : minuscules, sans accents, 3 lettres et plus, hors mots vides
export function motsCles(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(m => m.length >= 3 && !MOTS_VIDES.has(m))
}

function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h
}

/**
 * Vecteur simulé (émulateur, sans appel payant) : sac de mots haché sur `dims` cases, normé.
 * Deux textes qui partagent des mots ont des vecteurs proches : la recherche locale reste parlante.
 */
export function vecteurLocal(texte, dims = DIMENSIONS) {
  const v = new Array(dims).fill(0)
  for (const mot of motsCles(texte)) {
    // Le mot entier et son début (pluriels, conjugaisons : « transferts » ~ « transfert »)
    for (const cle of new Set([mot, mot.slice(0, 6)])) {
      const h = fnv1a(cle)
      v[h % dims] += (h & 0x80000000) ? -1 : 1
    }
  }
  const norme = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map(x => x / norme)
}

/**
 * Regroupe les passages trouvés par document, dans l'ordre de pertinence :
 * [{ n, fileId, titre, url, extraits: [texte] }], numérotés à partir de 1 (numéros cités par Gemini).
 */
export function grouperParDocument(passages, maxDocuments = 5) {
  const docs = []
  for (const p of passages) {
    let d = docs.find(x => x.fileId === p.fileId)
    if (!d) {
      if (docs.length >= maxDocuments) continue
      d = { n: docs.length + 1, fileId: p.fileId, titre: p.titre, url: p.url || null, extraits: [] }
      docs.push(d)
    }
    d.extraits.push(p.texte)
  }
  return docs
}

export const CONSIGNE = [
  'Tu es l’assistant des vendeurs du rayon cycle des magasins Intersport du groupe Nivault.',
  'Tu réponds en français, en tutoyant le vendeur, de façon courte et concrète : quelques phrases, ou des étapes numérotées pour une procédure.',
  'Tu t’appuies UNIQUEMENT sur les extraits de procédures fournis. N’invente jamais un prix, un code article, un délai, un nom ou une adresse.',
  'Après chaque information, indique entre crochets le numéro du document d’où elle vient, par exemple [1] ou [2].',
  `Si les extraits ne permettent pas de répondre, réponds exactement, et rien d’autre : « ${NE_SAIT_PAS} »`,
  'Si la question n’a aucun rapport avec le travail en magasin (rayon cycle, vélos, clients, procédures), réponds que tu ne traites que les questions sur les procédures du rayon cycle.',
  'Pas de titre, pas de tableau. Tu peux utiliser **gras** et des listes avec « - » ou « 1. ».',
].join('\n')

/**
 * Requête generateContent : consigne, extraits numérotés, échanges précédents (suite de discussion)
 * et question. historique : [{ role: 'user' | 'assistant', texte }].
 */
export function construireRequete({ question, documents, historique = [] }) {
  const extraits = documents.length
    ? documents.map(d => `[${d.n}] ${d.titre}\n${d.extraits.join('\n…\n')}`).join('\n\n')
    : '(aucun extrait trouvé)'
  const contents = historique.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.texte }] }))
  contents.push({ role: 'user', parts: [{ text: `Extraits des procédures :\n\n${extraits}\n\nQuestion du vendeur : ${question}` }] })
  return { systemInstruction: { parts: [{ text: CONSIGNE }] }, contents }
}

// Documents réellement cités dans la réponse ([1], [2]…), dans l'ordre des numéros
export function sourcesCitees(reponse, documents) {
  const cites = new Set([...String(reponse ?? '').matchAll(/\[(\d{1,2})\]/g)].map(m => Number(m[1])))
  return documents.filter(d => cites.has(d.n)).map(({ n, titre, url }) => ({ n, titre, url }))
}

export function estSansReponse(reponse) {
  const r = String(reponse ?? '')
  return r.includes('Je ne trouve pas cette information') || r.includes('ne traites que les questions') || r.includes('ne traite que les questions')
}

// Émulateur : pas d'appel à Gemini, on montre les documents trouvés
export function reponseSimulee(documents) {
  if (!documents.length) return NE_SAIT_PAS
  const lignes = documents.slice(0, 3).map(d => `- **${d.titre}** [${d.n}]`)
  const extrait = documents[0].extraits[0].slice(0, 280).replace(/\s+/g, ' ')
  return `*(Réponse simulée en local, sans IA.)* Documents les plus proches de ta question :\n${lignes.join('\n')}\n\nDébut du premier : « ${extrait}… » [1]`
}

// Historique envoyé par l'appli, nettoyé et borné (coût maîtrisé : 4 messages, 1 500 caractères chacun)
export function historiqueValide(h) {
  if (!Array.isArray(h)) return []
  return h.filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.texte === 'string' && x.texte.trim())
    .slice(-4).map(x => ({ role: x.role, texte: x.texte.trim().slice(0, 1500) }))
}

/* ── Fichiers bureautiques ─────────────────────────────────────────────── */
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }
function decoderXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITES[e.toLowerCase()]
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

/**
 * Texte d'une page Word (word/document.xml, préfixe « w ») ou d'une diapositive PowerPoint
 * (ppt/slides/slideN.xml, préfixe « a ») : morceaux de texte, un paragraphe par ligne.
 */
export function texteXmlOffice(xml, prefixe = 'w') {
  const re = new RegExp(`<${prefixe}:t(?:\\s[^>]*)?>([^<]*)</${prefixe}:t>|</${prefixe}:p>|<${prefixe}:(?:tab|br)\\b[^>]*/>`, 'g')
  let out = ''
  for (const m of String(xml ?? '').matchAll(re)) {
    if (m[1] != null) out += m[1]
    else out += m[0].startsWith('</') ? '\n' : ' '
  }
  return nettoyerTexte(decoderXml(out))
}

export const LIGNES_MAX = 2000
const cellule = c => String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)

/**
 * Classeur → texte, une phrase par ligne avec le nom des colonnes
 * (« Prestation : Changement chambre à air · Prix : 10 € »), pour que chaque ligne se comprenne seule.
 * feuilles : [{ nom, lignes: [[cellule…]…] }]. Trop de lignes : { ignore }.
 */
export function tableauEnTexte(feuilles, { maxLignes = LIGNES_MAX } = {}) {
  const tableaux = feuilles.map(f => ({ nom: f.nom, lignes: f.lignes.map(l => l.map(cellule)).filter(l => l.some(Boolean)) }))
  const total = tableaux.reduce((s, t) => s + t.lignes.length, 0)
  if (total > maxLignes) return { ignore: `Tableau trop grand (${total} lignes, ${maxLignes} au plus) : n’en garder que l’utile` }
  const blocs = []
  for (const { nom, lignes } of tableaux) {
    if (!lignes.length) continue
    // En-tête : première ligne d'au moins deux cases remplies, parmi les 10 premières (titres au-dessus)
    const iEntete = lignes.slice(0, 10).findIndex(l => l.filter(Boolean).length >= 2)
    const entete = iEntete >= 0 ? lignes[iEntete] : []
    const out = feuilles.length > 1 ? [`Onglet « ${nom} »`] : []
    lignes.forEach((l, i) => {
      if (i === iEntete) return
      if (i < iEntete) { out.push(l.filter(Boolean).join(' ')); return }
      out.push(l.map((c, k) => c && (entete[k] && entete[k] !== c ? `${entete[k]} : ${c}` : c)).filter(Boolean).join(' · '))
    })
    blocs.push(out.join('\n'))
  }
  return { texte: blocs.join('\n\n') }
}
