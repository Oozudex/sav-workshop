// ILV (étiquettes prix en rayon) : packs, calcul des prix affichés et textes de chaque modèle.
// Fonctions pures (tests/unit/ilv.test.mjs) ; le dessin du PDF est dans lib/ilvPdf.js.

export const PACKS = {
  enfant:     { label: 'Pack enfant',     prix: { 1: 9.99,  2: 15.98 } },
  classique:  { label: 'Pack classique',  prix: { 1: 19.99, 2: 31.98 } },
  sport:      { label: 'Pack sport',      prix: { 1: 39.99, 2: 63.98 } },
  electrique: { label: 'Pack électrique', prix: { 1: 59.99, 2: 95.98 } },
}

export const ILV_TYPES = {
  normal:  'ILV normale',
  promo:   'Prix promo',
  bonplan: 'Bons plans',
  engage:  'Prix engagé',
}

// Paiement Oney : montants acceptés (mentions légales de l'ILV)
export const ONEY = {
  3: { min: 80, max: 6000 },
  4: { min: 80, max: 6000 },
}

// Mentions légales Oney, découpées en lignes comme sur l'ILV Piivo
const oneyLines = n => [
  `*Exemple pour un achat en ${n} fois. Offre de financement sans assurance, réservée aux`,
  `particuliers et valable pour tout achat de 80€ à 6000€. Crédit affecté sur ${n} mois au`,
  'TAEG fixe de 0%. Coût du crédit 0€. Sous réserve d’acceptation par Oney Bank. Vous',
  'disposez d’un délai de 14 jours pour renoncer à votre crédit. Oney Bank - SA au capital',
  'de 71 801 205€ - 34 Avenue de Flandre 59170 Croix - 546 380 197 RCS Lille Métropole -',
  'n°Orias 07 023 261',
]
export const ONEY_MENTIONS = { 3: oneyLines(3), 4: oneyLines(4) }

// Les calculs se font en centimes pour éviter les erreurs d'arrondi (1499.99 + 39.99 = 1539.98)
const cents = v => Math.round(Number(v) * 100)
const euros = c => c / 100

function split(c) {
  const abs = Math.abs(c)
  return { int: String(Math.floor(abs / 100)), dec: String(abs % 100).padStart(2, '0') }
}

// « 1499.99€ » (lignes de détail)
export function fmtPoint(v) {
  const { int, dec } = split(cents(v))
  return `${int}.${dec}€`
}

// « 1499€99 » (prix conseillé, prix barré, mensualité Oney)
export function fmtEuroCents(v) {
  const { int, dec } = split(cents(v))
  return `${int}€${dec}`
}

// « -200€ », « -200€50 »
export function fmtRemise(v) {
  const { int, dec } = split(cents(v))
  return dec === '00' ? `-${int}€` : `-${int}€${dec}`
}

// Gros prix : partie entière, puis « € » et « .98 » empilés
export function bigPrice(v) {
  const { int, dec } = split(cents(v))
  return { int, dec: `.${dec}` }
}

export function fmtDateFr(iso) {
  const [y, m, d] = String(iso || '').split('-')
  return d ? `${d}/${m}/${y}` : ''
}

