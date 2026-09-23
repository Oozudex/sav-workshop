// Historique des tickets : règles d'écriture (fonctions pures, tests/unit/ticketHistory.test.mjs)

// En dessous de ce délai, un nouveau changement de statut corrige le précédent
// (mauvaise colonne dans le tableau) au lieu de s'ajouter à l'historique.
export const QUICK_STATUS_CHANGE_MS = 60 * 1000

export function statusOfEntry(entry) {
  return entry?.action === 'status' ? /Statut → (\w+)/.exec(entry.note || '')?.[1] || null : null
}

/**
 * Historique après un changement de statut `fromStatus` → `toStatus`.
 * Si la dernière entrée est un changement de statut de moins d'une minute, elle est remplacée
 * (seul le statut final compte) ; si l'on revient au statut d'avant, elle est simplement retirée.
 */
export function withStatusChange(history, fromStatus, toStatus, entry, now = Date.now()) {
  const list = [...(history || [])]
  const last = list.at(-1)
  const lastAt = last ? new Date(last.at).getTime() : NaN

  if (statusOfEntry(last) && now - lastAt < QUICK_STATUS_CHANGE_MS) {
    list.pop()
    const before = last.from
      ?? statusOfEntry([...list].reverse().find(h => statusOfEntry(h)))
      ?? 'New'
    return before === toStatus ? list : [...list, { ...entry, from: before }]
  }
  return [...list, { ...entry, from: fromStatus }]
}

// Extrait d'un commentaire tel qu'il apparaît dans l'historique
export function commentExcerpt(text) {
  const t = String(text || '').trim()
  return t.length > 120 ? `${t.slice(0, 117)}…` : t
}

// Entrée d'historique d'un commentaire : par identifiant, ou (anciennes entrées) par auteur + extrait
function matchesComment(entry, comment) {
  if (entry?.action !== 'comment') return false
  if (entry.commentId) return entry.commentId === comment.id
  return entry.by === comment.author && entry.note === commentExcerpt(comment.text)
}

// Historique après modification d'un commentaire : l'extrait suit le nouveau texte
export function withCommentEdited(history, comment, newText) {
  let done = false
  return (history || []).map(h => {
    if (done || !matchesComment(h, comment)) return h
    done = true
    return { ...h, note: commentExcerpt(newText) }
  })
}

// Historique après suppression d'un commentaire : son extrait disparaît
export function withCommentRemoved(history, comment) {
  const list = [...(history || [])]
  const i = list.findIndex(h => matchesComment(h, comment))
  if (i >= 0) list.splice(i, 1)
  return list
}
