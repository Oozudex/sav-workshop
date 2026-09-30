// Commandes OBUT (boules sur mesure) : catalogue, statuts, lignes de prix et totaux.
// Fonctions pures : testées dans tests/unit/obut.test.mjs
import { parseEuro } from './orders.js'
import { toDate } from './ticketStats.js'

const DAY = 24 * 60 * 60 * 1000
const round2 = n => Math.round(n * 100) / 100

// ── Statuts : même parcours que les commandes clients ───────────────────────
export const OBUT_STATUSES = ['en_attente', 'commande', 'recu', 'client_prevenu', 'livre', 'annule']
export const OBUT_OPEN_STATUSES = ['en_attente', 'commande', 'recu', 'client_prevenu']
export const OBUT_CLOSED_STATUSES = ['livre', 'annule']

export const OBUT_STATUS_META = {
  en_attente:     { label: 'À commander',       hint: 'Commande pas encore passée chez OBUT', dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20' },
  commande:       { label: 'Commandée',         hint: 'Passée chez OBUT, en attente de réception', dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20' },
  recu:           { label: 'Reçue en magasin',  hint: 'Arrivée, le client doit être appelé', dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20' },
  client_prevenu: { label: 'Client prévenu',    hint: 'Client appelé, en attente de retrait', dot: 'bg-cyan-500',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20' },
  livre:          { label: 'Remise au client',  hint: 'Boules remises au client', dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20' },
  annule:         { label: 'Annulée',           hint: 'Commande abandonnée', dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20' },
}

// Bouton « étape suivante » de la fiche
export const OBUT_NEXT_STEP = {
  en_attente:     { to: 'commande',       label: 'Commande passée chez OBUT' },
  commande:       { to: 'recu',           label: 'Reçue en magasin' },
  recu:           { to: 'client_prevenu', label: '📞 Client prévenu' },
  client_prevenu: { to: 'livre',          label: 'Remise au client' },
}

export function obutStatus(cmd) {
  return OBUT_STATUS_META[cmd?.statut] ? cmd.statut : 'en_attente'
}

export function isObutOpen(cmd) {
  return OBUT_OPEN_STATUSES.includes(obutStatus(cmd)) && !cmd.anonymizedAt
}

export function obutStatusSince(cmd) {
  return toDate(cmd.statutAt) || toDate(cmd.updatedAt) || toDate(cmd.createdAt)
}

// Les commandes terminées restent affichées 14 jours (puis données client effacées, cf. lib/cleanup.js)
export const OBUT_VISIBLE_DAYS = 14

export function isObutListed(cmd, now = new Date()) {
  if (cmd.anonymizedAt) return false
  if (isObutOpen(cmd)) return true
  // Anciennes commandes archivées sans date : données client déjà effacées, statistiques seulement
  const closed = toDate(cmd.closedAt) || toDate(cmd.statutAt)
  return !!closed && now - closed < OBUT_VISIBLE_DAYS * DAY
}

// ── Catalogue : boules et services, prix gérés par l'acheteur ───────────────
// kind : boule | marquage (un seul par commande, avec un texte) | option (livraison…)
export const CATALOGUE_KINDS = ['boule', 'marquage', 'option']
export const CATALOGUE_KIND_LABELS = { boule: 'Boule', marquage: 'Marquage', option: 'Service' }

// Catalogue d'origine, utilisé tant que l'acheteur n'a rien enregistré (identifiants fixes)
export const DEFAULT_CATALOGUE = [
  ['cx-cou', 'CX COU', 220], ['ton-r', "TON'R", 140], ['soleil', 'SOLEIL', 195], ['atx', 'ATX', 320],
  ['rcc', 'RCC', 220], ['match', 'MATCH', 93], ['match-it', 'MATCH IT', 150], ['match-plus', 'MATCH +', 180],
  ['superinox', 'SUPERINOX', 215], ['rcx', 'RCX', 240],
].map(([id, label, prix], order) => ({ id, kind: 'boule', label, prix, order })).concat([
  { id: 'marquage-classique', kind: 'marquage', label: 'Marquage classique / italique', prix: 15, order: 0 },
  { id: 'marquage-stylise', kind: 'marquage', label: 'Marquage stylisé', prix: 19, order: 1 },
  { id: 'livraison', kind: 'option', label: 'Livraison', prix: 7.1, parDefaut: true, order: 0 },
])

export function sortCatalogue(items) {
  return [...items].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.label || '').localeCompare(b.label || '', 'fr'))
}

export function catalogueByKind(items) {
  const sorted = sortCatalogue(items)
  return Object.fromEntries(CATALOGUE_KINDS.map(k => [k, sorted.filter(i => i.kind === k)]))
}

export function catalogueItemErrors(item) {
  const errors = {}
  if (!String(item.label || '').trim()) errors.label = 'Nom obligatoire.'
  const prix = parseEuro(item.prix)
  if (item.prix === '' || item.prix == null) errors.prix = 'Prix obligatoire.'
  else if (prix == null || prix < 0) errors.prix = 'Prix invalide.'
  return errors
}

// ── Formulaire de commande ───────────────────────────────────────────────────
const money = v => (v == null || v === '' ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v))
const pick = item => (item ? { id: item.id, label: item.label, prix: money(item.prix) } : null)

// Anciennes commandes : type de marquage et livraison enregistrés à part
const LEGACY_MARQUAGE = { classique: 'Marquage classique / italique', stylisee: 'Marquage stylisé' }

export function emptyObutForm(catalogue, today) {
  const { boule, option } = catalogueByKind(catalogue)
  return {
    clientNom: '', clientPrenom: '', clientTel: '', dateCommande: today, vendeur: '',
    modele: pick(boule[0]), diametre: '', strie: '', poids: '',
    marquage: null, marquageTexte: '',
    options: option.filter(o => o.parDefaut).map(pick),
    acompte: '',
  }
}

export function obutFormFromCmd(cmd) {
  const marquageLabel = cmd.marquageLabel || LEGACY_MARQUAGE[cmd.marquageType]
  const options = Array.isArray(cmd.options) ? cmd.options.map(pick)
    : cmd.prixLivraison ? [{ id: 'livraison', label: 'Livraison', prix: money(cmd.prixLivraison) }] : []
  return {
    clientNom: cmd.clientNom || '', clientPrenom: cmd.clientPrenom || '', clientTel: cmd.clientTel || '',
    dateCommande: cmd.dateCommande || '', vendeur: cmd.vendeur || '',
    modele: cmd.modele ? { id: cmd.modeleId || cmd.modele, label: cmd.modele, prix: money(cmd.prixModele) } : null,
    diametre: cmd.diametre || '', strie: cmd.strie || '', poids: cmd.poids || '',
    marquage: marquageLabel || cmd.prixMarquage
      ? { id: cmd.marquageId || cmd.marquageType || 'marquage', label: marquageLabel || 'Marquage', prix: money(cmd.prixMarquage) } : null,
    marquageTexte: cmd.marquage || '',
    options,
    acompte: money(cmd.acompte),
  }
}

export { pick as catalogueChoice }

// Lignes du récapitulatif (formulaire ou commande enregistrée)
export function obutLines(src) {
  const isForm = 'marquageTexte' in src
  const f = isForm ? src : obutFormFromCmd(src)
  const lines = []
  if (f.modele) lines.push({ key: 'modele', label: `Boules ${f.modele.label}`, prix: parseEuro(f.modele.prix) })
  if (f.marquage) lines.push({ key: 'marquage', label: f.marquage.label, prix: parseEuro(f.marquage.prix), detail: f.marquageTexte || null })
  for (const o of f.options) lines.push({ key: `option:${o.id}`, label: o.label, prix: parseEuro(o.prix) })
  return lines
}

export function obutTotal(src) {
  const lines = obutLines(src)
  if (!lines.length) return null
  return round2(lines.reduce((s, l) => s + (l.prix || 0), 0))
}

export function obutRemaining(src) {
  const total = obutTotal(src)
  if (total == null) return null
  return Math.max(0, round2(total - (parseEuro(src.acompte) || 0)))
}

// Acompte minimum demandé au client : 30 % du total, arrondi au centime supérieur
export const OBUT_MIN_DEPOSIT_RATE = 0.3

export function obutMinDeposit(src) {
  const total = obutTotal(src)
  return total ? Math.ceil(round2(total * OBUT_MIN_DEPOSIT_RATE * 100)) / 100 : null
}

export function obutFormErrors(f) {
  const errors = {}
  const filled = v => v != null && String(v).trim() !== ''
  if (!filled(f.clientNom)) errors.clientNom = 'Le nom du client est obligatoire.'
  if (!filled(f.clientTel)) errors.clientTel = 'Le téléphone est obligatoire pour prévenir le client.'
  if (!f.modele) errors.modele = 'Choisissez un modèle.'
  const badPrice = v => !filled(v) || parseEuro(v) == null || parseEuro(v) < 0
  if (f.modele && badPrice(f.modele.prix)) errors.prixModele = 'Prix invalide.'
  if (f.marquage && badPrice(f.marquage.prix)) errors.prixMarquage = 'Prix invalide.'
  if (f.marquage && !filled(f.marquageTexte)) errors.marquageTexte = 'Indiquez le texte à graver.'
  if (f.options.some(o => badPrice(o.prix))) errors.options = 'Prix invalide.'
  const acompte = parseEuro(f.acompte)
  const total = obutTotal(f)
  if (filled(f.acompte) && (acompte == null || acompte < 0)) errors.acompte = 'Montant invalide.'
  else if (acompte != null && total != null && acompte > total) errors.acompte = 'L’acompte dépasse le total.'
  return errors
}

// Données enregistrées : les prix sont figés dans la commande (un changement de tarif ne la modifie pas)
export function obutPayload(f) {
  const text = v => String(v ?? '').trim() || null
  const total = obutTotal(f)
  return {
    clientNom: text(f.clientNom), clientPrenom: text(f.clientPrenom), clientTel: text(f.clientTel),
    dateCommande: f.dateCommande || null, vendeur: text(f.vendeur),
    modeleId: f.modele?.id || null, modele: f.modele?.label || null, prixModele: parseEuro(f.modele?.prix),
    diametre: text(f.diametre), strie: text(f.strie), poids: text(f.poids),
    marquageId: f.marquage?.id || null, marquageLabel: f.marquage?.label || null,
    marquage: f.marquage ? text(f.marquageTexte) : null, prixMarquage: f.marquage ? parseEuro(f.marquage.prix) : null,
    options: f.options.map(o => ({ id: o.id, label: o.label, prix: parseEuro(o.prix) })),
    totalTTC: total, acompte: parseEuro(f.acompte), resteARegler: obutRemaining(f),
    // Anciens champs remplacés par marquageLabel et options
    marquageType: null, prixLivraison: null,
  }
}

// Recherche : client, téléphone, modèle, marquage
export function obutMatches(cmd, needle) {
  const q = needle.trim().toLowerCase()
  if (!q) return true
  const hay = [cmd.clientNom, cmd.clientPrenom, cmd.clientTel, cmd.modele, cmd.marquage, cmd.vendeur]
    .filter(Boolean).join(' ').toLowerCase()
  const compact = q.replace(/[\s.-]/g, '')
  return hay.includes(q) || (compact.length > 0 && hay.replace(/[\s.-]/g, '').includes(compact))
}

export function obutClientName(cmd) {
  return [cmd.clientNom, cmd.clientPrenom].filter(Boolean).join(' ')
}
