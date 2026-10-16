// Tableau croisé du taux de sortie (comme un TCD Excel) : lignes sur un ou plusieurs axes dans l'ordre
// choisi (Magasin › Univers › Marque…), filtres sur les valeurs de chaque axe, 15 colonnes : le libellé,
// puis CANet, MtMrg, Marge %, QtRecep, QtVte, QtStkFin et taux de sortie pour N (à gauche) et pour N-1 (à droite).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { downloadWorkbook } from '../../lib/excel'
import {
  DIMS, INDICATEURS, RECEP, anciennete, classement, dimLabel, dimValues, formatIndicateur as fmt, indicateurs, isoFr, jourCourt, pivot,
  pivotExport, possibleValues, recepActif, recepDepuis, recepTexte,
} from '../../lib/sorties'
import { RANG_CLS, RangNuancier, rangStyle, rangTexte } from './rang'
import SortieInfo from './SortieInfo'

const PAGE = 200
// compare : colonne où une hausse par rapport à N-1 est une bonne nouvelle (vert) et une baisse une
// mauvaise (rouge). Réceptions et stock restent neutres (une hausse n'est ni bonne ni mauvaise en soi).
const NEUTRES = ['qtRecep', 'qtStkFin']
const COLS = INDICATEURS.map(c => ({ ...c, compare: !NEUTRES.includes(c.key) }))
// Colonnes dont le fond classe les lignes entre elles (plus haut = meilleur)
const CLASSES = ['marge', 'taux']
// Couleur de chaque période : N-1 en gris (le passé, comme dans les budgets), N en bleu canard (la semaine
// analysée, couleur de la carte Statistiques Achats)
const PERIOD = {
  n1: {
    group: 'bg-gray-200/70 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200',
    head: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400',
    cell: 'bg-gray-50 dark:bg-neutral-800/40',
    total: 'bg-gray-100 dark:bg-neutral-800',
    text: 'text-gray-600 dark:text-neutral-300',
    edge: 'border-l-2 border-l-gray-300 dark:border-l-neutral-600',
    dot: 'bg-gray-400',
  },
  n: {
    group: 'bg-teal-600 text-white dark:bg-teal-500/80',
    head: 'bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    cell: '',
    total: 'bg-teal-50 dark:bg-teal-500/15',
    text: 'text-gray-900 dark:text-white',
    edge: 'border-l-2 border-l-teal-500',
    dot: 'bg-teal-600',
  },
}
// Écart N / N-1 : en % pour les montants et quantités, en points pour les pourcentages
const ecart = (v, r, f) => {
  const d = f === 'pct' ? (v - r) * 100 : (v - r) / Math.abs(r) * 100
  const t = `${d > 0 ? '+' : ''}${(Math.round(d * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })}`
  return f === 'pct' ? `${t} pt` : `${t} %`
}
// Hausse / baisse par rapport à N-1 : fond teinté, texte coloré et flèche (lisible sans les couleurs)
const UP = { cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold', text: 'text-emerald-700 dark:text-emerald-300', arrow: '▲', label: 'en hausse' }
const DOWN = { cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300 font-semibold', text: 'text-red-600 dark:text-red-400', arrow: '▼', label: 'en baisse' }
const SELECT = 'h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const CHIP = 'h-7 inline-flex items-center gap-1 rounded-lg border px-2 text-xs font-semibold'

// Filtre d'un axe : liste de valeurs à cocher, avec recherche. possible : valeurs qui existent encore avec
// les autres filtres (les autres sont masquées) ; une valeur cochée qui n'existe plus reste en haut, grisée.
export function FilterButton({ dim, values, possible, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const needle = q.trim().toUpperCase()
  const match = v => !needle || v.toUpperCase().includes(needle)
  const live = values.filter(v => possible.has(v))
  const shown = live.filter(match)
  const stale = values.filter(v => selected.has(v) && !possible.has(v) && match(v))
  const toggle = v => { const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n) }
  const active = selected.size > 0
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`${CHIP} ${active ? 'border-gray-900 text-gray-900 bg-gray-100 dark:border-white dark:text-white dark:bg-neutral-800' : 'border-gray-200 text-gray-600 bg-white dark:border-neutral-700 dark:text-neutral-300 dark:bg-neutral-900'}`}>
        {dim.label}{active && <span className="tabular-nums">({selected.size})</span>} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-2 space-y-2">
          <input autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Rechercher (${live.length})…`}
            aria-label={`Rechercher dans ${dim.label}`} className="Input h-8 text-xs w-full" />
          <div className="flex gap-2 text-[11px]">
            <button type="button" className="underline text-gray-600 dark:text-neutral-300"
              onClick={() => onChange(new Set([...selected, ...shown.slice(0, 1000)]))}>Tout cocher{needle ? ' (recherche)' : ''}</button>
            {active && <button type="button" className="underline text-gray-600 dark:text-neutral-300" onClick={() => onChange(new Set())}>Effacer</button>}
          </div>
          <ul className="max-h-64 overflow-y-auto space-y-0.5">
            {stale.map(v => (
              <li key={v}>
                <label title="Aucune donnée avec les autres filtres" className="flex items-center gap-2 px-1 py-0.5 rounded text-xs text-gray-400 dark:text-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer">
                  <input type="checkbox" checked onChange={() => toggle(v)} />
                  <span className="truncate">{v}</span>
                  <span className="ml-auto shrink-0 text-[10px] italic">aucune donnée avec ces filtres</span>
                </label>
              </li>
            ))}
            {shown.slice(0, PAGE).map(v => (
              <li key={v}>
                <label className="flex items-center gap-2 px-1 py-0.5 rounded text-xs text-gray-800 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer">
                  <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
                  <span className="truncate">{v}</span>
                </label>
              </li>
            ))}
            {shown.length > PAGE && <li className="px-1 text-[11px] text-gray-500 dark:text-neutral-400">… {shown.length - PAGE} autres : affine la recherche.</li>}
            {shown.length === 0 && !stale.length && <li className="px-1 text-[11px] text-gray-500 dark:text-neutral-400">Aucune valeur.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// Dernière réception de la ligne (à partir d'un niveau Modèle / Référence / Couleur) et son ancienneté à la
// fin de la semaine de la période ; moins de 4 semaines : en ambre (le stock a eu peu de temps pour sortir).
// applicable = false : ligne au-dessus de ces niveaux (case vide).
const RECENT = 28
function RecepCell({ jour, fin, n1 = false, total = false, applicable = true }) {
  const P = PERIOD[n1 ? 'n1' : 'n']
  const age = jour != null && fin != null ? fin - jour : null
  const recent = age != null && age >= 0 && age < RECENT
  return (
    <td title={recent ? 'Reçu il y a moins de 4 semaines : le stock a eu peu de temps pour sortir' : undefined}
      className={`py-1.5 px-2 text-right text-xs tabular-nums whitespace-nowrap ${total ? `py-2 ${P.total}` : P.cell} ${P.text}`}>
      {applicable && !total && (jour == null ? '—' : <>
        {jourCourt(jour)}
        <span className={`ml-1 text-[10px] ${recent ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-neutral-400'}`}>{anciennete(jour, fin)}</span>
      </>)}
    </td>
  )
}

