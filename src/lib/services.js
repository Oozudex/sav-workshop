// Services partenaires : formulaire, liens et identifiants par magasin

export const EMPTY_SERVICE = {
  label: '', description: '', url: '', procedureUrl: '', color: 'emerald', usesCredentials: false,
}

// Lien absolu http(s) uniquement (pas de javascript:, pas de lien relatif)
export function isHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Ajoute https:// quand on colle « drive.google.com/… »
export function normalizeUrl(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
}

export function serviceFormErrors(form) {
  const errors = {}
  if (!form.label?.trim()) errors.label = 'Le nom est obligatoire.'
  if (form.url?.trim() && !isHttpUrl(normalizeUrl(form.url))) errors.url = 'Lien invalide (ex. https://www.upway.fr).'
  if (form.procedureUrl?.trim() && !isHttpUrl(normalizeUrl(form.procedureUrl))) errors.procedureUrl = 'Lien invalide (ex. https://drive.google.com/…).'
  return errors
}

// Données enregistrées dans services/{id}
export function servicePayload(form) {
  return {
    label: form.label.trim(),
    description: form.description?.trim() || null,
    url: normalizeUrl(form.url) || null,
    procedureUrl: normalizeUrl(form.procedureUrl) || null,
    color: form.color || 'emerald',
    usesCredentials: !!form.usesCredentials,
  }
}

export const hasCredential = c => !!(c?.login?.trim() || c?.password)

// Découpe la saisie { [magasinId]: { login, password } } en écritures :
// les magasins remplis sont enregistrés, les autres supprimés.
export function credentialWrites(creds) {
  const set = []
  const remove = []
  for (const [magasinId, c] of Object.entries(creds)) {
    if (hasCredential(c)) set.push({ magasinId, data: { login: c.login?.trim() || '', password: c.password || '' } })
    else remove.push(magasinId)
  }
  return { set, remove, storeIds: set.map(s => s.magasinId) }
}

// Accès du magasin de l'utilisateur à un service
export function serviceAccess(service, { isGlobal, magasinId }) {
  if (!service.usesCredentials) return 'none'          // pas d'identifiants : pas de cadenas
  if (isGlobal) return 'all'                            // voit les identifiants de tous les magasins
  return magasinId && service.credentialStoreIds?.includes(magasinId) ? 'mine' : 'missing'
}

export function sortServices(list) {
  return [...list].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.label || '').localeCompare(b.label || '', 'fr'))
}