// « ALLROAD 450 » → « Allroad 450 » ; « CROSSOVER XV LTD » → « Crossover XV LTD »
export function titleName(nom) {
  return String(nom || '').trim().split(/\s+/).map(word => word.split('-').map(w => {
    if (/\d/.test(w) || (w.length <= 3 && /^[A-ZÀ-Ý]+$/.test(w))) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join('-')).join(' ')
}

export function packPrice(pack, duree = 1) {
  return PACKS[pack]?.prix[duree] ?? null
}

export function oneyAllowed(n, total) {
  const r = ONEY[n]
  return !!r && total >= r.min && total <= r.max
}

// Mensualité : arrondie au centime (1539.98 / 3 = 513.33 ; 2239.98 / 4 = 560.00)
export function oneyMonthly(total, n) {
  return euros(Math.round(cents(total) / n))
}

/**
 * Modèles d'ILV possibles pour un produit, du plus prioritaire au moins prioritaire :
 * un prix engagé s'impose toujours ; sinon promo (produit dans une OP), bons plans, normale.
 */
export function ilvTypesFor({ prixEngage, prixOp, prixBonPlan, prixFort }) {
  if (prixEngage != null) return ['engage']
  const types = []
  if (prixOp != null) types.push('promo')
  if (prixBonPlan != null) types.push('bonplan')
  if (prixFort != null) types.push('normal')
  return types
}

/**
 * Contenu d'une ILV : prix calculés (pack inclus) et textes prêts à dessiner.
 * p : { type, nom, marque, reference, prixFort, prixOp, prixBonPlan, prixEngage, pack, dateDebut, dateFin }
 * options : { duree: 1 | 2 (pack 1 an / 2 ans), oney: null | 3 | 4 (ILV normale uniquement) }
 * Renvoie { error } si une donnée manque.
 */
export function buildIlv(p, { duree = 1, oney = null } = {}) {
  const pack = packPrice(p.pack, duree)
  if (pack == null) return { error: 'Pack optionnel non renseigné pour ce produit.' }
  if (p.prixFort == null) return { error: 'Prix fort non renseigné pour ce produit.' }

  const nom = String(p.nom || '').trim().toUpperCase()
  const base = {
    type: p.type,
    marque: p.marque || '',
    refLine: `Réf. :  ${p.reference || ''} / ${titleName(p.nom)}`,
    packLine: `PRIX PACK OPTIONNEL ${fmtPoint(pack)}`,
    prixLine: `PRIX ${nom} : ${fmtPoint(p.prixFort)}`,
  }
  const plusPack = v => euros(cents(v) + cents(pack))

  switch (p.type) {
    case 'normal': {
      const total = plusPack(p.prixFort)
      const n = oney && oneyAllowed(oney, total) ? oney : null
      return {
        ...base,
        big: bigPrice(total),
        lines: [base.prixLine, base.packLine],
        oney: n && { n, monthly: fmtEuroCents(oneyMonthly(total, n)), mentions: ONEY_MENTIONS[n] },
      }
    }
    case 'promo': {
      if (p.prixOp == null) return { error: 'Prix OP manquant.' }
      // Règle légale : un prix bon plan déjà en place (et plus cher que l'OP) devient le prix de référence
      const refBonPlan = p.prixBonPlan != null && p.prixBonPlan > p.prixOp
      const barre = plusPack(refBonPlan ? p.prixBonPlan : p.prixFort)
      const total = plusPack(p.prixOp)
      return {
        ...base,
        barre: fmtEuroCents(barre),
        remise: fmtRemise(euros(cents(barre) - cents(total))),
        big: bigPrice(total),
        lines: [
          base.prixLine,
          ...(refBonPlan ? [`PRIX BON PLAN : ${fmtPoint(p.prixBonPlan)}`] : []),
          `PRIX PROMO : ${fmtPoint(p.prixOp)}`,
          base.packLine,
        ],
        dates: p.dateDebut && p.dateFin ? `Du ${fmtDateFr(p.dateDebut)} au ${fmtDateFr(p.dateFin)}` : '',
      }
    }
    case 'bonplan':
    case 'engage': {
      const prix = p.type === 'engage' ? p.prixEngage : p.prixBonPlan
      if (prix == null) return { error: p.type === 'engage' ? 'Prix engagé manquant.' : 'Prix bon plan manquant.' }
      return {
        ...base,
        conseille: `Prix conseillé : ${fmtEuroCents(plusPack(p.prixFort))}`,
        big: bigPrice(plusPack(prix)),
        lines: [base.prixLine, `${p.type === 'engage' ? 'PRIX ENGAGÉ' : 'PRIX BON PLAN'} : ${fmtPoint(prix)}`, base.packLine],
      }
    }
    default:
      return { error: 'Modèle d’ILV inconnu.' }
  }
}
