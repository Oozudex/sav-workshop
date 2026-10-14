// Formulaire d'ajout / de modification d'un B2B (acheteurs et direction) : valeurs de départ,
// vérifications et données enregistrées dans b2b_tools/{id}. Fonctions pures : tests/unit/b2bForm.test.mjs
import { isHttpUrl, normalizeUrl } from './services.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Chiffres, espaces, points, tirets, parenthèses et « + » ; au moins 6 chiffres
const telValide = v => /^[+\d\s.()-]+$/.test(v) && (v.match(/\d/g) || []).length >= 6

export const DESCRIPTION_MAX = 80

export function b2bFormInitial(tool) {
  return {
    label: tool?.label ?? '',
    description: tool?.description ?? '',
    url: tool?.url ?? '',
    imageUrl: tool?.imageUrl ?? '',
    phones: (tool?.phones ?? []).map(p => ({ label: p.label || '', value: p.value || '' })),
    emails: (tool?.emails ?? []).map(e => ({ label: e.label || '', value: e.value || '' })),
    color: tool?.color ?? 'indigo',
    featured: !!tool?.featured,
    // Tous les magasins (storeIds vide) ou seulement certains
    tousLesMagasins: !tool?.storeIds?.length,
    storeIds: tool?.storeIds ?? [],
    // Univers concernés (vide = commun à tous)
    univers: tool?.univers ?? [],
  }
}

// Ligne de contact vide (ni libellé ni valeur) : ignorée
const remplie = c => c.label.trim() || c.value.trim()

/** Erreurs à afficher : { label, url, imageUrl, storeIds, phones: { [index]: message }, emails: { … } } */
export function b2bFormErrors(form) {
  const e = {}
  if (!form.label.trim()) e.label = 'Le nom est obligatoire.'
  if (form.description.trim().length > DESCRIPTION_MAX) e.description = `${DESCRIPTION_MAX} caractères au plus.`
  if (form.url.trim() && !isHttpUrl(normalizeUrl(form.url))) e.url = 'Lien invalide (ex. https://b2b.fournisseur.fr).'
  if (form.imageUrl.trim() && !isHttpUrl(normalizeUrl(form.imageUrl))) e.imageUrl = 'Adresse d’image invalide (ex. https://…/logo.png).'
  const phones = {}, emails = {}
  form.phones.forEach((p, i) => {
    if (!remplie(p)) return
    if (!p.value.trim()) phones[i] = 'Numéro manquant.'
    else if (!telValide(p.value.trim())) phones[i] = 'Numéro invalide.'
  })
  form.emails.forEach((m, i) => {
    if (!remplie(m)) return
    if (!m.value.trim()) emails[i] = 'E-mail manquant.'
    else if (!EMAIL.test(m.value.trim())) emails[i] = 'E-mail invalide.'
  })
  if (Object.keys(phones).length) e.phones = phones
  if (Object.keys(emails).length) e.emails = emails
  if (!form.tousLesMagasins && !form.storeIds.length) e.storeIds = 'Coche au moins un magasin, ou choisis « Tous les magasins ».'
  return e
}

const contacts = list => list.filter(remplie).map(c => ({ label: c.label.trim(), value: c.value.trim() }))

/** Données enregistrées (magasins dans l'ordre de la liste des magasins) */
export function b2bPayload(form, magasinIds = []) {
  return {
    label: form.label.trim(),
    description: form.description.trim() || null,
    url: normalizeUrl(form.url) || null,
    imageUrl: normalizeUrl(form.imageUrl) || null,
    phones: contacts(form.phones),
    emails: contacts(form.emails),
    color: form.color,
    featured: form.featured,
    storeIds: form.tousLesMagasins ? [] : magasinIds.filter(id => form.storeIds.includes(id)),
    univers: form.univers || [],
  }
}

// Initiales affichées quand le B2B n'a pas de logo : « MFC » → « MF », « Magura / MBPS » → « MM »
export function initialesB2B(label) {
  const mots = String(label || '').toUpperCase().split(/[\s/._&+-]+/).filter(Boolean)
  if (!mots.length) return '?'
  return (mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[1][0])
}

// Recherche sur la page B2B : nom, description, libellés et valeurs des contacts (sans accents ni casse)
const sansAccents = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function filtrerB2B(tools, recherche) {
  const q = sansAccents(recherche).trim()
  if (!q) return tools
  return tools.filter(t => sansAccents([t.label, t.description, ...(t.phones || []).flatMap(p => [p.label, p.value]),
    ...(t.emails || []).flatMap(e => [e.label, e.value])].join(' ')).includes(q))
}
