// Todo list des rayons : tâches ajoutées par l'équipe, tâches automatiques (OP, atelier),
// tâches récurrentes et mot du soir ; liste personnelle des acheteurs et de la direction.
// Fonctions pures (tests/unit/todos.test.mjs).
import { opRayons } from './opSearch.js'
import { GLOBAL_ROLES } from './constants.js'
import { transferNextStep, transferSides } from './transferts.js'
import { etapeDemande } from './balises.js'
import { budgetEcheance, exportAFaire } from './budgets.js'

export const TODO_COLLECTION = 'todos'
export const RECURRENCE_COLLECTION = 'todo_recurrences'
export const MOT_COLLECTION = 'mots_du_soir'
// Liste personnelle : sous-collections de users/{uid}
export const TODO_PERSO_COLLECTION = 'todos_perso'
export const RECURRENCE_PERSO_COLLECTION = 'recurrences_perso'

// Acheteurs, direction générale et administrateurs : liste personnelle (ils travaillent seuls) ;
// l'administrateur peut aussi regarder les listes des équipes (equipes)
export const todoPerso = (profile, { equipes = false } = {}) => GLOBAL_ROLES.includes(profile?.role) && !(equipes && profile?.isAdmin)

// Délais
export const RELANCE_PRET_JOURS = 7         // vélo prêt à rendre depuis 7 jours : relancer le client
export const HISTORIQUE_JOURS = 30          // tâches terminées gardées 30 jours
export const MOT_VALIDITE_HEURES = 36       // le mot du soir reste affiché jusqu'au lendemain soir

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] // index 0 = lundi

