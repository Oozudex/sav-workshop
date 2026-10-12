// Assistant vélo : les vendeurs posent une question, la réponse s'appuie sur les procédures du Drive.
//
// 1. Indexation (chaque nuit, ou bouton de l'administrateur) : les dossiers Drive de ASSISTANT_DOSSIERS
//    sont parcourus ; chaque document nouveau ou modifié est lu (Google Docs, Sheets et Slides, PDF,
//    images de procédures, Excel, Word, PowerPoint),
//    découpé en passages, et chaque passage est rangé dans Firestore avec son vecteur (recherche par le sens).
// 2. Question : les passages les plus proches sont retrouvés, et Gemini rédige une réponse courte
//    à partir de ces seuls passages, en citant les documents.
//
// Tout passe par Vertex AI (serveur européen, données non réutilisées par Google). Plafonds : 15 questions
// par compte et par jour ; seuls les documents modifiés sont relus. En émulateur, aucun appel payant :
// les procédures viennent d'un dossier local (ASSISTANT_DOSSIER_LOCAL), les vecteurs sont simulés
// et la réponse liste les documents trouvés.
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { GoogleAuth } from 'google-auth-library'
import {
  DIMENSIONS, NE_SAIT_PAS, QUESTIONS_PAR_JOUR, QUESTION_MAX, construireRequete, decouper, estSansReponse,
  grouperParDocument, historiqueValide, jourParis, nettoyerTexte, peutUtiliserAssistant, reponseSimulee,
  sourcesCitees, tableauEnTexte, texteXmlOffice, vecteurLocal,
} from './assistantLib.js'

const EMULATEUR = process.env.FUNCTIONS_EMULATOR === 'true'
const PROJET = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
const REGION = process.env.ASSISTANT_REGION || 'europe-west1'
const MODELE = process.env.ASSISTANT_MODELE || 'gemini-3.5-flash-lite'
const MODELE_VECTEURS = 'gemini-embedding-001'

const PASSAGES = 'assistant_passages'
const FICHIERS = 'assistant_fichiers'
const QUESTIONS = 'assistant_questions'
const QUOTAS = 'assistant_quotas'
const RETENTION_QUESTIONS_JOURS = 30

// Fichiers lus : au-delà, ignorés (mémoire de la fonction, taille d'envoi à Gemini)
const PDF_MAX = 60 * 1024 * 1024
const ENVOI_GEMINI_MAX = 14 * 1024 * 1024
const BUREAU_MAX = 15 * 1024 * 1024

const db = () => getFirestore()
const etatRef = () => db().doc('assistant_etat/indexation')

/* ── Accès Google (compte technique des Cloud Functions) ─────────────────── */
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/drive.readonly'],
})
async function jeton() {
  const client = await googleAuth.getClient()
  return (await client.getAccessToken()).token
}

async function appelGoogle(url, { method = 'GET', body, brut = false, essais = 4 } = {}) {
  for (let essai = 1; ; essai++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await jeton()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    // Trop de requêtes ou indisponibilité passagère : on réessaie en patientant de plus en plus
    if ((res.status === 429 || res.status >= 500) && essai < essais) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** essai))
      continue
    }
    if (!res.ok) {
      const err = new Error(`Google ${res.status} : ${(await res.text()).slice(0, 400)}`)
      err.status = res.status
      throw err
    }
    return brut ? Buffer.from(await res.arrayBuffer()) : res.json()
  }
}

const vertex = modele =>
  `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJET}/locations/${REGION}/publishers/google/models/${modele}`

