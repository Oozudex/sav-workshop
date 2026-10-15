// ILV 10×20 (onglet des OP) : chevalets 20 × 10 cm, deux faces sur une feuille A4 à plier.
// Modèles, montants saisis par le vendeur et droits d'accès. Fonctions pures : tests/unit/ilv1020.test.mjs
// Le dessin est dans ilv1020Pdf.js.

export const MODELES_1020 = [
  { id: 'promo', label: 'Promo', montant: true, exemple: 20 },
  { id: 'bons_plans', label: 'Bons plans', montant: true, exemple: 20 },
  { id: 'soldes', label: 'Soldes', montant: true, exemple: 200 },
  { id: 'carte_cadeau', label: 'Carte cadeau offerte', montant: true, exemple: 100 },
  { id: 'prix_promo', label: 'Prix promo', montant: false },
  { id: 'presque_parfait', label: 'Les vélos (presque) parfaits', montant: false },
]
export const modele1020 = id => MODELES_1020.find(m => m.id === id) || null

export const MONTANT_MAX = 9999
export const QUANTITE_MAX = 20

/** Montant saisi (« 20 », « 20 € », « 1 000 ») → euros entiers, ou null s'il est vide ou invalide */
export function lireMontant(saisie) {
  const s = String(saisie ?? '').replace(/[\s€]/g, '')
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= MONTANT_MAX ? n : null
}

/** Message à afficher sous le champ, ou null si le montant est bon */
export function erreurMontant(saisie) {
  const s = String(saisie ?? '').trim()
  if (!s) return 'Indique le montant.'
  if (lireMontant(s) === null) return `Un montant en euros, sans centimes, de 1 à ${MONTANT_MAX} €.`
  return null
}

/** Textes variables d'un chevalet : { grand, petit } (montant sans espace, comme sur les modèles) */
export function textes1020(id, montant) {
  if (id === 'promo' || id === 'soldes' || id === 'bons_plans') return { grand: `-${montant}€` }
  if (id === 'carte_cadeau') return { grand: `${montant}€ OFFERTS`, petit: 'EN CARTE CADEAU*' }
  return {}
}

/** Libellé d'une ligne de la liste (« Promo -20 € », « Prix promo ») */
export function libelle1020({ modele, montant }) {
  const m = modele1020(modele)
  if (!m) return ''
  if (!m.montant) return m.label
  return modele === 'carte_cadeau' ? `Carte cadeau ${montant} € offerts` : `${m.label} -${montant} €`
}

/** Lignes de la liste → une page par exemplaire, dans l'ordre */
export function pages1020(lignes) {
  return (lignes || []).flatMap(l => {
    const m = modele1020(l.modele)
    if (!m || (m.montant && !lireMontant(l.montant))) return []
    const n = Math.min(QUANTITE_MAX, Math.max(1, Math.floor(Number(l.quantite) || 1)))
    return Array.from({ length: n }, () => ({ modele: m.id, montant: m.montant ? lireMontant(l.montant) : null }))
  })
}

// Rayon vélo et au-dessus : directeur de magasin, acheteur vélo, direction générale, administrateur
export function peutFaireIlv1020(profile) {
  const role = profile?.role
  if (role === 'acheteur') return (profile.rayons || []).includes('velo')
  return ['velo', 'directeurmag', 'directeurgen', 'admin'].includes(role)
}
