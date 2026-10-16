// Statistiques d'un budget : une ligne par marque (N-1, budget adapté, saisie, engagé, quantités, par magasin),
// regroupements (univers, fournisseur, magasin, acheteur) et enveloppes base / budget groupe des univers.
// Fonctions pures (tests/unit/budgetStats.test.mjs).
import { objectif } from './budgets.js'

const num = v => (typeof v === 'number' ? v : 0)
const sum = map => Object.values(map || {}).reduce((t, v) => t + num(v), 0)
export const EMPTY_STATS = { n1: 0, saisie: 0, engage: 0, adapte: 0, qte: 0, qteN1: 0 }

// Une ligne par marque des segments (marques retirées comprises si elles ont des montants).
// magId : ne compter qu'un magasin.
export function statsRows({ segments, brandsBySeg, adapte, fournisseur, magId = null }) {
  const pick = map => (magId ? num(map?.[magId]) : sum(map))
  const rows = []
  for (const s of segments) {
    for (const b of brandsBySeg.get(s.id) || []) {
      const l = b.line || {}
      const f = fournisseur(b.nom)
      const saisie = pick(l.saisie)
      const mags = new Set([...Object.keys(l.n1 || {}), ...Object.keys(l.saisie || {}), ...Object.keys(adapte?.byBrand.get(b.id) || {})])
      const parMag = {}
      for (const m of mags) {
        if (magId && m !== magId) continue
        parMag[m] = { n1: num(l.n1?.[m]), saisie: num(l.saisie?.[m]), adapte: num(adapte?.byBrand.get(b.id)?.[m]) }
      }
      rows.push({
        id: b.id, nom: b.nom, univers: b.univers, segId: s.id, segment: s.nom || '', orphan: !!b.orphan,
        fKey: f.key, fournisseur: f.nom,
        n1: pick(l.n1), saisie, engage: l.engage === true ? saisie : 0, adapte: pick(adapte?.byBrand.get(b.id)),
        qte: pick(l.quantite), qteN1: pick(l.quantiteN1), parMag,
      })
    }
  }
  return rows
}

export function sumRows(rows) {
  const r = { ...EMPTY_STATS }
  for (const x of rows) for (const k of Object.keys(EMPTY_STATS)) r[k] += x[k]
  return r
}

// Regroupe les lignes : [{ key, label, rows, ...totaux }] dans l'ordre d'apparition
export function groupRows(rows, keyOf, labelOf = keyOf) {
  const m = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!m.has(k)) m.set(k, { key: k, label: labelOf(r), rows: [] })
    m.get(k).rows.push(r)
  }
  return [...m.values()].map(g => ({ ...g, ...sumRows(g.rows) }))
}

// Totaux par magasin (N-1, saisi, adapté) : { magId: { n1, saisie, adapte } }
export function byMagasin(rows) {
  const t = {}
  for (const r of rows) {
    for (const [m, c] of Object.entries(r.parMag)) {
      const x = (t[m] ??= { n1: 0, saisie: 0, adapte: 0 })
      x.n1 += c.n1; x.saisie += c.saisie; x.adapte += c.adapte
    }
  }
  return t
}

// Enveloppes (base, budget groupe) des segments gardés (keepUnivers : univers, segment → booléen) : total,
// par univers et par magasin.
// Une base négative compte pour 0 dans l'objectif (rien à répartir).
export function envelopes({ segments, totals, magIds, hasGroupe, keepUnivers = () => true }) {
  const res = { base: 0, groupe: 0, objectif: 0, parUnivers: new Map(), parMag: {} }
  for (const s of segments) {
    if (!keepUnivers(s.univers, s.nom)) continue
    for (const m of magIds) {
      const c = totals[s.id]?.[m]
      if (!c) continue
      const o = Math.max(objectif(c, hasGroupe), 0)
      res.base += c.base; res.groupe += c.groupe; res.objectif += o
      const u = res.parUnivers.get(s.univers) || { base: 0, groupe: 0, objectif: 0 }
      u.base += c.base; u.groupe += c.groupe; u.objectif += o
      res.parUnivers.set(s.univers, u)
      const pm = (res.parMag[m] ??= { base: 0, groupe: 0, objectif: 0 })
      pm.base += c.base; pm.groupe += c.groupe; pm.objectif += o
    }
  }
  return res
}

// Évolution en % (null si pas de référence)
export const evol = (v, ref) => (ref > 0 ? (v / ref - 1) * 100 : null)
// Part en % (null si pas de total)
export const part = (v, total) => (total > 0 ? (v / total) * 100 : null)

// Les n premiers éléments (par valeur décroissante) et le reste regroupé en « Autres »
export function topWithOthers(items, value, n = 7, label = 'Autres') {
  const sorted = [...items].filter(i => value(i) > 0).sort((a, b) => value(b) - value(a))
  if (sorted.length <= n + 1) return sorted.map(i => ({ label: i.label, value: value(i) }))
  const head = sorted.slice(0, n).map(i => ({ label: i.label, value: value(i) }))
  const rest = sorted.slice(n).reduce((t, i) => t + value(i), 0)
  return [...head, { label, value: rest, autres: true }]
}
