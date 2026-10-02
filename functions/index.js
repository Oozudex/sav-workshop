// Cloud Functions (forfait Blaze) :
// - deconnexionNocturne : toutes les sessions sont coupées chaque nuit à 0 h (heure de Paris) ;
// - retirerCollaborateur : retirer un membre de l'équipe d'un rayon change le mot de passe du compte
//   de ce rayon et déconnecte tous ses appareils ; le nouveau mot de passe est renvoyé au directeur,
//   et le rayon en choisit un autre dès sa première connexion (users/{uid}.motDePasseTemporaire).
// La coupure est immédiate grâce aux règles Firestore (users/{uid}.sessionsRevokedAt) ; la révocation
// des jetons empêche en plus de rouvrir une session sans se reconnecter.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { canManageStaff, newPassword } from './lib.js'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 })

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
  },
)

/* ── Retrait d'un collaborateur : nouveau mot de passe pour le compte du rayon ── */
export const retirerCollaborateur = onCall(async request => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const { magasinId, rayonId, staffId } = request.data || {}
  if (![magasinId, rayonId, staffId].every(v => typeof v === 'string' && v && !v.includes('/'))) {
    throw new HttpsError('invalid-argument', 'Collaborateur introuvable.')
  }

  const caller = (await db.doc(`users/${uid}`).get()).data()
  if (!canManageStaff(caller, magasinId)) throw new HttpsError('permission-denied', 'Tu n’as pas les droits pour retirer ce collaborateur.')

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