/* ── Vecteurs ────────────────────────────────────────────────────────────── */
// tache : RETRIEVAL_DOCUMENT (passages) ou RETRIEVAL_QUERY (question)
async function vecteur(texte, tache, titre) {
  if (EMULATEUR) return vecteurLocal(`${titre || ''}\n${texte}`)
  const instance = { content: texte, task_type: tache, ...(titre && tache === 'RETRIEVAL_DOCUMENT' ? { title: titre } : {}) }
  const r = await appelGoogle(`${vertex(MODELE_VECTEURS)}:predict`, {
    method: 'POST',
    body: { instances: [instance], parameters: { outputDimensionality: DIMENSIONS, autoTruncate: true } },
  })
  const values = r.predictions?.[0]?.embeddings?.values
  if (!values?.length) throw new Error('Vecteur vide')
  return values
}

// Plusieurs passages, 4 à la fois
async function vecteurs(textes, titre) {
  const out = new Array(textes.length)
  let i = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < textes.length) { const k = i++; out[k] = await vecteur(textes[k], 'RETRIEVAL_DOCUMENT', titre) }
  }))
  return out
}

/* ── Gemini ──────────────────────────────────────────────────────────────── */
async function gemini(requete, { maxSortie = 1024 } = {}) {
  const corps = reflexion => ({
    ...requete,
    // Réflexion interne au minimum : elle est facturée comme du texte produit
    generationConfig: { temperature: 0.2, maxOutputTokens: maxSortie, ...(reflexion ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}) },
  })
  let r
  try {
    r = await appelGoogle(`${vertex(MODELE)}:generateContent`, { method: 'POST', body: corps(true) })
  } catch (err) {
    // Modèle qui n'accepte pas ce réglage : même requête sans lui
    if (err.status !== 400 || !/thinking/i.test(err.message)) throw err
    r = await appelGoogle(`${vertex(MODELE)}:generateContent`, { method: 'POST', body: corps(false) })
  }
  const texte = (r.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim()
  const u = r.usageMetadata || {}
  return { texte, jetons: { entree: u.promptTokenCount || 0, sortie: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } }
}

// PDF scanné ou image de procédure : Gemini en recopie le texte
async function transcrire(contenu, mimeType) {
  if (EMULATEUR) return { ignore: 'Image ou PDF scanné : lu par Gemini en prod seulement' }
  const { texte } = await gemini({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: contenu.toString('base64') } },
        { text: 'Recopie fidèlement tout le texte de ce document (procédure d’un magasin de vélos), dans l’ordre de lecture, avec ses titres et ses listes. Ne commente pas, ne résume pas : réponds uniquement avec le texte.' },
      ],
    }],
  }, { maxSortie: 8192 })
  return texte
}

/* ── Drive ───────────────────────────────────────────────────────────────── */
const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const DOSSIER = 'application/vnd.google-apps.folder'
const RACCOURCI = 'application/vnd.google-apps.shortcut'
const CHAMPS = 'id,name,mimeType,modifiedTime,webViewLink,size,shortcutDetails'

async function enfants(dossierId) {
  const out = []
  let page
  do {
    const q = encodeURIComponent(`'${dossierId}' in parents and trashed = false`)
    const r = await appelGoogle(`${DRIVE}?q=${q}&fields=nextPageToken,files(${CHAMPS})&pageSize=1000`
      + `&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ''}`)
    out.push(...(r.files || []))
    page = r.nextPageToken
  } while (page)
  return out
}

/* ── Lecture d'un fichier selon son type ─────────────────────────────────── */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TABLEURS = new Set([XLSX_MIME, 'application/vnd.ms-excel', 'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet', 'text/csv'])
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const POWERPOINT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function lireTableur(contenu) {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(contenu, { type: 'buffer', cellFormula: false, cellHTML: false })
  const r = tableauEnTexte(classeur.SheetNames.map(nom => ({
    nom, lignes: XLSX.utils.sheet_to_json(classeur.Sheets[nom], { header: 1, raw: false, defval: '', blankrows: false }),
  })))
  return r.ignore ? r : r.texte
}

// Fichiers XML d'un .docx / .pptx (archive zip)
async function xmlDansZip(contenu, garder) {
  const { strFromU8, unzipSync } = await import('fflate')
  const fichiers = unzipSync(new Uint8Array(contenu), { filter: f => garder(f.name) })
  return Object.entries(fichiers).map(([nom, octets]) => [nom, strFromU8(octets)])
}