// ── Dates (chaînes 'YYYY-MM-DD', jour local) ────────────────────────────────
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s, n) {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
// Lundi = 0 … dimanche = 6
export function weekdayIndex(s) {
  return (parseYmd(s).getDay() + 6) % 7
}
export function fmtJour(s) {
  const [, m, d] = String(s || '').split('-')
  return d ? `${d}/${m}` : ''
}

// ── Identifiants des tâches automatiques (un document par tâche, créé une seule fois) ──
const safe = v => String(v).replace(/[/\s]+/g, '_')
export const todoAutoId = (type, refId, magasinId, rayon) => safe(`${type}_${refId}_${magasinId}_${rayon}`)

// OP visible pour un rayon d'un magasin (même règle que pour les vendeurs)
export function opConcerne(op, magasinId, rayon) {
  const rayons = opRayons(op)
  if (rayons.length && !rayons.includes(rayon)) return false
  if (op.magasinIds?.length && !op.magasinIds.includes(magasinId)) return false
  return true
}

/**
 * Tâches automatiques des OP pour un rayon d'un magasin, le jour même : le jour du début
 * (mise en place) et le jour de la fin (fin de l'OP). Elles restent jusqu'à ce qu'on les coche,
 * ou jusqu'à la fin de l'OP pour la mise en place.
 */
export function opTodoSpecs(ops, { magasinId, rayon, today }) {
  const out = []
  for (const op of ops) {
    if (!op.dateDebut || !op.dateFin || !opConcerne(op, magasinId, rayon)) continue
    if (today >= op.dateDebut && today <= op.dateFin) {
      out.push({
        id: todoAutoId('op_debut', op.id, magasinId, rayon),
        titre: `Mettre en place l’OP « ${op.nom} »`,
        echeance: op.dateDebut,
        auto: { type: 'op_debut', refId: op.id },
      })
    }
    if (today >= op.dateFin && today <= addDays(op.dateFin, 7)) {
      out.push({
        id: todoAutoId('op_fin', op.id, magasinId, rayon),
        titre: `J’ai bien mis fin à l’OP « ${op.nom} »`,
        echeance: op.dateFin,
        auto: { type: 'op_fin', refId: op.id },
      })
    }
  }
  return out
}

/**
 * Vélos prêts à rendre depuis 7 jours : relancer le client. Sans le nom du client (RGPD) :
 * le numéro de ticket suffit pour retrouver la fiche.
 * tickets : { id, ticketNumber, status, readySince: Date }
 */
export function atelierTodoSpecs(tickets, { magasinId, today }) {
  const limite = addDays(today, -RELANCE_PRET_JOURS)
  return tickets
    .filter(t => t.status === 'Ready' && t.readySince && ymd(t.readySince) <= limite)
    .map(t => ({
      id: todoAutoId('atelier', t.id, magasinId, 'velo'),
      titre: `Relancer le client du ticket ${t.ticketNumber || ''} : vélo prêt depuis le ${fmtJour(ymd(t.readySince))}`.replace('  ', ' '),
      auto: { type: 'atelier', refId: t.id },
    }))
}

/**
 * Transferts de vélos où c'est au magasin d'agir (répondre, envoyer, confirmer la réception, classer).
 * Une tâche par étape : quand le transfert avance, la suivante remplace la précédente.
 */
const TRANSFERT_TITRES = {
  respond: (t, s) => `Répondre à la demande de transfert « ${t.modele} » pour ${s.receiverNom || 'un autre magasin'}`,
  ship:    (t, s) => `Envoyer « ${t.modele} » à ${s.receiverNom || 'l’autre magasin'} et le marquer envoyé`,
  receive: (t, s) => `Confirmer la réception de « ${t.modele} » envoyé par ${s.senderNom || 'l’autre magasin'}`,
  close:   t => `Classer la demande refusée pour « ${t.modele} »`,
}
export function transfertTodoSpecs(transferts, { magasinId }) {
  const out = []
  for (const t of transferts) {
    const step = transferNextStep(t, { magasinId, canAct: true })
    if (!step.mine || !TRANSFERT_TITRES[step.action]) continue
    out.push({
      id: todoAutoId(`transfert_${step.action}`, t.id, magasinId, 'velo'),
      titre: TRANSFERT_TITRES[step.action](t, transferSides(t)),
      auto: { type: 'transfert', refId: t.id },
    })
  }
  return out
}

/**
 * Demandes de balises où c'est au magasin d'agir (répondre, envoyer, confirmer la réception), une tâche
 * par étape comme les transferts de vélos ; et relance du demandeur si rien ne bouge depuis 2 jours
 * (pas de réponse, ou balise acceptée mais pas encore partie).
 */
export const BALISE_RELANCE_JOURS = 2
const BALISE_TITRES = {
  respond: d => `Répondre à la demande de balise « ${d.baliseNom} » de ${d.toMagasinNom || 'un autre magasin'}`,
  ship:    d => `Envoyer la balise « ${d.baliseNom} » à ${d.toMagasinNom || 'l’autre magasin'} et la marquer envoyée`,
  receive: d => `Confirmer la réception de la balise « ${d.baliseNom} » envoyée par ${d.fromMagasinNom || 'l’autre magasin'}`,
}
const BALISE_RELANCES = {
  pending:  { depuis: 'createdAt', titre: d => `Relancer ${d.fromMagasinNom || 'l’autre magasin'} : pas encore de réponse pour la balise « ${d.baliseNom} »` },
  accepted: { depuis: 'respondedAt', titre: d => `Relancer ${d.fromMagasinNom || 'l’autre magasin'} : la balise « ${d.baliseNom} » n’est pas encore partie` },
}
export function baliseTodoSpecs(demandes, { magasinId, now = Date.now() }) {
  const out = []
  for (const d of demandes) {
    const step = etapeDemande(d, magasinId)
    if (step.mine && BALISE_TITRES[step.action]) {
      out.push({
        id: todoAutoId(`balise_${step.action}`, d.id, magasinId, 'velo'),
        titre: BALISE_TITRES[step.action](d),
        auto: { type: 'balise', refId: d.id },
      })
    }
    const relance = BALISE_RELANCES[d.status]
    const depuis = relance && toMs(d[relance.depuis])
    if (d.toMagasinId === magasinId && depuis && now - depuis >= BALISE_RELANCE_JOURS * 86400000) {
      out.push({
        id: todoAutoId(`balise_relance_${d.status}`, d.id, magasinId, 'velo'),
        titre: relance.titre(d),
        auto: { type: 'balise', refId: d.id },
      })
    }
  }
  return out
}

// Tâches récurrentes du jour : une par récurrence active prévue ce jour-là
export function recurrenceSpecs(recurrences, { today }) {
  const jour = weekdayIndex(today)
  return recurrences
    .filter(r => r.actif !== false && (r.jours || []).includes(jour))
    .map(r => ({
      id: safe(`rec_${r.id}_${today}`),
      titre: r.titre,
      assigneA: r.assigneA || null,
      echeance: today,
      auto: { type: 'recurrente', refId: r.id },
    }))
}

// Acheteurs : budgets en fin de conservation (5 ans) à exporter avant leur échéance ; la tâche disparaît
// dès qu'un export est fait. budgets : [{ id, nom, annee, exportAt ('YYYY-MM-DD' ou null) }]
export function budgetExportTodoSpecs(budgets, { today }) {
  return budgets.filter(b => exportAFaire(b, b.exportAt, today)).map(b => {
    const echeance = budgetEcheance(b)
    return {
      id: safe(`budget_export_${b.id}`),
      titre: `Exporter ${b.nom} (Excel) : gardé 5 ans, il arrive à échéance le ${echeance.split('-').reverse().join('/')}`,
      echeance,
      auto: { type: 'budget_export', refId: b.id },
    }
  })
}

// Jours d'une récurrence en clair : « lun., mer. et ven. », « tous les jours »
export function joursLabel(jours = []) {
  const sorted = [...jours].sort((a, b) => a - b)
  if (sorted.length === 7) return 'tous les jours'
  if (sorted.length === 5 && sorted.every((j, i) => j === i)) return 'du lundi au vendredi'
  const noms = sorted.map(j => JOURS[j].slice(0, 3).toLowerCase() + '.')
  return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] || ''
}

