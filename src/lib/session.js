// Sessions : tout le monde est déconnecté chaque nuit à 0 h, heure de Paris.
// Fonctions pures (tests/unit/session.test.mjs) ; la coupure côté serveur est faite par la
// Cloud Function deconnexionNocturne et les règles Firestore.
const TZ = 'Europe/Paris'

// Décalage de Paris par rapport à UTC à un instant donné, en minutes (60 l'hiver, 120 l'été)
export function parisOffsetMinutes(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

// Dernier minuit à Paris (début de la journée en cours), en Date
export function lastParisMidnight(now = new Date()) {
  const local = new Date(now.getTime() + parisOffsetMinutes(now) * 60000)
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  // Le décalage à minuit peut différer de celui de maintenant (changement d'heure dans la nuit)
  let guess = midnightAsUtc - parisOffsetMinutes(now) * 60000
  guess = midnightAsUtc - parisOffsetMinutes(new Date(guess)) * 60000
  return new Date(guess)
}

// Prochain minuit à Paris
export function nextParisMidnight(now = new Date()) {
  // Midi du lendemain (heure de Paris approximative), puis son minuit
  const tomorrow = new Date(lastParisMidnight(now).getTime() + 36 * 3600000)
  return lastParisMidnight(tomorrow)
}

// La session a-t-elle commencé avant le dernier minuit (ou avant une coupure forcée) ?
export function sessionExpired(authTime, { now = new Date(), revokedAt = null } = {}) {
  if (!authTime) return false
  const start = authTime.getTime()
  if (start < lastParisMidnight(now).getTime()) return true
  // Une seconde de tolérance : auth_time est arrondi à la seconde
  return !!revokedAt && start + 999 < revokedAt.getTime()
}

// Nouveau mot de passe choisi par le rayon : null si correct, sinon le problème à afficher
export function passwordErrors(password, confirmation) {
  if (!password || password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.'
  if (password !== confirmation) return 'Les deux mots de passe ne sont pas identiques.'
  return null
}
