// Cloud Functions (forfait Blaze) :
// - deconnexionNocturne : toutes les sessions sont coupées chaque nuit à 0 h (heure de Paris) ;
// - retirerCollaborateur : retirer un membre de l'équipe d'un rayon change le mot de passe du compte
//   de ce rayon et déconnecte tous ses appareils ; le nouveau mot de passe est renvoyé au directeur,
//   et le rayon en choisit un autre dès sa première connexion (users/{uid}.motDePasseTemporaire).
// La coupure est immédiate grâce aux règles Firestore (users/{uid}.sessionsRevokedAt) ; la révocation
// des jetons empêche en plus de rouvrir une session sans se reconnecter.
// - lireEtiquette : recherche des OP par photo, le texte de l'étiquette est lu par Cloud Vision.
// - reinitialiserDoubleAuth : un administrateur retire l'application d'authentification d'un compte
//   (téléphone perdu) ; la personne en configure une nouvelle à sa prochaine connexion.
// - nettoyageNocturne : RDV client de plus d'un mois (RGPD), anciens événements rangés dans les
//   calendriers des rayons, todo lists personnelles des comptes supprimés.
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { canManageStaff, limiteRdvClient, migrationEvenement, newPassword, peutReinitialiserDoubleAuth } from './lib.js'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 })

// App Check : passe à true une fois que la console Firebase montre que les requêtes du site arrivent
// toutes avec un jeton valide ; les appels sans jeton (scripts, copies du site) sont alors refusés.
const APP_CHECK_OBLIGATOIRE = false

const db = getFirestore()
const auth = getAuth()

// extra : champs ajoutés au profil (ex. motDePasseTemporaire)
async function revokeSessions(uid, extra = {}) {
  await auth.revokeRefreshTokens(uid)
  const ref = db.doc(`users/${uid}`)
  if ((await ref.get()).exists) await ref.update({ sessionsRevokedAt: FieldValue.serverTimestamp(), ...extra })
}

/* ── Déconnexion de tout le monde à minuit ─────────────────────────────── */
export const deconnexionNocturne = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Europe/Paris', retryCount: 3 },
  async () => {
    // Jetons révoqués pour tous les comptes de connexion
    let pageToken, total = 0
    do {
      const page = await auth.listUsers(1000, pageToken)
      for (const u of page.users) { await auth.revokeRefreshTokens(u.uid); total++ }
      pageToken = page.pageToken
    } while (pageToken)

    // Coupure immédiate côté base : sessions ouvertes avant cette date refusées
    const users = await db.collection('users').get()
    for (let i = 0; i < users.docs.length; i += 400) {
      const batch = db.batch()
      users.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { sessionsRevokedAt: FieldValue.serverTimestamp() }))
      await batch.commit()
    }
    logger.info(`Déconnexion nocturne : ${total} comptes, ${users.size} profils`)

    // Compteurs de lectures d'étiquettes des mois passés
    const mois = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7)
    const anciens = await db.collection('lectures_etiquettes').where('mois', '<', mois).get()
    for (let i = 0; i < anciens.docs.length; i += 400) {
      const batch = db.batch()
      anciens.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  },
)

/* ── Nettoyage de la nuit (calendrier, todo lists personnelles) ───────────── */
// Écritures par lots de 400 (limite Firestore : 500)
async function ecrireParLots(operations) {
  for (let i = 0; i < operations.length; i += 400) {
    const batch = db.batch()
    operations.slice(i, i + 400).forEach(op => op(batch))
    await batch.commit()
  }
}

