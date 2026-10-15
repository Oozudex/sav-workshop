// Balises de diagnostic des vélos : elles appartiennent au groupe et passent de magasin en magasin.
// On suit seulement où elle est : dans le magasin qui l'a reçue en dernier. Un autre magasin la demande,
// celui qui l'a accepte et l'envoie, le demandeur confirme la réception et la balise est chez lui.
// Fonctions pures : tests/unit/balises.test.mjs
export const BALISE_COLLECTION = 'balises'
export const BALISE_TRANSFERT_COLLECTION = 'balise_transferts'

// Balise acceptée ou en route : elle part vers le magasin qui l'a demandée
export const enTransfert = demande => !!demande && ['accepted', 'shipped'].includes(demande.status)

// Demandes : fromMagasinId = magasin qui a la balise (il envoie), toMagasinId = magasin qui la demande (il reçoit)
export const DEMANDE_STATUTS = {
  pending:   { label: 'Demandée', pill: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/30' },
  accepted:  { label: 'Acceptée · à envoyer', pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30' },
  shipped:   { label: 'En route', pill: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' },
  completed: { label: 'Reçue', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  refused:   { label: 'Refusée', pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30' },
  cancelled: { label: 'Annulée', pill: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700' },
}
export const DEMANDE_ACTIVES = ['pending', 'accepted', 'shipped']
export const ETAPES_DEMANDE = ['Demande', 'Réponse', 'Envoi', 'Réception']
export const etapesFranchies = d => ({ pending: 1, accepted: 2, refused: 2, cancelled: 1, shipped: 3, completed: 4 }[d.status] || 1)

// Types proposés à la création (on peut en taper un autre)
export const TYPES_SUGGERES = ['Bosch', 'Shimano', 'Yamaha', 'Brose', 'Bafang', 'Giant', 'Specialized', 'Fazua', 'TQ']

// ── Droits ──────────────────────────────────────────────────────────────────
// Fiches des balises : l'administrateur et l'acheteur qui a l'univers CYCLE (users/{uid}.univers) ;
// côté application, l'administrateur est un « directeurgen » avec isAdmin, cf. store/useAuth.js
export const UNIVERS_CYCLE = 'CYCLE'
export const peutGererBalises = profile => profile?.role === 'admin' || profile?.isAdmin === true
  || (profile?.role === 'acheteur' && (profile.univers || []).includes(UNIVERS_CYCLE))
// Comptes d'un magasin (rayons, directeur) : demandent, répondent, envoient, reçoivent
const LOCAUX = ['velo', 'chaussure', 'textile', 'randonnee', 'caisse', 'directeurmag']
export const estCompteMagasin = profile => LOCAUX.includes(profile?.role) && !!profile?.magasinId
// Acheteur, direction, administrateur : débloquent une demande (annulation)
export const estGlobal = profile => ['acheteur', 'directeurgen', 'admin'].includes(profile?.role)

export const nomBalise = b => [b?.type, b?.nom].filter(Boolean).join(' · ') || 'Balise'

// Demande en cours sur chaque balise : Map baliseId → demande
export function demandesActivesParBalise(demandes) {
  const m = new Map()
  for (const d of demandes || []) if (DEMANDE_ACTIVES.includes(d.status)) m.set(d.baliseId, d)
  return m
}

/**
 * Le magasin peut-il demander cette balise ? → null si oui, sinon la raison.
 * Pas la sienne, pas déjà demandée par quelqu'un.
 */
export function raisonPasDemande(balise, demande, profile) {
  if (!estCompteMagasin(profile)) return 'Seuls les comptes des magasins demandent une balise.'
  if (balise.magasinId === profile.magasinId) return 'Cette balise est déjà dans ton magasin.'
  if (demande?.toMagasinId === profile.magasinId) return 'Tu l’as déjà demandée : suis ta demande dans la page.'
  if (demande) return `Déjà demandée par ${demande.toMagasinNom || 'un autre magasin'}.`
  return null
}

/**
 * Ce que le magasin doit faire sur une demande :
 * { action: 'respond' | 'ship' | 'receive' | 'cancel' | null, mine, texte }
 */
export function etapeDemande(d, magasinId) {
  const envoie = d.fromMagasinId === magasinId, recoit = d.toMagasinId === magasinId
  const de = d.fromMagasinNom || 'l’autre magasin', vers = d.toMagasinNom || 'l’autre magasin'
  if (d.status === 'pending') {
    if (envoie) return { action: 'respond', mine: true, texte: `${vers} demande cette balise : accepte ou refuse.` }
    if (recoit) return { action: 'cancel', mine: false, texte: `En attente de la réponse de ${de}.` }
    return { action: null, mine: false, texte: `${vers} l’a demandée à ${de}.` }
  }
  if (d.status === 'accepted') {
    if (envoie) return { action: 'ship', mine: true, texte: `Envoie la balise à ${vers}, puis marque-la envoyée.` }
    return { action: null, mine: false, texte: `${de} prépare l’envoi.` }
  }
  if (d.status === 'shipped') {
    if (recoit) return { action: 'receive', mine: true, texte: 'La balise est en route : confirme sa réception dès qu’elle arrive.' }
    return { action: null, mine: false, texte: `En route vers ${vers}.` }
  }
  if (d.status === 'refused') return { action: null, mine: false, texte: `Refusée par ${de}${d.motif ? ` : ${d.motif}` : ''}.` }
  if (d.status === 'cancelled') return { action: null, mine: false, texte: 'Demande annulée.' }
  return { action: null, mine: false, texte: `Reçue par ${vers}.` }
}

/**
 * Grille « d'un coup d'œil » : une ligne par type, une colonne par magasin.
 * → { types: [{ type, total, cellules: { [magasinId]: balises } }], magasins }
 * filtreType : n'affiche que ce type (null = tous).
 */
export function grilleBalises(balises, magasins, { filtreType = null } = {}) {
  const fr = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr')
  const parType = new Map()
  for (const b of balises || []) {
    const type = b.type || 'Autre'
    if (filtreType && type !== filtreType) continue
    if (!parType.has(type)) parType.set(type, { type, total: 0, cellules: {} })
    const ligne = parType.get(type)
    ligne.total++
    ;(ligne.cellules[b.magasinId] ||= []).push(b)
  }
  const types = [...parType.values()].sort((a, b) => fr(a.type, b.type))
  types.forEach(l => Object.values(l.cellules).forEach(c => c.sort((a, b) => fr(a.nom, b.nom))))
  return { types, magasins: [...(magasins || [])].sort((a, b) => fr(a.nom, b.nom)) }
}

// Types déjà utilisés, pour le filtre et les suggestions
export function typesBalises(balises) {
  return [...new Set((balises || []).map(b => b.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'))
}

// ── Fiche d'une balise (acheteur, administrateur) ───────────────────────────
// magasinId : magasin de la balise (modification) ; magasinIds : magasins cochés à la création,
// une balise du même nom par magasin
export const baliseFormInitial = b => ({
  type: b?.type || '', nom: b?.nom || '', numeroSerie: b?.numeroSerie || '',
  magasinId: b?.magasinId || '', magasinIds: [], note: b?.note || '',
})

export function baliseFormErrors(f, { creation = false } = {}) {
  const e = {}
  if (!f.type.trim()) e.type = 'Indique le type (Bosch, Shimano…).'
  if (!f.nom.trim()) e.nom = 'Donne-lui un nom pour la reconnaître (ex. « Bosch n° 2 »).'
  if (creation ? !f.magasinIds?.length : !f.magasinId) {
    e.magasinId = creation ? 'Coche au moins un magasin.' : 'Choisis le magasin où elle se trouve.'
  }
  if (f.note.length > 300) e.note = '300 caractères au plus.'
  return e
}

export function balisePayload(f, magasins = []) {
  const t = v => String(v ?? '').trim()
  return {
    type: t(f.type), nom: t(f.nom), numeroSerie: t(f.numeroSerie) || null,
    magasinId: f.magasinId, magasinNom: magasins.find(m => m.id === f.magasinId)?.nom || null,
    note: t(f.note) || null,
  }
}

// Création : une balise par magasin coché (mêmes type, nom et note). Le n° de série est propre à
// une balise : il n'est repris que si un seul magasin est coché.
export function balisesACreer(f, magasins = []) {
  const ids = magasins.map(m => m.id).filter(id => f.magasinIds.includes(id))
  return ids.map(id => balisePayload({ ...f, magasinId: id, numeroSerie: ids.length > 1 ? '' : f.numeroSerie }, magasins))
}
