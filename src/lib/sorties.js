// Taux de sortie hebdomadaires (Statistiques Achats). Fonctions pures (tests/unit/sorties.test.mjs) :
// semaines ISO, reconnaissance des colonnes du fichier Excel, lecture des lignes en colonnes compactes,
// (dé)compression pour le stockage et tableau croisé (TCD) semaine N / même semaine N-1.
import { cleanText, parsePrice } from './opImport.js'

// ── Semaines ────────────────────────────────────────────────────────────────────

// Semaine ISO (lundi, semaine 1 = celle du premier jeudi) : { annee, semaine }
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const annee = d.getUTCFullYear()
  const semaine = Math.ceil(((d - Date.UTC(annee, 0, 1)) / 86400000 + 1) / 7)
  return { annee, semaine }
}

// Nombre de semaines ISO d'une année (52 ou 53)
export const weeksInYear = annee => isoWeek(new Date(annee, 11, 28)).semaine

export const semaineId = (annee, semaine) => `${annee}-S${String(semaine).padStart(2, '0')}`
export const semaineLabel = (annee, semaine) => `S${String(semaine).padStart(2, '0')} ${annee}`
export const semaineNom = (annee, semaine) => `TAUX DE SORTIE ${semaineLabel(annee, semaine)}`
// N-1 : même semaine de l'année précédente (la semaine 53 n'existe pas toujours : semaine 52)
export function semaineN1({ annee, semaine }) {
  return { annee: annee - 1, semaine: Math.min(semaine, weeksInYear(annee - 1)) }
}

// ── Colonnes ────────────────────────────────────────────────────────────────────

// Axes du tableau croisé (ordre des filtres) et mesures du fichier
export const DIMS = [
  { key: 'magasin', label: 'Magasin', noms: ['MAGASIN', 'LIB MAGASIN', 'NOM MAGASIN', 'CODE MAGASIN', 'MAG', 'SITE', 'ETABLISSEMENT'] },
  { key: 'univers', label: 'Univers', noms: ['UNIVERS', 'LIB UNIVERS'] },
  { key: 'segment', label: 'Segment', noms: ['SEGMENT', 'LIB SEGMENT'] },
  { key: 'famille', label: 'Famille', noms: ['FAMILLE', 'LIB FAMILLE'] },
  { key: 'sousFamille', label: 'Sous-famille', noms: ['SOUS FAMILLE', 'SOUSFAMILLE', 'SS FAMILLE', 'LIB SOUS FAMILLE'] },
  { key: 'marque', label: 'Marque', noms: ['MARQUE', 'LIB MARQUE'] },
  { key: 'fournisseur', label: 'Fournisseur', noms: ['FOURNISSEUR', 'LIB FOURNISSEUR', 'FRS', 'FOURN'] },
  { key: 'modele', label: 'Modèle', noms: ['MODELE', 'LIB MODELE', 'DESIGNATION', 'LIBELLE'] },
  { key: 'reference', label: 'Référence', noms: ['REFERENCE', 'REF', 'CODE ARTICLE', 'ARTICLE', 'REF ARTICLE'] },
  { key: 'couleur', label: 'Couleur', noms: ['COULEUR', 'COLORIS', 'LIB COULEUR'] },
]
export const MEASURES = [
  { key: 'caNet', label: 'CANet', noms: ['CANET', 'CA NET'] },
  { key: 'mtMrg', label: 'MtMrg', noms: ['MTMRG', 'MT MRG', 'MONTANT MARGE'] },
  { key: 'qtRecep', label: 'QtRecep', noms: ['QTRECEP', 'QT RECEP', 'QTE RECEP'] },
  { key: 'qtVte', label: 'QtVte', noms: ['QTVTE', 'QT VTE', 'QTE VTE'] },
  { key: 'qtStkFin', label: 'QtStkFin', noms: ['QTSTKFIN', 'QT STK FIN', 'QTE STK FIN', 'STOCK FIN'] },
]
export const FIELDS = [...DIMS, ...MEASURES]
export const dimLabel = key => DIMS.find(d => d.key === key)?.label || key

const norm = v => cleanText(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const compact = v => norm(v).replace(/ /g, '')

// Ligne d'en-tête : la première (sur 30) qui contient au moins 3 des mesures
export function findHeaderRow(rows) {
  const wanted = MEASURES.flatMap(m => m.noms.map(compact))
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] || []).map(compact)
    if (MEASURES.filter(m => m.noms.some(n => cells.includes(compact(n)))).length >= 3) return i
    if (cells.filter(c => wanted.includes(c)).length >= 3) return i
  }
  return -1
}