async function lirePdf(contenu) {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(contenu))
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  const lu = nettoyerTexte(text)
  // Peu de texte par page : PDF scanné (images), Gemini le lit
  if (lu.length >= 80 * Math.max(totalPages, 1)) return lu
  if (contenu.length > ENVOI_GEMINI_MAX) return lu || { ignore: 'PDF scanné trop lourd pour être lu (plus de 14 Mo)' }
  return transcrire(contenu, 'application/pdf')
}

/**
 * Fonction qui lit le fichier (→ texte, ou { ignore: raison }), ou raison pour laquelle il est ignoré.
 * acces : { telecharger() → Buffer, exporter(mimeType) → Buffer (fichiers Google uniquement) }
 */
function lecteur({ mimeType, taille = 0 }, { telecharger, exporter }) {
  const type = String(mimeType || '').toLowerCase()
  if (type === 'application/vnd.google-apps.document' || type === 'application/vnd.google-apps.presentation') {
    return async () => (await exporter('text/plain')).toString('utf8')
  }
  if (type === 'application/vnd.google-apps.spreadsheet') return async () => lireTableur(await exporter(XLSX_MIME))
  if (type === 'application/pdf') {
    return taille > PDF_MAX ? { ignore: 'PDF trop lourd (plus de 60 Mo)' } : async () => lirePdf(await telecharger())
  }
  if (IMAGES.has(type)) {
    return taille > ENVOI_GEMINI_MAX ? { ignore: 'Image trop lourde (plus de 14 Mo)' } : async () => transcrire(await telecharger(), type)
  }
  if (TABLEURS.has(type) || type === WORD || type === POWERPOINT) {
    if (taille > BUREAU_MAX) return { ignore: 'Fichier trop lourd (plus de 15 Mo)' }
    if (TABLEURS.has(type)) return async () => lireTableur(await telecharger())
    if (type === WORD) {
      return async () => {
        const xml = await xmlDansZip(await telecharger(), nom => nom === 'word/document.xml')
        return texteXmlOffice(xml[0]?.[1], 'w')
      }
    }
    return async () => {
      const numero = nom => Number(nom.match(/slide(\d+)\.xml$/)?.[1])
      const diapos = await xmlDansZip(await telecharger(), nom => /^ppt\/slides\/slide\d+\.xml$/.test(nom))
      return diapos.sort((a, b) => numero(a[0]) - numero(b[0])).map(([, xml]) => texteXmlOffice(xml, 'a')).filter(Boolean).join('\n\n')
    }
  }
  if (type === 'text/plain' || type === 'text/markdown') return async () => (await telecharger()).toString('utf8')
  if (type === 'application/msword' || type === 'application/vnd.ms-powerpoint') {
    return { ignore: 'Ancien format Word ou PowerPoint (.doc, .ppt) : l’enregistrer en .docx, .pptx ou PDF' }
  }
  return { ignore: 'Format non lu (vidéo, archive…)' }
}

function lecteurDrive(f) {
  return lecteur({ mimeType: f.mimeType, taille: Number(f.size || 0) }, {
    telecharger: () => appelGoogle(`${DRIVE}/${f.id}?alt=media&supportsAllDrives=true`, { brut: true }),
    exporter: mime => appelGoogle(`${DRIVE}/${f.id}/export?mimeType=${encodeURIComponent(mime)}`, { brut: true }),
  })
}