// Cellules d'une période ; en N, comparaison avec N-1 : vert ▲ en hausse, rouge ▼ en baisse.
// rang : { marge, taux } classement parmi les lignes du même niveau (fond bleu → jaune → orange, une nuance par place) ; sur ces
// cases, l'évolution N-1 n'est plus donnée que par la flèche colorée.
function Cells({ s, ref1, n1 = false, total = false, rang = null }) {
  const v = indicateurs(s)
  const r = ref1 ? indicateurs(ref1) : null
  const P = PERIOD[n1 ? 'n1' : 'n']
  const plain = `${total ? P.total : P.cell} ${P.text}`
  return COLS.map((c, i) => {
    let dir = null
    if (!n1 && c.compare && r && v[c.key] && r[c.key]
      && Math.abs(v[c.key] - r[c.key]) > Math.abs(r[c.key]) * 0.0005) dir = v[c.key] > r[c.key] ? UP : DOWN
    const rk = rang?.[c.key] || null
    const cls = rk ? `${RANG_CLS} font-semibold` : dir ? dir.cls : plain
    const title = [rk && `Classement : ${rangTexte(rk)}`, dir && `N-1 : ${fmt(r[c.key], c.fmt)} · ${ecart(v[c.key], r[c.key], c.fmt)}`].filter(Boolean).join(' · ')
    return (
      <td key={c.key} title={title || undefined} style={rk ? rangStyle(rk.t) : undefined}
        className={`py-1.5 px-2 text-right text-xs tabular-nums whitespace-nowrap ${total ? 'py-2' : ''} ${cls} ${i === 0 ? P.edge : ''}`}>
        {dir && <><span aria-hidden="true" className={`mr-1 text-[9px] ${rk ? dir.text : ''}`}>{dir.arrow}</span><span className="sr-only">{dir.label}, </span></>}
        {rk && <span className="sr-only">{rangTexte(rk)}, </span>}
        {fmt(v[c.key], c.fmt)}
      </td>
    )
  })
}