// ── Affichage ───────────────────────────────────────────────────────────────
// Ordre : en retard, puis par échéance, puis les plus récentes
export function sortTodos(todos, today) {
  const rank = t => (t.echeance && t.echeance < today ? 0 : t.echeance ? 1 : 2)
  return [...todos].sort((a, b) => rank(a) - rank(b)
    || (a.echeance || '').localeCompare(b.echeance || '')
    || (toMs(b.createdAt) - toMs(a.createdAt)))
}

export function toMs(v) {
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? 0 : n
}

// Le mot du soir est encore d'actualité (écrit il y a moins de 36 h)
export function motRecent(mot, now = Date.now()) {
  const at = toMs(mot?.at)
  return !!mot?.texte && at > 0 && now - at < MOT_VALIDITE_HEURES * 3600000
}

// Tâche automatique dont la raison a disparu (ticket rendu, OP supprimée) et pas encore cochée
export function autoObsolete(todo, specIds) {
  return !!todo.auto && ['op_debut', 'op_fin', 'atelier', 'transfert', 'balise', 'budget_export'].includes(todo.auto.type) && !todo.fait && !specIds.has(todo.id)
}

// ── Tigre de la semaine ─────────────────────────────────────────────────────
// Lundi de la semaine d'une date
export function lundi(s) {
  return addDays(s, -weekdayIndex(s))
}

/**
 * Classement des personnes qui ont terminé le plus de tâches entre deux dates (incluses),
 * d'après « fait par ». → [{ nom, total }] du plus grand au plus petit.
 */
export function classement(todos, debut, fin) {
  const totals = new Map()
  for (const t of todos) {
    if (!t.fait || !t.faitPar) continue
    const jour = ymd(new Date(toMs(t.faitAt)))
    if (!toMs(t.faitAt) || jour < debut || jour > fin) continue
    totals.set(t.faitPar, (totals.get(t.faitPar) || 0) + 1)
  }
  return [...totals].map(([nom, total]) => ({ nom, total }))
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'))
}

// Tigre(s) de la semaine dernière (ex aequo possibles) : { noms, total, debut, fin } ou null
export function tigreDeLaSemaine(todos, today) {
  const debut = addDays(lundi(today), -7), fin = addDays(debut, 6)
  const rang = classement(todos, debut, fin)
  if (!rang.length) return null
  const total = rang[0].total
  return { noms: rang.filter(r => r.total === total).map(r => r.nom), total, debut, fin }
}