// Tous les fichiers sous les dossiers donnés, sous-dossiers compris (chemin = dossiers traversés)
async function fichiersDrive(racines) {
  const fichiers = [], vus = new Set()
  const pile = racines.map(id => ({ id, chemin: '' }))
  while (pile.length) {
    const { id, chemin } = pile.pop()
    if (vus.has(id)) continue
    vus.add(id)
    for (let f of await enfants(id)) {
      if (f.mimeType === RACCOURCI && f.shortcutDetails?.targetId) {
        f = await appelGoogle(`${DRIVE}/${f.shortcutDetails.targetId}?fields=${CHAMPS}&supportsAllDrives=true`).catch(() => null)
        if (!f) continue
      }
      if (f.mimeType === DOSSIER) { pile.push({ id: f.id, chemin: chemin ? `${chemin} › ${f.name}` : f.name }); continue }
      if (vus.has(f.id)) continue
      vus.add(f.id)
      fichiers.push({ id: f.id, titre: f.name, chemin, url: f.webViewLink || null, modifie: f.modifiedTime, lire: lecteurDrive(f) })
    }
  }
  return fichiers
}

// Émulateur : procédures d'exemple du dossier local, en JSON { titre, url, chemin, modifie, texte }
// ou en vrais fichiers (PDF, Excel, Word, PowerPoint…) lus comme sur le Drive
const MIME_LOCAL = {
  '.pdf': 'application/pdf', '.xlsx': XLSX_MIME, '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv',
  '.docx': WORD, '.pptx': POWERPOINT, '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.doc': 'application/msword',
}
async function fichiersLocaux(dossier) {
  const noms = (await readdir(dossier)).filter(n => !n.startsWith('.')).sort()
  return Promise.all(noms.map(async nom => {
    const chemin = join(dossier, nom)
    if (nom.endsWith('.json')) {
      const d = JSON.parse(await readFile(chemin, 'utf8'))
      return { id: `local-${basename(nom, '.json')}`, titre: d.titre, chemin: d.chemin || '', url: d.url || null,
        modifie: d.modifie || '2026-01-01T00:00:00Z', lire: async () => d.texte }
    }
    const infos = await stat(chemin)
    return { id: `local-${nom.replace(/[^A-Za-z0-9]+/g, '-')}`, titre: nom, chemin: 'Exemples locaux', url: null,
      modifie: infos.mtime.toISOString(),
      lire: lecteur({ mimeType: MIME_LOCAL[extname(nom).toLowerCase()], taille: infos.size }, { telecharger: () => readFile(chemin) }) }
  }))
}

