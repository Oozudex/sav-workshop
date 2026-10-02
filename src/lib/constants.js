export const STATUSES = ['New', 'InProgress', 'WaitingParts', 'WaitingCustomer', 'Ready', 'Closed']

export const STATUS_LABELS = {
  New: 'Nouveau',
  InProgress: 'En réparation',
  WaitingParts: 'En attente pièces',
  WaitingCustomer: 'En attente client',
  Ready: 'Prêt à rendre',
  Closed: 'Clôturé',
}

// Commandes clients terminées (départ du délai d'anonymisation RGPD) ; 'livree' = ancien statut
export const ORDER_CLOSED_STATUTS = ['retiree', 'annulee', 'livree']

export const BIKE_TYPES = ['VTT', 'Route', 'Gravel', 'Urbain', 'Enfant', 'Électrique']
// Marques proposées à la création d'un ticket ; « Autre marque » permet de la saisir
export const BIKE_BRANDS = ['NAKAMURA', 'BH', 'SUPERIOR', 'ROCK MACHINE', 'GRANVILLE', 'SUNN', 'SCRAPPER', 'Q-BIKES']
// Familles de vélos de la base de données (Opérations commerciales), comme dans l'état de stock
export const BIKE_FAMILLES = ['ELECTRIQUE', 'JUNIOR', 'VTT', 'VTC', 'ROUTE', 'GRAVEL', 'CARGO', 'VILLE', 'TANDEM', 'MONOCYCLE', 'JOUET', 'BMX']
export const PRIORITIES = ['Normal', 'Urgent']

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
export const ROLES = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse', 'acheteur', 'directeurmag', 'directeurgen', 'admin']

export const ROLE_LABELS = {
  velo:         'Vélo',
  chaussure:    'Chaussure',
  textile:      'Textile',
  randonnee:    'Randonnée',
  caisse:       'Caisse',
  acheteur:     'Acheteur',
  directeurmag: 'Dir. Magasin',
  directeurgen: 'Dir. Général',
  admin:        'Administrateur',
}

// Comptes de direction : seuls les administrateurs les créent et les modifient
export const DIRECTION_ROLES = ['directeurgen', 'admin']

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

