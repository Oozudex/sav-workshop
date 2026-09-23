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

// ── Rayons ────────────────────────────────────────────────────────────────────
export const RAYON_TYPES = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse']
export const RAYON_TYPE_LABELS = {
  velo:      'Vélo',
  chaussure: 'Chaussure',
  textile:   'Textile',
  randonnee: 'Randonnée',
  caisse:    'Caisse',
}

// ── Rôles ─────────────────────────────────────────────────────────────────────
export const ROLES = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse', 'acheteur', 'directeurmag', 'directeurgen']

export const ROLE_LABELS = {
  velo:         'Vélo',
  chaussure:    'Chaussure',
  textile:      'Textile',
  randonnee:    'Randonnée',
  caisse:       'Caisse',
  acheteur:     'Acheteur',
  directeurmag: 'Dir. Magasin',
  directeurgen: 'Dir. Général',
}

// Voit tous les magasins (avec sélecteur dans la navbar)
export const GLOBAL_ROLES = ['acheteur', 'directeurgen']

// Peut supprimer dans son périmètre
export const CAN_DELETE_ROLES = ['acheteur', 'directeurmag', 'directeurgen']

// ── Postes staff (sans compte Auth — pour les dropdowns) ──────────────────────
export const STAFF_POSTES = ['vendeur', 'responsable']
export const STAFF_POSTE_LABELS = {
  vendeur:     'Vendeur',
  responsable: 'Responsable',
}

