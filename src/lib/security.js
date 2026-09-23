// Échappe une valeur avant de l'insérer dans du HTML construit à la main
// (ex. fenêtre d'impression ouverte avec document.write)
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Ne laisse passer que les liens http(s), mailto et tel.
// Bloque notamment les URL `javascript:` saisies par un utilisateur.
export function safeUrl(url) {
  if (!url) return undefined
  try {
    const parsed = new URL(String(url).trim(), window.location.origin)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.href : undefined
  } catch {
    return undefined
  }
}

// Mot de passe temporaire robuste (remplacé ensuite via l'email de réinitialisation)
export function randomPassword(length = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, length) + 'A9!'
}
