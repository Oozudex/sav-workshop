// Export Excel d'un budget rempli. Fonction pure (tests/unit/budgetExport.test.mjs) : renvoie les feuilles
// { name, table, merges, formats, firstRow } ; le téléchargement est fait par downloadWorkbook (lib/excel.js).
// 1. BUDGET PAR MARQUES : même présentation que le fichier N-1 (univers, segment, marques, puis par magasin
//    N-1 / budget / quantité) ; en tête de chaque segment, son budget de base et son budget groupe par
//    magasin (lignes « BUDGET PAR SEGMENT », ignorées à la réimport). Le fichier se réimporte tel quel
//    comme N-1 l'année suivante (colonne « BUDGET AH27 »).
// 2. SYNTHESE : univers et segments (base, groupe, N-1, saisi, engagé, reste…).
// 3. PAR MAGASIN. 4. FOURNISSEURS : notes, budget demandé, saisi.
// Le budget adapté (répartition calculée par la notation) n'apparaît pas dans l'export : on y parle du
// budget de base et du budget groupe.
import { CRITERES, addTotals, coefMarque, emptyCell, noteMarque, notationReglages, objectif, seasonCode } from './budgets.js'

const EUR = '#,##0 "€";-#,##0 "€"'
const QTE = '#,##0'
const PCT = '0.0%'
const NOTE = '0.0'
const r2 = n => Math.round((n || 0) * 100) / 100
const r0 = n => Math.round(n || 0)
const sum = map => Object.values(map || {}).reduce((t, v) => t + (typeof v === 'number' ? v : 0), 0)
const val = (map, k) => (typeof map?.[k] === 'number' ? r2(map[k]) : '')
const evol = (v, ref) => (ref > 0 && v ? v / ref - 1 : '')

// formats : { [index de colonne]: format } appliqué à toutes les lignes de données (à partir de firstRow)
function sheet(name, table, { merges = [], formats = {}, firstRow = 1 } = {}) {
  return { name, table, merges, formats, firstRow }
}

