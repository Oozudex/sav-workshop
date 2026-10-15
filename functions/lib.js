// Fonctions pures des Cloud Functions (tests/unit/functionsLib.test.mjs)
import { randomInt } from 'node:crypto'

// Sans caractères ambigus (0/O, 1/l/I) : le mot de passe est recopié à la main par l'équipe
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

// « Xk7m-Pq4r-Tz9w » : 12 caractères tirés au hasard, en 3 groupes faciles à dicter, avec toujours
// une majuscule, une minuscule et un chiffre (politique de mot de passe du projet)
export function newPassword(groups = 3, size = 4) {
  for (;;) {
    const p = Array.from({ length: groups }, () =>
      Array.from({ length: size }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-')
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) return p
  }
}

const GLOBAL_ROLES = ['admin', 'directeurgen', 'acheteur']

// Double authentification obligatoire pour les rôles globaux (comme dans firestore.rules) : la session
// doit avoir été ouverte avec le code de l'application ; émulateurs locaux (projet sav-workshop) dispensés.
// token : request.auth.token de la fonction appelable
export function sessionDoubleAuthOk(caller, token) {
  if (!GLOBAL_ROLES.includes(caller?.role)) return true
  return !!token?.firebase?.sign_in_second_factor || token?.aud === 'sav-workshop'
}

// Réinitialiser la double authentification d'un compte (téléphone perdu) : un administrateur actif,
// connecté avec son code, pour un compte acheteur, de direction ou administrateur
export function peutReinitialiserDoubleAuth(caller, token, cible) {
  if (!caller || caller.isActive === false || caller.role !== 'admin') return false
  return sessionDoubleAuthOk(caller, token) && GLOBAL_ROLES.includes(cible?.role)
}

// Peut retirer un collaborateur de l'équipe d'un magasin : direction, acheteurs, ou le directeur du magasin
export function canManageStaff(caller, magasinId, token) {
  if (!caller || caller.isActive === false) return false
  if (GLOBAL_ROLES.includes(caller.role)) return sessionDoubleAuthOk(caller, token)
  return caller.role === 'directeurmag' && !!magasinId && caller.magasinId === magasinId
}
