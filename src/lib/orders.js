// Commandes clients du rayon vélo : statuts, formats et seuils d'alerte.
// Fonctions pures : testées dans tests/unit/orders.test.mjs
import { toDate } from './ticketStats.js'

const DAY = 24 * 60 * 60 * 1000
const days = ms => ms / DAY

// ── Statuts : le parcours réel d'une commande client ─────────────────────────
export const ORDER_STATUSES = ['a-commander', 'commandee', 'recue', 'client-prevenu', 'retiree', 'annulee']
export const ORDER_OPEN_STATUSES = ['a-commander', 'commandee', 'recue', 'client-prevenu']

export const ORDER_STATUS_META = {
  'a-commander':    { label: 'À commander',      hint: 'Commande pas encore passée au fournisseur', dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20' },
  'commandee':      { label: 'Commandée',        hint: 'Passée chez le fournisseur, en attente de réception', dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20' },
  'recue':          { label: 'Reçue en magasin', hint: 'Arrivée, le client doit être appelé', dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20' },
  'client-prevenu': { label: 'Client prévenu',   hint: 'Client appelé, en attente de retrait', dot: 'bg-cyan-500',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20' },
  'retiree':        { label: 'Retirée',          hint: 'Remise au client', dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20' },
  'annulee':        { label: 'Annulée',          hint: 'Commande abandonnée', dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20' },
}

// Anciens statuts (avant la refonte) convertis à la lecture
const LEGACY_STATUS = { 'en-attente': 'a-commander', 'en-cours': 'commandee', 'livree': 'retiree' }

export function orderStatus(order) {
  const s = order?.statut
  return LEGACY_STATUS[s] || (ORDER_STATUS_META[s] ? s : 'a-commander')
}

export function isOrderOpen(order) {
  return ORDER_OPEN_STATUSES.includes(orderStatus(order)) && !order.anonymizedAt
}

// Depuis quand la commande est dans son statut actuel
export function orderStatusSince(order) {
  return toDate(order.statutAt) || toDate(order.updatedAt) || toDate(order.createdAt)
}

// Date d'une étape : statusDates (enregistré à chaque changement), sinon historique « Statut → Libellé »
export function orderStepDate(order, status) {
  const stored = toDate(order.statusDates?.[status])
  if (stored) return stored
  const label = ORDER_STATUS_META[status]?.label
  const entry = (order.history || []).filter(h => h.action === 'status' && h.note === `Statut → ${label}`).at(-1)
  return toDate(entry?.at)
}

// Date de fin (retrait ou annulation) ; repli sur statutAt / updatedAt pour les anciennes commandes
export function orderClosedDate(order) {
  if (isOrderOpen(order) && !order.anonymizedAt) return null
  return toDate(order.closedAt) || orderStepDate(order, orderStatus(order)) || toDate(order.statutAt) || toDate(order.updatedAt)
}

// Les commandes terminées restent affichées 14 jours, puis ne servent plus qu'aux statistiques
// (même délai que l'effacement des données client, cf. lib/cleanup.js)
export const ORDER_VISIBLE_DAYS = 14

export function isOrderListed(order, now = new Date()) {
  if (order.anonymizedAt) return false
  if (isOrderOpen(order)) return true
  const closed = orderClosedDate(order)
  return !closed || now - closed < ORDER_VISIBLE_DAYS * DAY
}

export const ORDER_TYPES = { velo: 'Vélo', piece: 'Pièce', accessoire: 'Accessoire' }

// ── Formats ──────────────────────────────────────────────────────────────────
// "1 200,50 €" → 1200.5 ; vide ou illisible → null
export function parseEuro(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  // \s couvre aussi les espaces insécables (séparateur de milliers français)
  const cleaned = String(value).replace(/[\s€]/g, '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function formatEuro(n) {
  return n == null || n === '' ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

// Reste à payer (null si pas de prix)
export function remainingToPay(order) {
  const prix = parseEuro(order.prix)
  if (prix == null) return null
  return Math.max(0, Math.round((prix - (parseEuro(order.acompte) || 0)) * 100) / 100)
}

// Les anciens numéros sont de simples compteurs ("0012"), les nouveaux incluent l'année
export function formatOrderNumber(numero) {
  if (!numero) return '—'
  return /^\d+$/.test(numero) ? `#${numero}` : numero
}

// Recherche : texte + téléphone et numéros comparés sans espaces
export function orderMatches(order, needle) {
  const q = needle.trim().toLowerCase()
  if (!q) return true
  const hay = [order.numero, order.client, order.tel, order.ref_produit, order.produit,
    order.fournisseur, order.refFournisseur, order.commentaire]
    .filter(Boolean).join(' ').toLowerCase()
  const compact = q.replace(/[\s.-]/g, '')
  return hay.includes(q) || (compact.length > 0 && hay.replace(/[\s.-]/g, '').includes(compact))
}

// Réception attendue dépassée
export function isLateDelivery(order, now = new Date()) {
  if (orderStatus(order) !== 'commandee' || !order.dateReceptionPrevue) return false
  const due = new Date(`${order.dateReceptionPrevue}T23:59:59.999`)
  return !Number.isNaN(due.getTime()) && due < now
}

// ── Seuils d'alerte (moteur : lib/alerts.js) ─────────────────────────────────
const inStatus = status => open => open.filter(o => orderStatus(o) === status)
const sinceStatus = (o, now) => days(now - orderStatusSince(o))
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

export const ORDER_ALERTS = {
  scope: 'orders',
  settingsId: 'orders',
  path: '/orders',
  title: 'Alertes des commandes clients',
  isOpen: isOrderOpen,
  rules: [
    {
      key: 'orderToPlaceDays', kind: 'duration', unit: 'jours', defaultThreshold: 2,
      label: 'Commandes pas encore passées',
      help: 'Temps passé dans le statut « À commander ».',
      measure: inStatus('a-commander'), age: sinceStatus,
      message: (n, s) => `${plural(n, 'commande')} pas encore ${n > 1 ? 'passées' : 'passée'} au fournisseur depuis plus de ${s} jours`,
    },
    {
      key: 'orderLateDays', kind: 'duration', unit: 'jours', defaultThreshold: 3,
      label: 'Réceptions en retard',
      help: 'Date de réception prévue dépassée, commande toujours pas reçue.',
      measure: (open, now) => open.filter(o => isLateDelivery(o, now)),
      age: (o, now) => days(now - new Date(`${o.dateReceptionPrevue}T23:59:59.999`)),
      message: (n, s) => `${plural(n, 'commande')} en retard de plus de ${s} jours chez le fournisseur`,
    },
    {
      key: 'orderToCallDays', kind: 'duration', unit: 'jours', defaultThreshold: 1,
      label: 'Clients pas encore prévenus',
      help: 'Temps passé dans le statut « Reçue en magasin ».',
      measure: inStatus('recue'), age: sinceStatus,
      message: (n, s) => `${plural(n, 'client')} pas encore ${n > 1 ? 'prévenus' : 'prévenu'} depuis plus de ${s} jours`,
    },
    {
      key: 'orderPickupDays', kind: 'duration', unit: 'jours', defaultThreshold: 10,
      label: 'Produits non retirés',
      help: 'Temps passé dans le statut « Client prévenu ».',
      measure: inStatus('client-prevenu'), age: sinceStatus,
      message: (n, s) => `${plural(n, 'produit')} non ${n > 1 ? 'retirés' : 'retiré'} depuis plus de ${s} jours`,
    },
  ],
}