// Colonne de chaque champ (-1 : absente) : nom exact d'abord, puis début de nom
export function autoMapping(header) {
  const cells = header.map(norm)
  const used = new Set()
  const map = {}
  for (const f of FIELDS) {
    const noms = f.noms.map(norm)
    let j = cells.findIndex((c, k) => !used.has(k) && (noms.includes(c) || noms.includes(c.replace(/ /g, ''))))
    if (j < 0) j = cells.findIndex((c, k) => !used.has(k) && noms.some(n => c.startsWith(`${n} `)))
    map[f.key] = j
    if (j >= 0) used.add(j)
  }
  return map
}

export const missingMeasures = mapping => MEASURES.filter(m => !(mapping[m.key] >= 0))

// ── Lecture ─────────────────────────────────────────────────────────────────────

// Lignes du fichier → jeu de données en colonnes : dims[clé] = valeurs distinctes, codes[clé][i] = indice
// de la valeur de la ligne i, meas[clé][i] = nombre. canon : { magasin: v => nom, univers: v => nom }
// pour rapprocher les libellés des listes du groupe. Lignes « TOTAL » et lignes vides ignorées.
export function parseSortie(rows, { headerRow, mapping, canon = {} }) {
  const dims = {}, codes = {}, index = {}, meas = {}
  for (const d of DIMS) { dims[d.key] = []; codes[d.key] = []; index[d.key] = new Map() }
  for (const m of MEASURES) meas[m.key] = []
  let n = 0, skipped = 0
  for (const row of rows.slice(headerRow + 1)) {
    if (!row || !row.some(c => cleanText(c))) continue
    const values = MEASURES.map(m => (mapping[m.key] >= 0 ? parsePrice(row[mapping[m.key]]) : null))
    const labels = DIMS.map(d => (mapping[d.key] >= 0 ? cleanText(row[mapping[d.key]]) : ''))
    // Lignes de total : libellé « TOTAL », ou ni magasin, ni univers, ni marque, ni modèle (dernière ligne de l'extraction)
    const sansAxe = ['magasin', 'univers', 'marque', 'modele'].every(k => !labels[DIMS.findIndex(d => d.key === k)])
    if (sansAxe || labels.some(l => /^(SOUS[- ]?)?TOTAL\b/i.test(l)) || values.every(v => v == null)) { skipped++; continue }
    DIMS.forEach((d, k) => {
      let v = labels[k]
      if (v && canon[d.key]) v = canon[d.key](v) || v
      v = v || '(vide)'
      let code = index[d.key].get(v)
      if (code == null) { code = dims[d.key].length; dims[d.key].push(v); index[d.key].set(v, code) }
      codes[d.key].push(code)
    })
    MEASURES.forEach((m, k) => meas[m.key].push(values[k] ?? 0))
    n++
  }
  return { n, dims, codes, meas, skipped }
}

export function datasetTotals(ds) {
  const t = {}
  for (const m of MEASURES) t[m.key] = Math.round(ds.meas[m.key].reduce((a, v) => a + v, 0) * 100) / 100
  return t
}

// ── Stockage compressé ──────────────────────────────────────────────────────────

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function gzipJson(obj) {
  return streamBytes(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('gzip'))
}

export async function gunzipJson(bytes) {
  return JSON.parse(new TextDecoder().decode(await streamBytes(bytes, new DecompressionStream('gzip'))))
}

// Découpe en morceaux de taille maximale (documents Firestore < 1 Mo)
export function chunkBytes(bytes, size) {
  const parts = []
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.subarray(i, i + size))
  return parts.length ? parts : [new Uint8Array(0)]
}