export const nettoyageNocturne = onSchedule(
  { schedule: '30 0 * * *', timeZone: 'Europe/Paris', retryCount: 3 },
  async () => {
    const events = db.collection('calendar_events')

    // RDV client de plus d'un mois : supprimés (RGPD)
    const anciens = await events.where('date', '<', limiteRdvClient()).get()
    const rdvAnciens = anciens.docs.filter(d => d.get('type') === 'rdv_client')
    await ecrireParLots(rdvAnciens.map(d => batch => batch.delete(d.ref)))

    // Anciens événements des calendriers de magasin : rangés dans le calendrier d'un rayon
    const [sansRayon, reunions] = await Promise.all([
      events.where('type', '==', 'rdv_client').where('rayonType', '==', null).get(),
      events.where('type', 'in', ['teams', 'op_commerciale']).get(),
    ])
    const aRanger = [...sansRayon.docs, ...reunions.docs]
      .map(d => ({ ref: d.ref, champs: migrationEvenement(d.data()) }))
      .filter(m => m.champs)
    await ecrireParLots(aRanger.map(m => batch => batch.update(m.ref, m.champs)))

    // Todo lists personnelles dont le compte a été supprimé
    const [todos, recurrences] = await Promise.all([
      db.collectionGroup('todos_perso').select().get(),
      db.collectionGroup('recurrences_perso').select().get(),
    ])
    const proprietaires = [...new Set([...todos.docs, ...recurrences.docs].map(d => d.ref.parent.parent.id))]
    const profils = proprietaires.length ? await db.getAll(...proprietaires.map(uid => db.doc(`users/${uid}`))) : []
    const orphelins = profils.filter(p => !p.exists).map(p => p.id)
    for (const uid of orphelins) {
      await db.recursiveDelete(db.collection(`users/${uid}/todos_perso`))
      await db.recursiveDelete(db.collection(`users/${uid}/recurrences_perso`))
    }

    logger.info('Nettoyage de la nuit', { rdvSupprimes: rdvAnciens.length, evenementsRanges: aRanger.length, todosSupprimees: orphelins.length })
  },
)

/* ── Retrait d'un collaborateur : nouveau mot de passe pour le compte du rayon ── */
export const retirerCollaborateur = onCall({ enforceAppCheck: APP_CHECK_OBLIGATOIRE }, async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const { magasinId, rayonId, staffId } = request.data || {}
  if (![magasinId, rayonId, staffId].every(v => typeof v === 'string' && v && !v.includes('/'))) {
    throw new HttpsError('invalid-argument', 'Collaborateur introuvable.')
  }

  const caller = (await db.doc(`users/${uid}`).get()).data()
  if (!canManageStaff(caller, magasinId, request.auth.token)) throw new HttpsError('permission-denied', 'Tu n’as pas les droits pour retirer ce collaborateur.')

  const rayonRef = db.doc(`magasins/${magasinId}/rayons/${rayonId}`)
  const staffRef = rayonRef.collection('staff').doc(staffId)
  const [rayon, staff] = await Promise.all([rayonRef.get(), staffRef.get()])
  if (!rayon.exists || !staff.exists) throw new HttpsError('not-found', 'Collaborateur introuvable.')

  await staffRef.delete()

  // Compte de connexion du rayon : nouveau mot de passe et déconnexion de tous ses appareils
  const accountUid = rayon.get('uid')
  let compte = null
  if (accountUid) {
    try {
      const password = newPassword()
      const user = await auth.updateUser(accountUid, { password })
      // À la première connexion, le rayon devra choisir son propre mot de passe
      await revokeSessions(accountUid, { motDePasseTemporaire: true })
      compte = { email: user.email || null, password }
    } catch (err) {
      logger.error('Mot de passe du rayon non changé', { magasinId, rayonId, code: err.code })
      throw new HttpsError('internal', 'Collaborateur retiré, mais le mot de passe du rayon n’a pas pu être changé. Réessaie ou contacte l’administrateur.')
    }
  }
  logger.info('Collaborateur retiré', { magasinId, rayonId, par: uid, motDePasseChange: !!compte })
  return { rayon: rayon.get('nom') || null, compte }
})

