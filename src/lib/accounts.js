// Comptes utilisateurs créés depuis l'administration : compte de connexion + e-mail de mot de passe.
import { getApp, getApps, initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
} from 'firebase/auth'
import { randomPassword } from './security'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Crée le compte de connexion sans déconnecter l'administrateur (application Firebase secondaire).
// Le mot de passe aléatoire est aussitôt remplacé par celui que la personne choisit via l'e-mail.
export async function createAuthAccount(email, displayName) {
  const secName = 'secondary-app'
  let secApp
  try {
    secApp = getApps().find(a => a.name === secName) || initializeApp(getApp().options, secName)
    const secAuth = getAuth(secApp)
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
      try { connectAuthEmulator(secAuth, 'http://localhost:9099', { disableWarnings: true }) } catch { /* déjà connecté */ }
    }
    const cred = await createUserWithEmailAndPassword(secAuth, email, randomPassword())
    await updateProfile(cred.user, { displayName })
    return cred.user.uid
  } finally {
    if (secApp) { try { await deleteApp(secApp) } catch { /* ignoré */ } }
  }
}

const MAIL_ERRORS = {
  'auth/too-many-requests': 'trop d’envois rapprochés, réessaie dans quelques minutes',
  'auth/user-not-found': 'aucun compte de connexion avec cette adresse',
  'auth/invalid-email': 'adresse e-mail invalide',
  'auth/network-request-failed': 'pas de connexion internet',
}

// E-mail pour choisir (ou rechoisir) son mot de passe. Renvoie null si l'envoi est parti, sinon la raison.
export async function sendSetupEmail(email) {
  try {
    await sendPasswordResetEmail(getAuth(), email)
    return null
  } catch (err) {
    return MAIL_ERRORS[err.code] || err.message || 'erreur inconnue'
  }
}

export const MAIL_HINT = 'S’il n’arrive pas : vérifier les spams / la quarantaine e-securemail, puis « Renvoyer l’e-mail » (icône enveloppe).'

export function accountError(err) {
  const map = {
    'auth/email-already-in-use': 'Cette adresse e-mail a déjà un compte.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'permission-denied': 'Vous n’avez pas les droits pour cette action.',
  }
  return map[err?.code] || err?.message || 'Action impossible.'
}

// Message après création : succès, ou compte créé mais e-mail non parti
export async function afterCreateMessage(label, email) {
  const mailErr = await sendSetupEmail(email)
  return mailErr
    ? { tone: 'error', text: `${label} créé, mais l’e-mail n’est pas parti (${mailErr}). Utilise « Renvoyer l’e-mail ».` }
    : { tone: 'ok', text: `${label} créé · e-mail pour choisir le mot de passe envoyé à ${email}. ${MAIL_HINT}` }
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}
