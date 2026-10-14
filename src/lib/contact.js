// Bouton « Contact » de l'en-tête : un e-mail à l'administrateur de l'outil (tests/unit/contact.test.mjs).
// En attendant les tickets de réclamation dans l'outil.
export const CONTACT_EMAIL = 'sinivault@reseau-intersport.fr'

/**
 * Lien mailto prérempli : objet « Atelier SAV », et en bas du message la page et le compte d'où l'on écrit
 * (l'utilisateur peut tout modifier avant d'envoyer).
 */
export function lienContact({ page, compte, magasin } = {}) {
  const contexte = [page && `Page : ${page}`, compte && `Compte : ${[compte, magasin].filter(Boolean).join(' · ')}`].filter(Boolean)
  const corps = contexte.length ? `\n\n\n---\n${contexte.join('\n')}` : ''
  const params = [`subject=${encodeURIComponent(`Atelier SAV${page ? ` – ${page}` : ''}`)}`]
  if (corps) params.push(`body=${encodeURIComponent(corps)}`)
  return `mailto:${CONTACT_EMAIL}?${params.join('&')}`
}
