export const STATUSES = ['New', 'InProgress', 'WaitingParts', 'WaitingCustomer', 'Ready', 'Closed']

export const STATUS_LABELS = {
  New: 'Nouveau',
  InProgress: 'En réparation',
  WaitingParts: 'En attente pièces',
  WaitingCustomer: 'En attente client',
  Ready: 'Prêt à rendre',
  Closed: 'Clôturé',
}

export const BIKE_TYPES = ['VTT', 'Route', 'Gravel', 'Urbain', 'Enfant', 'Électrique']
export const PRIORITIES = ['Normal', 'Urgent']
export const CONTACT_PREFS = ['Téléphone', 'Email', 'Indifférent']

// ── Rôles ─────────────────────────────────────────────────────────────────────
export const ROLES = ['vendeur', 'acheteur', 'directeurmag', 'directeurgen']

export const ROLE_LABELS = {
  vendeur:      'Vendeur',
  acheteur:     'Acheteur',
  directeurmag: 'Dir. Magasin',
  directeurgen: 'Dir. Général',
}

// Voit tous les magasins (avec sélecteur dans la navbar)
export const GLOBAL_ROLES = ['acheteur', 'directeurgen']

// Peut supprimer dans son périmètre
export const CAN_DELETE_ROLES = ['acheteur', 'directeurmag', 'directeurgen']

// Peut accéder à l'admin comptes Firebase
export const USER_ADMIN_ROLES = ['acheteur', 'directeurgen']

// ── Postes staff (sans compte Auth — pour les dropdowns) ──────────────────────
export const STAFF_POSTES = ['vendeur', 'mecanicien']
export const STAFF_POSTE_LABELS = { vendeur: 'Vendeur', mecanicien: 'Mécanicien' }
