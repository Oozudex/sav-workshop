// Fonctions pures des Cloud Functions (tests/unit/functionsLib.test.mjs)
import { randomInt } from 'node:crypto'

// Sans caractères ambigus (0/O, 1/l/I) : le mot de passe est recopié à la main par l'équipe
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

// « Xk7m-Pq4r-Tz9w » : 12 caractères tirés au hasard, en 3 groupes faciles à dicter
export function newPassword(groups = 3, size = 4) {
  return Array.from({ length: groups }, () =>
    Array.from({ length: size }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-')
}

const GLOBAL_ROLES = ['admin', 'directeurgen', 'acheteur']

// Peut retirer un collaborateur de l'équipe d'un magasin : direction, acheteurs, ou le directeur du magasin
export function canManageStaff(caller, magasinId) {
  if (!caller || caller.isActive === false) return false
  if (GLOBAL_ROLES.includes(caller.role)) return true
  return caller.role === 'directeurmag' && !!magasinId && caller.magasinId === magasinId
}
