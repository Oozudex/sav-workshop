// RDV client du calendrier : champs obligatoires et passage en fiche atelier

export const RDV_DESCRIPTION_MIN = 15

export function phoneDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

// 0612345678 → « 06 12 34 56 78 » ; les autres formats sont laissés tels quels
export function formatPhone(v) {
  const s = String(v || '').trim()
  const d = phoneDigits(s)
  if (d.length === 10 && d.startsWith('0') && !s.startsWith('+')) return d.replace(/(\d{2})(?=\d)/g, '$1 ')
  return s
}

// Erreurs par champ ({} si le RDV est complet)
export function rdvClientErrors(form) {
  const errors = {}
  const name = String(form.customerName || '').trim()
  if (!name) errors.customerName = 'Indique le nom et le prénom du client.'
  else if (name.split(/\s+/).length < 2) errors.customerName = 'Indique le nom et le prénom du client.'
  const digits = phoneDigits(form.customerPhone)
  if (!digits) errors.customerPhone = 'Le numéro de téléphone est obligatoire.'
  else if (digits.length < 10 || digits.length > 15) errors.customerPhone = 'Numéro de téléphone invalide (10 chiffres).'
  const description = String(form.description || '').trim()
  if (!description) errors.description = 'Décris le problème du client.'
  else if (description.length < RDV_DESCRIPTION_MIN) errors.description = `Décris le problème plus en détail (${RDV_DESCRIPTION_MIN} caractères minimum).`
  return errors
}

// Valeurs pré-remplies de la fiche atelier créée depuis un RDV client
export function ticketPrefill(ev) {
  return {
    customerName: (ev?.customerName || '').trim(),
    customerPhone: formatPhone(ev?.customerPhone),
    issueDescription: (ev?.description || '').trim(),
  }
}

// ── Présence au RDV ──────────────────────────────────────────────────────────
// presence : 'venu' | 'absent' | null (pas encore pointé)
export const PRESENCE_LABELS = { venu: 'Venu', absent: 'Absent' }

// Le pointage n'a de sens qu'à partir du jour du RDV
export function canMarkPresence(ev, today) {
  return ev?.type === 'rdv_client' && !!ev.id && !!ev.date && ev.date <= today
}

// RDV passé (avant aujourd'hui) que personne n'a pointé
export function rdvToCheck(ev, today) {
  return ev?.type === 'rdv_client' && !ev.presence && !!ev.date && ev.date < today
}

// RDV manqués par le même numéro (du plus récent au plus ancien), hors RDV en cours d'édition
export function absencesFor(events, phone, excludeId = null) {
  const digits = phoneDigits(phone)
  if (digits.length < 10) return []
  return events
    .filter(e => e.id !== excludeId && e.type === 'rdv_client' && e.presence === 'absent' && phoneDigits(e.customerPhone) === digits)
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Nouveau RDV pour un client absent : mêmes informations, date à choisir
export function reschedulePrefill(ev) {
  return {
    type: 'rdv_client',
    customerName: (ev?.customerName || ev?.title || '').trim(),
    customerPhone: formatPhone(ev?.customerPhone),
    description: (ev?.description || '').trim(),
    rayonType: ev?.rayonType || null,
    rescheduledFrom: ev?.date || null,
  }
}

// ── OP du calendrier : une barre par OP sur toute sa durée, comme Google Agenda ──
// Dates 'YYYY-MM-DD' comptées en UTC : pas de décalage au changement d'heure
const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const addDaysStr = (s, n) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000)

/**
 * Barres des OP pour la semaine qui commence le lundi weekStart ('YYYY-MM-DD').
 * → [{ op, col (0 = lundi), span (jours), lane (ligne), avant, apres }] ; avant / apres : l'OP
 * commence avant la semaine ou continue après. Les OP sont rangées sur le moins de lignes possible,
 * les plus anciennes puis les plus longues en haut.
 */
export function opWeekBars(ops, weekStart) {
  const weekEnd = addDaysStr(weekStart, 6)
  const bars = ops
    .filter(op => op.dateDebut && op.dateFin && op.dateDebut <= weekEnd && op.dateFin >= weekStart)
    .map(op => {
      const debut = op.dateDebut < weekStart ? weekStart : op.dateDebut
      const fin = op.dateFin > weekEnd ? weekEnd : op.dateFin
      return { op, col: daysBetween(weekStart, debut), span: daysBetween(debut, fin) + 1, avant: op.dateDebut < weekStart, apres: op.dateFin > weekEnd }
    })
    .sort((a, b) => a.op.dateDebut.localeCompare(b.op.dateDebut) || b.op.dateFin.localeCompare(a.op.dateFin)
      || String(a.op.nom || '').localeCompare(String(b.op.nom || ''), 'fr'))
  const lanes = [] // dernière colonne occupée par ligne
  for (const bar of bars) {
    let lane = lanes.findIndex(last => last < bar.col)
    if (lane === -1) lane = lanes.length
    lanes[lane] = bar.col + bar.span - 1
    bar.lane = lane
  }
  return bars
}