export function budgetWorkbook({
  budget, segments, magasins, totals, brandsBySeg, fournisseur, fiche, hasGroupe, groupeMontant, reglages,
  exportedAt = new Date(),
}) {
  const code = seasonCode(budget.saison, budget.annee)
  const prevCode = seasonCode(budget.saison, budget.annee - 1)
  const cell = (segId, magId) => totals[segId]?.[magId] || emptyCell()

  // ── 1. BUDGET PAR MARQUES ─────────────────────────────────────────────────────
  const SUBS = [`BUDGET ${prevCode}`, `BUDGET ${code}`, `QTÉ ${code}`]
  const TOTAL_SUBS = ['N-1 TOTAL', 'BUDGET TOTAL', 'QTÉ TOTAL']
  const W = SUBS.length
  const head = ['UNIVERS', 'SEGMENT', 'MARQUES']
  const sub = ['', '', '']
  const merges = []
  for (const m of [...magasins.map(x => x.nom), 'TOTAL']) {
    const c = head.length
    head.push(m, ...Array(W - 1).fill(''))
    sub.push(...(m === 'TOTAL' ? TOTAL_SUBS : SUBS))
    merges.push({ s: { r: 0, c }, e: { r: 0, c: c + W - 1 } })
  }
  const after = head.length
  head.push('COMMENTAIRE', 'STATUT', 'FOURNISSEUR', `QTÉ ${prevCode}`)
  sub.push('', '', '', '')
  const brandRows = [head, sub]
  const grand = { n1: 0, saisie: 0, qte: 0, base: 0, groupe: 0, mags: {} }
  // Enveloppe d'un segment par magasin (base ou groupe), dans la colonne « BUDGET AH27 »
  const enveloppeRow = (univers, segment, label, key, cells) => {
    const row = [univers, segment, label]
    for (const c of cells) row.push('', r0(c[key]), '')
    row.push('', r0(cells.reduce((t, c) => t + c[key], 0)), '', '', '', '', '')
    return row
  }
  for (const s of segments) {
    const cells = magasins.map(m => cell(s.id, m.id))
    brandRows.push(enveloppeRow(s.univers, s.nom || s.univers, 'BUDGET PAR SEGMENT · BUDGET DE BASE', 'base', cells))
    if (hasGroupe) brandRows.push(enveloppeRow(s.univers, s.nom || s.univers, 'BUDGET PAR SEGMENT · BUDGET GROUPE', 'groupe', cells))
    magasins.forEach((m, i) => {
      const g = (grand.mags[m.id] ??= { n1: 0, saisie: 0, qte: 0, base: 0, groupe: 0 })
      g.base += cells[i].base; g.groupe += cells[i].groupe
    })
    for (const b of brandsBySeg.get(s.id) || []) {
      const l = b.line || {}
      const row = [s.univers, s.nom || s.univers, b.nom]
      for (const m of magasins) {
        row.push(val(l.n1, m.id), val(l.saisie, m.id), val(l.quantite, m.id))
        const g = grand.mags[m.id]
        g.n1 += l.n1?.[m.id] || 0; g.saisie += l.saisie?.[m.id] || 0; g.qte += l.quantite?.[m.id] || 0
      }
      const t = { n1: sum(l.n1), saisie: sum(l.saisie), qte: sum(l.quantite) }
      grand.n1 += t.n1; grand.saisie += t.saisie; grand.qte += t.qte
      const filled = Object.keys(l.saisie || {}).length || Object.keys(l.quantite || {}).length
      row.push(r2(t.n1), r2(t.saisie), r2(t.qte) || '',
        l.commentaire || '', filled ? (l.engage === true ? 'Engagé' : 'Prévisionnel') : '',
        fournisseur(b.nom).nom + (b.orphan ? ' (marque retirée)' : ''), sum(l.quantiteN1) || '')
      brandRows.push(row)
    }
  }
  // Totaux : budget de base, budget groupe, puis N-1 / saisi / quantités (marque « TOTAL », ignorée à la réimport)
  const mags = magasins.map(m => grand.mags[m.id] || { n1: 0, saisie: 0, qte: 0, base: 0, groupe: 0 })
  brandRows.push(enveloppeRow('TOTAL', 'BUDGET DE BASE', 'TOTAL', 'base', mags))
  if (hasGroupe) brandRows.push(enveloppeRow('TOTAL', 'BUDGET GROUPE', 'TOTAL', 'groupe', mags))
  const totalRow = ['TOTAL', '', 'TOTAL']
  for (const g of mags) totalRow.push(r2(g.n1), r2(g.saisie), r2(g.qte) || '')
  totalRow.push(r2(grand.n1), r2(grand.saisie), r2(grand.qte) || '')
  brandRows.push(totalRow)
  const brandFormats = {}
  for (let c = 3; c < after; c++) brandFormats[c] = (c - 3) % W === W - 1 ? QTE : EUR
  brandFormats[after + 3] = QTE

  // ── 2. SYNTHESE (univers puis segments) ───────────────────────────────────────
  const SYN_HEAD = ['UNIVERS', 'SEGMENT', 'BUDGET DE BASE', 'BUDGET GROUPE', `N-1 (${prevCode})`,
    `SAISI (${code})`, 'ENGAGÉ', 'PRÉVISIONNEL', 'RESTE À RÉPARTIR', 'ÉVOL. SAISI / N-1', 'QUANTITÉS', 'QUANTITÉS N-1']
  const synRow = (u, segLabel, c) => {
    const reste = Math.max(objectif(c, hasGroupe), 0) - c.saisie
    return [u, segLabel, r0(c.base), hasGroupe ? r0(c.groupe) : '', r2(c.n1), r2(c.saisie), r2(c.engage),
      r2(c.saisie - c.engage), r0(reste), evol(c.saisie, c.n1), r2(c.qte) || '', r2(c.qteN1) || '']
  }
  const groupeLabel = groupeMontant == null ? 'non fixé'
    : budget.groupe?.mode === 'pct' ? `${r0(groupeMontant).toLocaleString('fr-FR')} € (${budget.groupe.pct > 0 ? '+' : ''}${budget.groupe.pct} % du N-1)`
      : `${r0(groupeMontant).toLocaleString('fr-FR')} €`
  const syn = [
    [budget.nom], [`Exporté le ${exportedAt.toLocaleDateString('fr-FR')} · budget groupe : ${groupeLabel}`], [],
    SYN_HEAD,
  ]
  const synFirst = syn.length
  const univers = []
  for (const s of segments) {
    if (univers.at(-1)?.nom !== s.univers) univers.push({ nom: s.univers, segs: [] })
    univers.at(-1).segs.push(s)
  }
  const allCells = []
  for (const u of univers) {
    const uc = addTotals(u.segs.flatMap(s => magasins.map(m => cell(s.id, m.id))))
    syn.push(synRow(u.nom, u.segs.length === 1 && !u.segs[0].nom ? '' : `${u.segs.length} segment(s)`, uc))
    if (!(u.segs.length === 1 && !u.segs[0].nom)) {
      for (const s of u.segs) syn.push(synRow(u.nom, s.nom || 'Sans segment', addTotals(magasins.map(m => cell(s.id, m.id)))))
    }
    allCells.push(uc)
  }
  syn.push(synRow('TOTAL', '', addTotals(allCells)))
  const synFormats = { 2: EUR, 3: EUR, 4: EUR, 5: EUR, 6: EUR, 7: EUR, 8: EUR, 9: PCT, 10: QTE, 11: QTE }

  // ── 3. PAR MAGASIN ────────────────────────────────────────────────────────────
  const MAG_HEAD = ['MAGASIN', 'BUDGET DE BASE', 'BUDGET GROUPE', `N-1 (${prevCode})`, `SAISI (${code})`,
    'ENGAGÉ', 'PRÉVISIONNEL', 'RESTE À RÉPARTIR', 'ÉVOL. SAISI / N-1', 'QUANTITÉS']
  const magRow = (label, c) => [label, r0(c.base), hasGroupe ? r0(c.groupe) : '', r2(c.n1), r2(c.saisie),
    r2(c.engage), r2(c.saisie - c.engage), r0(Math.max(objectif(c, hasGroupe), 0) - c.saisie), evol(c.saisie, c.n1), r2(c.qte) || '']
  const mag = [MAG_HEAD]
  const magCells = magasins.map(m => {
    const c = addTotals(segments.map(s => cell(s.id, m.id)))
    mag.push(magRow(m.nom, c))
    return c
  })
  mag.push(magRow('TOTAL', addTotals(magCells)))
  const magFormats = { 1: EUR, 2: EUR, 3: EUR, 4: EUR, 5: EUR, 6: EUR, 7: EUR, 8: PCT, 9: QTE }

  // ── 4. FOURNISSEURS ───────────────────────────────────────────────────────────
  const { poids, amplitude } = notationReglages(reglages)
  const fourn = new Map()
  for (const s of segments) {
    for (const b of brandsBySeg.get(s.id) || []) {
      if (b.orphan) continue
      const f = fournisseur(b.nom)
      if (!fourn.has(f.key)) fourn.set(f.key, { ...f, decl: new Set(), univers: new Set(), n1: 0, saisie: 0, engage: 0 })
      const e = fourn.get(f.key)
      e.decl.add(b.nom); e.univers.add(s.univers)
      e.n1 += sum(b.line?.n1); e.saisie += sum(b.line?.saisie)
      if (b.line?.engage === true) e.engage += sum(b.line?.saisie)
    }
  }
  const F_HEAD = ['FOURNISSEUR', 'DÉCLINAISONS', 'UNIVERS', ...CRITERES.map(c => c.label.toUpperCase()), 'NOTE', 'COEFFICIENT',
    'BUDGET DEMANDÉ', `N-1 (${prevCode})`, `SAISI (${code})`, 'ENGAGÉ', 'NOTES REPRISES DE']
  const fRows = [F_HEAD]
  for (const e of [...fourn.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
    const fi = fiche(e.key)
    const note = noteMarque(fi?.notes, poids)
    fRows.push([
      e.nom, [...e.decl].sort().join(', '), [...e.univers].sort().join(', '),
      ...CRITERES.map(c => (typeof fi?.notes?.[c.key] === 'number' ? fi.notes[c.key] : '')),
      note == null ? '' : Math.round(note * 10) / 10, Math.round(coefMarque(note, amplitude) * 100) / 100,
      typeof fi?.demande === 'number' ? fi.demande : '', r2(e.n1), r2(e.saisie), r2(e.engage),
      fi?.herite ? fi.source || 'budget précédent' : '',
    ])
  }
  const nc = CRITERES.length
  const fFormats = { [3 + nc]: NOTE, [4 + nc]: '0.00', [5 + nc]: EUR, [6 + nc]: EUR, [7 + nc]: EUR, [8 + nc]: EUR }

  return [
    sheet('BUDGET PAR MARQUES', brandRows, { merges, formats: brandFormats, firstRow: 2 }),
    sheet('SYNTHESE', syn, { formats: synFormats, firstRow: synFirst }),
    sheet('PAR MAGASIN', mag, { formats: magFormats }),
    sheet('FOURNISSEURS', fRows, { formats: fFormats }),
  ]
}

// « BUDGET AH27 » → « BUDGET AH27 - export 2026-10-15 »
export function exportFileName(budget, date = new Date()) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${budget.nom} - export ${d}`
}

// Rappel pour l'import l'année suivante : colonne à choisir comme N-1
export const reimportColumn = budget => `BUDGET ${seasonCode(budget.saison, budget.annee)}`