// onFiltersChange : prévenu à chaque changement de filtres (le graphique de saison reprend ceux du tableau)
// Filtre par période de dernière réception (« Der Recep ») : du … au …, chaque date facultative, avec des
// raccourcis (4 / 8 dernières semaines, début de saison) ; le N-1 prend la même période un an plus tôt
function RecepFilterButton({ value, onChange, raccourcis = [], disponible }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = recepActif(value)
  const set = (k, v) => onChange({ ...value, [k]: v || undefined })
  const court = iso => isoFr(iso).slice(0, 5)
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`${CHIP} ${active ? 'border-gray-900 text-gray-900 bg-gray-100 dark:border-white dark:text-white dark:bg-neutral-800' : 'border-gray-200 text-gray-600 bg-white dark:border-neutral-700 dark:text-neutral-300 dark:bg-neutral-900'}`}>
        {RECEP.label}
        {active && <span className="tabular-nums">({value.du ? court(value.du) : '…'} → {value.au ? court(value.au) : '…'})</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2">
          <p className="text-[11px] text-gray-500 dark:text-neutral-400">Date de dernière réception de la ligne. Le N-1 prend la même période un an plus tôt.</p>
          {!disponible && <p className="text-[11px] text-amber-700 dark:text-amber-400">Ces fichiers ont été importés sans la colonne Der Recep : réimporte-les pour filtrer.</p>}
          <div className="grid grid-cols-2 gap-2">
            {[['du', 'Du'], ['au', 'Au']].map(([k, label]) => (
              <label key={k} className="text-[11px] font-semibold text-gray-600 dark:text-neutral-300 space-y-0.5">
                <span className="block">{label}</span>
                <input type="date" value={value?.[k] || ''} max={k === 'du' ? value?.au : undefined} min={k === 'au' ? value?.du : undefined}
                  onChange={e => set(k, e.target.value)} className="Input h-8 text-xs w-full" />
              </label>
            ))}
          </div>
          {raccourcis.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {raccourcis.map(r => (
                <button key={r.label} type="button" onClick={() => onChange({ du: r.du, au: r.au })}
                  className="h-6 px-2 rounded-md border border-gray-200 dark:border-neutral-700 text-[11px] text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800">
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {active && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-gray-500 dark:text-neutral-400">N-1 : {recepTexte(value, 1)}</span>
              <button type="button" className="underline text-gray-600 dark:text-neutral-300" onClick={() => onChange(undefined)}>Effacer</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// recepRaccourcis : périodes proposées dans le filtre Der Recep ([{ label, du, au }]) ; finN / finN1 : dimanche
// (jour) des semaines N et N-1, pour l'ancienneté de la dernière réception
export default function SortiePivot({ n, n1, labelN, labelN1, defaultFilters = {}, onFiltersChange, recepRaccourcis, finN, finN1 }) {
  const [levels, setLevels] = useState(['magasin'])
  const [filters, setFilters] = useState(defaultFilters)
  const [open, setOpen] = useState(() => new Set())
  const [more, setMore] = useState({})
  const [sort, setSort] = useState({ key: 'caNet', period: 'n', dir: -1 })
  const [exporting, setExporting] = useState(false)
  useEffect(() => { onFiltersChange?.(filters) }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const values = useMemo(() => Object.fromEntries(DIMS.map(d => [d.key, dimValues([n, n1], d.key)])), [n, n1])
  const possible = useMemo(() => possibleValues([n, n1], filters), [n, n1, filters])
  const p = useMemo(() => pivot({ n, n1, levels, filters }), [n, n1, levels, filters])
  const available = DIMS.filter(d => !levels.includes(d.key))
  const activeFilters = DIMS.filter(d => filters[d.key]?.size)
  const recepOn = recepActif(filters.recep)
  const anyFilter = activeFilters.length > 0 || recepOn
  // Colonne Der Recep (N et N-1) dès qu'un niveau Modèle, Référence ou Couleur est dans les lignes
  const recepFrom = recepDepuis(levels)
  const showRecep = recepFrom >= 0
  const NB = COLS.length + (showRecep ? 1 : 0) // colonnes par période
  // Semaines importées sans la colonne Der Recep (le filtre n'y garde aucune ligne)
  const sansDates = [[n, labelN], [n1, labelN1]].filter(([ds]) => ds && !ds.recep).map(([, l]) => l)

  const setLevel = next => { setLevels(next); setOpen(new Set()); setMore({}) }
  const move = (i, d) => { const l = [...levels]; [l[i], l[i + d]] = [l[i + d], l[i]]; setLevel(l) }
  const toggle = path => setOpen(s => { const x = new Set(s); if (x.has(path)) x.delete(path); else x.add(path); return x })
  const sortVal = row => {
    if (sort.key === 'label') return row.label
    if (sort.key === 'recep') return row.recep?.[sort.period] ?? -Infinity
    return indicateurs(sort.period === 'n' ? row.n : row.n1)[sort.key] ?? -Infinity
  }
  const children = path => p.children(path).sort((a, b) => {
    const x = sortVal(a), y = sortVal(b)
    return (typeof x === 'string' ? x.localeCompare(y, 'fr', { numeric: true }) : x - y) * sort.dir
  })
  const sortBy = (key, period) => setSort(s => (s.key === key && s.period === period ? { ...s, dir: -s.dir } : { key, period, dir: key === 'label' ? 1 : -1 }))
  // Export Excel : tout le détail à plat (niveaux et filtres choisis, tri de l'écran)
  async function exportExcel() {
    setExporting(true)
    try {
      const titre = `TAUX DE SORTIE ${labelN}`
      const x = pivotExport({ total: p.total, children, levels, titre, filters, labelN, labelN1 })
      const niveaux = levels.length ? ` - ${levels.map(dimLabel).join(', ')}` : ''
      await downloadWorkbook([{ name: 'Taux de sortie', ...x }], `${titre}${niveaux}`)
    } finally { setExporting(false) }
  }
  const arrow = (key, period) => (sort.key === key && sort.period === period ? (sort.dir < 0 ? ' ↓' : ' ↑') : '')

  function renderRows(path) {
    const rows = children(path)
    // Classement de la marge % et du taux de sortie entre les lignes de ce niveau, en N et en N-1
    const rangs = period => {
      const v = rows.map(r => indicateurs(r[period]))
      const c = Object.fromEntries(CLASSES.map(k => [k, classement(v.map(x => x[k]))]))
      return idx => Object.fromEntries(CLASSES.map(k => [k, c[k][idx]]))
    }
    const rangN = rangs('n'), rangN1 = rangs('n1')
    const limit = more[path] || PAGE
    return <>
      {rows.slice(0, limit).map((r, idx) => {
        const canOpen = r.depth < levels.length - 1
        const isOpen = open.has(r.path)
        return (
          <Fragment key={r.path}>
            <tr className={`border-t border-gray-100 dark:border-neutral-800 ${r.depth === 0 && levels.length > 1 ? 'bg-gray-50/40 dark:bg-neutral-800/20' : ''}`}>
              <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-neutral-900 py-1.5 pr-2 text-left text-xs font-medium text-gray-900 dark:text-white"
                style={{ paddingLeft: `${0.5 + r.depth * 1.1}rem` }}>
                {canOpen ? (
                  <button type="button" onClick={() => toggle(r.path)} aria-expanded={isOpen} className="flex items-center gap-1.5 text-left hover:underline max-w-[18rem]">
                    <span aria-hidden="true" className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                    <span className="truncate">{r.label}</span>
                  </button>
                ) : <span className="block truncate max-w-[18rem]" title={r.label}>{r.label}</span>}
              </th>
              <Cells s={r.n} ref1={r.n1} rang={rangN(idx)} />
              {showRecep && <RecepCell jour={r.recep.n} fin={finN} applicable={r.depth >= recepFrom} />}
              <Cells s={r.n1} n1 rang={rangN1(idx)} />
              {showRecep && <RecepCell jour={r.recep.n1} fin={finN1} n1 applicable={r.depth >= recepFrom} />}
            </tr>
            {canOpen && isOpen && renderRows(r.path)}
          </Fragment>
        )
      })}
      {rows.length > limit && (
        <tr><td colSpan={1 + 2 * NB} className="py-1.5 pl-4 text-xs">
          <button type="button" className="font-semibold underline text-gray-600 dark:text-neutral-300"
            onClick={() => setMore(m => ({ ...m, [path]: limit + PAGE }))}>
            Afficher {Math.min(PAGE, rows.length - limit)} de plus ({rows.length - limit} restants)
          </button>
        </td></tr>
      )}
    </>
  }

  const th = 'py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none'
  return (
    <div className="space-y-3">
      <SortieInfo total={p.total} labelN={labelN} labelN1={labelN1} filtre={anyFilter} />
      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-20">Lignes</span>
          {levels.map((k, i) => (
            <span key={k} className={`${CHIP} border-gray-900 text-gray-900 dark:border-white dark:text-white`}>
              {i > 0 && <button type="button" aria-label={`Monter ${dimLabel(k)}`} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">←</button>}
              {dimLabel(k)}
              {i < levels.length - 1 && <button type="button" aria-label={`Descendre ${dimLabel(k)}`} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">→</button>}
              <button type="button" aria-label={`Retirer ${dimLabel(k)}`} onClick={() => setLevel(levels.filter(x => x !== k))} className="ml-0.5 text-gray-400 hover:text-red-600">×</button>
            </span>
          ))}
          {available.length > 0 && (
            <select value="" onChange={e => e.target.value && setLevel([...levels, e.target.value])} aria-label="Ajouter un niveau de lignes" className={SELECT}>
              <option value="">+ Ajouter un niveau</option>
              {available.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          )}
          <button type="button" onClick={exportExcel} disabled={exporting} title="Tout le détail des lignes choisies, avec les filtres, en N et N-1"
            className={`${CHIP} ml-auto border-gray-200 text-gray-700 bg-white hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 disabled:opacity-50`}>
            {exporting ? 'Export…' : 'Exporter (Excel)'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-20">Filtres</span>
          {DIMS.map(d => (
            <FilterButton key={d.key} dim={d} values={values[d.key]} possible={possible[d.key]} selected={filters[d.key] || new Set()}
              onChange={set => setFilters(f => ({ ...f, [d.key]: set }))} />
          ))}
          <RecepFilterButton value={filters.recep} raccourcis={recepRaccourcis} disponible={sansDates.length < [n, n1].filter(Boolean).length}
            onChange={r => setFilters(f => ({ ...f, recep: r }))} />
          {anyFilter && (
            <button type="button" onClick={() => setFilters({})} className="text-xs underline text-gray-500 dark:text-neutral-400">Effacer les filtres</button>
          )}
        </div>
        {anyFilter && (
          <p className="text-[11px] text-gray-600 dark:text-neutral-300">
            {[
              ...activeFilters.map(d => `${d.label} : ${[...filters[d.key]].slice(0, 4).join(', ')}${filters[d.key].size > 4 ? ` +${filters[d.key].size - 4}` : ''}`),
              ...(recepOn ? [`${RECEP.label} : ${recepTexte(filters.recep)} (N-1 : ${recepTexte(filters.recep, 1)})`] : []),
            ].join(' · ')}
          </p>
        )}
        {recepOn && sansDates.length > 0 && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            {sansDates.join(' et ')} {sansDates.length > 1 ? 'ont été importées' : 'a été importée'} sans la colonne Der Recep : aucune de ses lignes ne passe ce filtre.
            Réimporte le fichier pour avoir les dates.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto relative">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" onClick={() => sortBy('label', 'n')}
                className={`${th} sticky left-0 z-20 bg-white dark:bg-neutral-900 text-left text-gray-500 dark:text-neutral-400 min-w-[12rem] border-b border-gray-200 dark:border-neutral-700`}>
                {levels.length ? levels.map(dimLabel).join(' › ') : 'Total'}{arrow('label', 'n')}
              </th>
              <th colSpan={NB} scope="colgroup" className={`py-1.5 text-xs font-bold text-center ${PERIOD.n.group} ${PERIOD.n.edge}`}>N · {labelN}</th>
              <th colSpan={NB} scope="colgroup" className={`py-1.5 text-xs font-bold text-center ${PERIOD.n1.group} ${PERIOD.n1.edge}`}>N-1 · {labelN1}</th>
            </tr>
            <tr>
              {['n', 'n1'].map(period => [
                ...COLS.map((c, i) => (
                  <th key={`${period}-${c.key}`} scope="col" onClick={() => sortBy(c.key, period)} title="Trier"
                    className={`${th} text-right border-b border-gray-200 dark:border-neutral-700 ${i === 0 ? PERIOD[period].edge : ''} ${PERIOD[period].head}`}>
                    {c.label}{arrow(c.key, period)}
                  </th>
                )),
                showRecep && (
                  <th key={`${period}-recep`} scope="col" onClick={() => sortBy('recep', period)}
                    title="Dernière réception (la plus récente des lignes regroupées) et son ancienneté à la fin de la semaine. Trier"
                    className={`${th} text-right border-b border-gray-200 dark:border-neutral-700 ${PERIOD[period].head}`}>
                    {RECEP.label}{arrow('recep', period)}
                  </th>
                ),
              ])}
            </tr>
          </thead>
          <tbody>{levels.length > 0 && renderRows('')}</tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 font-bold">
              <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-neutral-900 py-2 pl-2 pr-2 text-left text-xs text-gray-900 dark:text-white border-t border-gray-300 dark:border-neutral-600">
                Total{anyFilter ? ' (filtré)' : ''}
              </th>
              <Cells s={p.total.n} ref1={p.total.n1} total />
              {showRecep && <RecepCell total />}
              <Cells s={p.total.n1} n1 total />
              {showRecep && <RecepCell n1 total />}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-neutral-300" aria-label="Légende des couleurs">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${PERIOD.n.dot}`} />N · {labelN} (semaine analysée)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${PERIOD.n1.dot}`} />N-1 · {labelN1} (référence)</li>
        <li><span className={`px-1.5 py-0.5 rounded ${UP.cls}`}>▲ En hausse par rapport à N-1</span></li>
        <li><span className={`px-1.5 py-0.5 rounded ${DOWN.cls}`}>▼ En baisse par rapport à N-1</span></li>
        <li className="inline-flex items-center gap-1">
          Marge % et taux de sortie, classement entre lignes du même niveau :
          <span className="font-semibold">meilleur</span>
          <RangNuancier />
          <span className="font-semibold">moins bon</span>
          (une nuance par place, jaune = milieu)
        </li>
        <li>Survole une case pour voir l’écart avec N-1 et le classement.</li>
      </ul>
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">Clique sur un en-tête de colonne pour trier.</p>
    </div>
  )
}
