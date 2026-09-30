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
