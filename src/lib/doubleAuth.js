// Double authentification (code à 6 chiffres d'une application : Google Authenticator, Microsoft
// Authenticator…) : obligatoire pour les acheteurs, la direction et les administrateurs.
// Les règles Firestore et les Cloud Functions refusent les droits de ces rôles à une session ouverte
// sans le code. Fonctions pures : tests/unit/doubleAuth.test.mjs
export const ROLES_DOUBLE_AUTH = ['acheteur', 'directeurgen', 'admin']
export const NOM_APPLI_AUTH = 'Groupe Nivault'

// Profil côté application (l'administrateur y est un « directeurgen » avec isAdmin, cf. store/useAuth.js)
export const doubleAuthRequise = profile => ROLES_DOUBLE_AUTH.includes(profile?.role) || profile?.isAdmin === true

// Projet des émulateurs locaux (.env.emulator) : pas de double authentification en développement.
// En prod, Firebase n'accepte que les jetons émis pour le projet groupe-nivault.
export const PROJET_EMULATEUR = 'sav-workshop'

// Session ouverte avec le second facteur (revendication firebase du jeton), ou session locale
export function sessionDoubleAuth(claims) {
  return !!claims?.firebase?.sign_in_second_factor || claims?.aud === PROJET_EMULATEUR
}

// Code saisi : chiffres seulement (espaces, tirets collés depuis l'application ignorés)
export const lireCode = s => String(s ?? '').replace(/\D/g, '').slice(0, 6)
export const codeComplet = s => /^\d{6}$/.test(s)

// Clé à saisir à la main si le QR code ne passe pas : « ABCD EFGH … »
export const formaterCle = cle => String(cle || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()

export function messageErreurDoubleAuth(code) {
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/invalid-credential':
      return 'Code incorrect. Tape le code affiché maintenant dans l’application (il change toutes les 30 secondes).'
    case 'auth/totp-challenge-timeout':
    case 'auth/code-expired':
    case 'auth/missing-multi-factor-session':
    case 'auth/invalid-multi-factor-session':
      return 'Le délai est dépassé. Recommence la connexion.'
    case 'auth/requires-recent-login':
      return 'Par sécurité, reconnecte-toi puis active la double authentification juste après.'
    case 'auth/unverified-email':
      return 'Ton adresse e-mail doit d’abord être vérifiée.'
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'La double authentification n’est pas encore activée sur le projet. Préviens l’administrateur.'
    case 'auth/too-many-requests':
      return 'Trop d’essais. Patiente quelques minutes avant de réessayer.'
    case 'auth/network-request-failed':
      return 'Connexion internet indisponible. Réessaie.'
    default:
      return 'Opération impossible. Réessaie dans un instant.'
  }
}