/* ── Double authentification : téléphone perdu ───────────────────────────── */
// Retire les seconds facteurs du compte et coupe ses sessions : à la connexion suivante (mot de passe
// seul), l'application lui fait configurer une nouvelle application d'authentification.
export const reinitialiserDoubleAuth = onCall({ enforceAppCheck: APP_CHECK_OBLIGATOIRE }, async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const cibleUid = request.data?.uid
  if (typeof cibleUid !== 'string' || !cibleUid || cibleUid.includes('/')) throw new HttpsError('invalid-argument', 'Compte introuvable.')

  const [caller, cible] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`users/${cibleUid}`).get()])
  if (!peutReinitialiserDoubleAuth(caller.data(), request.auth.token, cible.data())) {
    throw new HttpsError('permission-denied', 'Seul un administrateur réinitialise la double authentification d’un acheteur ou de la direction.')
  }
  try {
    await auth.updateUser(cibleUid, { multiFactor: { enrolledFactors: null } })
  } catch (err) {
    logger.error('Double authentification non réinitialisée', { cibleUid, code: err.code })
    throw new HttpsError(err.code === 'auth/user-not-found' ? 'not-found' : 'internal',
      err.code === 'auth/user-not-found' ? 'Ce compte n’a pas d’accès de connexion.' : 'Réinitialisation impossible. Réessaie.')
  }
  await revokeSessions(cibleUid)
  logger.info('Double authentification réinitialisée', { cibleUid, par: uid })
  return { nom: cible.get('displayName') || null }
})

/* ── Recherche par photo : lecture du texte d'une étiquette (Cloud Vision, serveur européen) ── */
// Une seule fonction Cloud Vision est demandée (TEXT_DETECTION) : une photo = une unité facturable,
// les 1 000 premières du mois sont gratuites. La photo n'est ni stockée ni journalisée.
// Lectures plafonnées par compte et par mois (coût maîtrisé) : le plafond est vérifié avant tout appel.
// En émulateur, Cloud Vision n'est pas joignable : la lecture est simulée avec une étiquette d'exemple.
const LECTURES_PAR_MOIS = 100
const ETIQUETTE_SIMULEE = 'INTERSPORT\nCROSSOVER XV\nNAKAMURA THULIUM\nYH60WY\n0-254888/662331/60608\n2 000016 742299\nVTC HOMME'

export const lireEtiquette = onCall({ memory: '256MiB', timeoutSeconds: 30, enforceAppCheck: APP_CHECK_OBLIGATOIRE }, async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const image = request.data?.image
  if (typeof image !== 'string' || !image || image.length > 3_000_000) {
    throw new HttpsError('invalid-argument', 'Photo illisible ou trop lourde.')
  }

  const mois = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7) // AAAA-MM
  const quota = db.doc(`lectures_etiquettes/${uid}_${mois}`)
  const n = await db.runTransaction(async tx => {
    const count = ((await tx.get(quota)).data()?.n || 0) + 1
    if (count <= LECTURES_PAR_MOIS) tx.set(quota, { uid, mois, n: count })
    return count
  })
  if (n > LECTURES_PAR_MOIS) {
    throw new HttpsError('resource-exhausted', `Limite de ${LECTURES_PAR_MOIS} photos par mois atteinte pour ce compte. Tape le chrono à la main.`)
  }

  if (process.env.FUNCTIONS_EMULATOR === 'true') return { texte: ETIQUETTE_SIMULEE }

  const { access_token: token } = await applicationDefault().getAccessToken()
  const res = await fetch('https://eu-vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: image }, features: [{ type: 'TEXT_DETECTION' }] }] }),
  })
  if (!res.ok) {
    logger.error(`Cloud Vision : erreur ${res.status}`, (await res.text()).slice(0, 500))
    throw new HttpsError('unavailable', 'La lecture de la photo a échoué. Réessaie.')
  }
  const reponse = (await res.json()).responses?.[0] || {}
  if (reponse.error) {
    logger.error('Cloud Vision', reponse.error)
    throw new HttpsError('unavailable', 'La lecture de la photo a échoué. Réessaie.')
  }
  return { texte: reponse.fullTextAnnotation?.text || '' }
})