export function joinBytes(parts) {
  const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

// Recherche d'une semaine : « 42 » ou « S42 » → semaine 42, « 2025 » → année 2025, sinon dans le nom
export function matchSemaine(s, q) {
  return q.trim().toUpperCase().split(/\s+/).filter(Boolean).every(t => {
    const w = t.match(/^S?(\d{1,2})$/)
    if (w) return s.semaine === Number(w[1])
    if (/^\d{4}$/.test(t)) return s.annee === Number(t)
    return (s.nom || semaineNom(s.annee, s.semaine)).toUpperCase().includes(t)
  })
}

// ── Tableau croisé ──────────────────────────────────────────────────────────────

// Sommes : [CANet, MtMrg, QtRecep, QtVte, QtStkFin]
const KEYS = MEASURES.map(m => m.key)
export const emptySums = () => [0, 0, 0, 0, 0]

// Indicateurs d'une ligne : CA HT = CANet / 1,20 ; marge % = MtMrg / CA HT ;
// taux de sortie = QtVte / (QtVte + QtStkFin) : part de ce qu'on avait (vendu + restant) qui est sortie
// (rien vendu ni en stock : null)
export function indicateurs(s) {
  const [caNet, mtMrg, qtRecep, qtVte, qtStkFin] = s
  const caHt = caNet / 1.2
  const dispo = qtVte + qtStkFin
  return {
    caNet, mtMrg, qtRecep, qtVte, qtStkFin, caHt,
    marge: caHt ? mtMrg / caHt : null,
    taux: dispo > 0 ? qtVte / dispo : null,
  }
}

// Classement de lignes sœurs (ex. les magasins) sur un indicateur, indépendamment de l'évolution N-1 :
// pour chaque valeur, { pos, k, t } avec pos = 1 pour la meilleure (ex aequo : même rang), k = nombre de
// lignes classées et t de 1 (meilleure) à 0 (moins bonne), ex aequo au milieu de leurs places. null : valeur absente ou moins de 2 lignes.
export function classement(values) {
  const ok = values.filter(v => v != null)
  const k = ok.length
  if (k < 2) return values.map(() => null)
  return values.map(v => {
    if (v == null) return null
    const better = ok.filter(x => x > v).length, worse = ok.filter(x => x < v).length
    const egal = k - better - worse - 1 // autres lignes ex aequo
    return { pos: better + 1, k, t: (worse + egal / 2) / (k - 1) }
  })
}

// Valeurs distinctes d'un axe dans les deux semaines (triées)
export function dimValues(datasets, key) {
  const set = new Set()
  for (const ds of datasets) if (ds) for (const v of ds.dims[key]) set.add(v)
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
}

// Valeurs encore possibles de chaque axe avec les filtres des autres axes (comme les segments d'Excel) :
// { clé: Set }. Un filtre ne limite pas sa propre liste (on peut cocher un deuxième univers), mais limite
// toutes les autres, dans tous les sens (univers → segments, marque → univers…).
export function possibleValues(datasets, filters = {}) {
  const out = Object.fromEntries(DIMS.map(d => [d.key, new Set()]))
  for (const ds of datasets) {
    if (!ds) continue
    const fs = Object.entries(filters).filter(([, set]) => set?.size)
      .map(([k, set]) => ({ k, codes: ds.codes[k], ok: ds.dims[k].map(v => set.has(v)) }))
    const seen = DIMS.map(d => new Uint8Array(ds.dims[d.key].length))
    for (let i = 0; i < ds.n; i++) {
      // Ligne écartée par un seul filtre : elle compte encore pour la liste de cet axe-là
      let fail = null, nb = 0
      for (const f of fs) if (!f.ok[f.codes[i]]) { fail = f.k; if (++nb > 1) break }
      if (nb > 1) continue
      DIMS.forEach((d, j) => { if (!nb || d.key === fail) seen[j][ds.codes[d.key][i]] = 1 })
    }
    DIMS.forEach((d, j) => seen[j].forEach((s, c) => { if (s) out[d.key].add(ds.dims[d.key][c]) }))
  }
  return out
}

// Sommes par chemin de valeurs (« LAVAL␟RUNNING ») pour chaque profondeur de levels.
// filters : { clé: Set de valeurs gardées }
function aggregate(ds, levels, filters) {
  const out = new Map()
  if (!ds) return out
  const keepCode = Object.entries(filters).filter(([, set]) => set?.size)
    .map(([k, set]) => ({ codes: ds.codes[k], ok: ds.dims[k].map(v => set.has(v)) }))
  const lv = levels.map(k => ({ codes: ds.codes[k], values: ds.dims[k] }))
  const m = KEYS.map(k => ds.meas[k])
  const add = (key, i) => {
    let s = out.get(key)
    if (!s) { s = emptySums(); out.set(key, s) }
    for (let j = 0; j < 5; j++) s[j] += m[j][i]
  }
  for (let i = 0; i < ds.n; i++) {
    if (keepCode.some(f => !f.ok[f.codes[i]])) continue
    add('', i)
    let path = ''
    for (let d = 0; d < lv.length; d++) {
      path = d ? `${path}\u001f${lv[d].values[lv[d].codes[i]]}` : lv[d].values[lv[d].codes[i]]
      add(path, i)
    }
  }
  return out
}

// Arbre du tableau croisé : { total: { n, n1 }, children(path) → [{ path, label, depth, n, n1 }] }
// n / n1 : sommes (emptySums si absente de la semaine)
export function pivot({ n, n1, levels, filters = {} }) {
  const a = aggregate(n, levels, filters)
  const b = aggregate(n1, levels, filters)
  const kids = new Map()
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    if (!path) continue
    const parts = path.split('\u001f')
    const parent = parts.slice(0, -1).join('\u001f')
    if (!kids.has(parent)) kids.set(parent, [])
    kids.get(parent).push({ path, label: parts.at(-1), depth: parts.length - 1 })
  }
  const withSums = r => ({ ...r, n: a.get(r.path) || emptySums(), n1: b.get(r.path) || emptySums() })
  return {
    total: { n: a.get('') || emptySums(), n1: b.get('') || emptySums() },
    children: path => (kids.get(path) || []).map(withSums),
  }
}