/* ── Indexation ──────────────────────────────────────────────────────────── */
async function supprimerPassages(fileId) {
  const snap = await db().collection(PASSAGES).where('fileId', '==', fileId).select().get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch()
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

async function indexerFichier(f) {
  const ref = db().collection(FICHIERS).doc(f.id)
  const fiche = { titre: f.titre, chemin: f.chemin, url: f.url, modifie: f.modifie, luLe: FieldValue.serverTimestamp() }
  let texte
  try {
    texte = typeof f.lire === 'function' ? await f.lire() : f.lire
  } catch (err) {
    logger.warn('Assistant : fichier illisible', { titre: f.titre, err: err.message })
    await ref.set({ ...fiche, statut: 'erreur', raison: 'Lecture impossible (nouvel essai à la prochaine mise à jour)', passages: 0 })
    return { statut: 'erreur' }
  }
  if (texte?.ignore) {
    await supprimerPassages(f.id)
    await ref.set({ ...fiche, statut: 'ignore', raison: texte.ignore, passages: 0 })
    return { statut: 'ignore' }
  }
  const passages = decouper(texte)
  if (!passages.length) {
    await supprimerPassages(f.id)
    await ref.set({ ...fiche, statut: 'ignore', raison: 'Aucun texte lisible', passages: 0 })
    return { statut: 'ignore' }
  }
  const vs = await vecteurs(passages, f.titre)
  await supprimerPassages(f.id)
  for (let i = 0; i < passages.length; i += 200) {
    const batch = db().batch()
    passages.slice(i, i + 200).forEach((texte, k) => batch.set(db().collection(PASSAGES).doc(), {
      fileId: f.id, titre: f.titre, chemin: f.chemin, url: f.url, ordre: i + k, texte, embedding: FieldValue.vector(vs[i + k]),
    }))
    await batch.commit()
  }
  await ref.set({ ...fiche, statut: 'ok', raison: null, passages: passages.length })
  return { statut: 'ok', passages: passages.length }
}

/**
 * Relit les procédures : seuls les fichiers nouveaux ou modifiés depuis la dernière fois sont lus
 * (et ceux en erreur) ; les fichiers retirés du Drive sont oubliés. Une seule indexation à la fois.
 */
export async function indexerProcedures(par) {
  const etat = etatRef()
  const libre = await db().runTransaction(async tx => {
    const e = (await tx.get(etat)).data()
    if (e?.enCours && Date.now() - (e.debut?.toMillis?.() || 0) < 40 * 60_000) return false
    tx.set(etat, { enCours: true, debut: FieldValue.serverTimestamp(), par, progression: null, erreur: null }, { merge: true })
    return true
  })
  if (!libre) return { dejaEnCours: true }

  const bilan = { fichiers: 0, lus: 0, inchanges: 0, ignores: 0, erreurs: 0, retires: 0 }
  try {
    const local = EMULATEUR ? process.env.ASSISTANT_DOSSIER_LOCAL : null
    const racines = (process.env.ASSISTANT_DOSSIERS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!local && !racines.length) throw new Error('Aucun dossier Drive configuré (ASSISTANT_DOSSIERS).')
    const liste = local ? await fichiersLocaux(local) : await fichiersDrive(racines)
    bilan.fichiers = liste.length

    const connus = new Map((await db().collection(FICHIERS).get()).docs.map(d => [d.id, d.data()]))
    let faits = 0
    for (const f of liste) {
      const connu = connus.get(f.id)
      connus.delete(f.id)
      if (connu && connu.modifie === f.modifie && connu.statut !== 'erreur') {
        bilan.inchanges++
        if (connu.statut === 'ignore') bilan.ignores++
      } else {
        const r = await indexerFichier(f)
        if (r.statut === 'ok') bilan.lus++
        else if (r.statut === 'ignore') bilan.ignores++
        else bilan.erreurs++
      }
      if (++faits % 5 === 0) await etat.set({ progression: { faits, total: liste.length } }, { merge: true })
    }
    // Retirés du Drive (ou d'un dossier hors périmètre) : passages oubliés
    for (const id of connus.keys()) {
      await supprimerPassages(id)
      await db().collection(FICHIERS).doc(id).delete()
      bilan.retires++
    }
    const passages = (await db().collection(PASSAGES).count().get()).data().count
    await etat.set({ enCours: false, fin: FieldValue.serverTimestamp(), progression: null, bilan: { ...bilan, passages } }, { merge: true })
    logger.info('Assistant : procédures indexées', { ...bilan, passages })
    return { ...bilan, passages }
  } catch (err) {
    logger.error('Assistant : indexation interrompue', err)
    await etat.set({ enCours: false, fin: FieldValue.serverTimestamp(), progression: null, erreur: err.message.slice(0, 300) }, { merge: true })
    throw err
  }
}

// Questions de plus de 30 jours et compteurs des jours passés
export async function purgerAssistant() {
  const limite = Timestamp.fromMillis(Date.now() - RETENTION_QUESTIONS_JOURS * 86_400_000)
  const vieilles = [
    ...(await db().collection(QUESTIONS).where('creeLe', '<', limite).select().get()).docs,
    ...(await db().collection(QUOTAS).where('jour', '<', jourParis()).select().get()).docs,
  ]
  for (let i = 0; i < vieilles.length; i += 400) {
    const batch = db().batch()
    vieilles.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  return vieilles.length
}

/* ── Appels depuis l'appli ───────────────────────────────────────────────── */
async function profilAutorise(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const profil = (await db().doc(`users/${uid}`).get()).data()
  if (!peutUtiliserAssistant(profil)) throw new HttpsError('permission-denied', 'L’assistant est réservé au rayon vélo.')
  return { uid, profil }
}

export async function poserQuestion(request) {
  const { uid } = await profilAutorise(request)
  const question = typeof request.data?.question === 'string' ? request.data.question.trim() : ''
  if (question.length < 3) throw new HttpsError('invalid-argument', 'Pose ta question en quelques mots.')
  if (question.length > QUESTION_MAX) throw new HttpsError('invalid-argument', `Question trop longue (${QUESTION_MAX} caractères au plus).`)
  const historique = historiqueValide(request.data?.historique)

  // Plafond du compte, vérifié avant tout appel payant
  const jour = jourParis()
  const quota = db().doc(`${QUOTAS}/${uid}_${jour}`)
  const n = await db().runTransaction(async tx => {
    const count = ((await tx.get(quota)).data()?.n || 0) + 1
    if (count <= QUESTIONS_PAR_JOUR) tx.set(quota, { uid, jour, n: count })
    return count
  })
  if (n > QUESTIONS_PAR_JOUR) {
    throw new HttpsError('resource-exhausted', `Limite de ${QUESTIONS_PAR_JOUR} questions par jour atteinte pour ce compte. Réessaie demain.`)
  }

  // Recherche : la question, précédée de la précédente pour une question de suite (« et pour un VAE ? »)
  const precedente = [...historique].reverse().find(h => h.role === 'user')?.texte
  const recherche = precedente ? `${precedente}\n${question}` : question
  const v = await vecteur(recherche, 'RETRIEVAL_QUERY')
  const trouves = await db().collection(PASSAGES).findNearest({
    vectorField: 'embedding', queryVector: FieldValue.vector(v), limit: 10, distanceMeasure: 'COSINE', distanceResultField: 'distance',
  }).get()
  const documents = grouperParDocument(trouves.docs.map(d => d.data()))

  let reponse, jetons = null
  if (!documents.length) reponse = NE_SAIT_PAS
  else if (EMULATEUR) reponse = reponseSimulee(documents)
  else {
    try {
      ({ texte: reponse, jetons } = await gemini(construireRequete({ question, documents, historique })))
    } catch (err) {
      logger.error('Assistant : Gemini', err.message)
      throw new HttpsError('unavailable', 'L’assistant ne répond pas pour le moment. Réessaie dans un instant.')
    }
    if (!reponse) reponse = NE_SAIT_PAS
  }

  const sources = sourcesCitees(reponse, documents)
  const trouve = !estSansReponse(reponse)
  // Gardée 30 jours, sans le compte qui l'a posée (onglet Assistant de l'administration)
  const ref = await db().collection(QUESTIONS).add({
    question, reponse: reponse.slice(0, 3000), trouve, sources: sources.map(s => s.titre), avis: null,
    jour, creeLe: FieldValue.serverTimestamp(), jetons,
  })
  return { id: ref.id, reponse, sources, trouve, restantes: QUESTIONS_PAR_JOUR - n }
}

export async function donnerAvis(request) {
  await profilAutorise(request)
  const { id, avis } = request.data || {}
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(id) || !['utile', 'inutile', null].includes(avis)) {
    throw new HttpsError('invalid-argument', 'Avis invalide.')
  }
  const ref = db().collection(QUESTIONS).doc(id)
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Question introuvable (plus de 30 jours ?).')
  await ref.update({ avis })
  return { ok: true }
}

export async function miseAJourManuelle(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const profil = (await db().doc(`users/${uid}`).get()).data()
  if (profil?.role !== 'admin' || profil.isActive === false) throw new HttpsError('permission-denied', 'Réservé à l’administrateur.')
  try {
    return await indexerProcedures(uid)
  } catch (err) {
    throw new HttpsError('internal', `Mise à jour interrompue : ${err.message}`)
  }
}
