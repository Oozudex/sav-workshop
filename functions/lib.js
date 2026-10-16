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

/* ── Calendrier : un par rayon de magasin (cf. src/lib/calendarEvents.js) ── */
const RAYONS = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse']

// Invitations d'une réunion : chaque magasin, et chacun de ses rayons invités (tous si aucun)
export function ciblesInvitation(magasinIds = [], rayons = []) {
  const rs = rayons?.length ? rayons : RAYONS
  return [...new Set(magasinIds)].flatMap(m => [m, ...rs.map(r => `${m}_${r}`)])
}

/**
 * Ancien événement d'un calendrier de magasin à ranger dans le calendrier d'un rayon : champs à
 * modifier, ou null si rien à faire. Les RDV client sans rayon vont au rayon vélo (le calendrier ne
 * servait qu'au cycle) ; les réunions et OP créées par la direction deviennent des invitations.
 */
export function migrationEvenement(ev) {
  if (!ev?.magasinId || ev.cibles || ev.rayonType) return null
  if (ev.type === 'rdv_client') return { rayonType: 'velo' }
  if (ev.type === 'teams' || ev.type === 'op_commerciale') return { cibles: ciblesInvitation([ev.magasinId], ev.teamsRayons) }
  return null
}

// Date 'YYYY-MM-DD' (heure de Paris) un mois avant maintenant : RDV client plus anciens supprimés (RGPD)
export function limiteRdvClient(now = new Date()) {
  const d = new Date(now)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
}
