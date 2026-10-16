// Tableau croisé du taux de sortie (comme un TCD Excel) : lignes sur un ou plusieurs axes dans l'ordre
// choisi (Magasin › Univers › Marque…), filtres sur les valeurs de chaque axe, 15 colonnes : le libellé,
// puis CANet, MtMrg, Marge %, QtRecep, QtVte, QtStkFin et taux de sortie pour N-1 et pour N.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { DIMS, dimLabel, dimValues, indicateurs, pivot } from '../../lib/sorties'
import { TONE } from '../budgets/tones'

const PAGE = 200
// compare : colonne où une hausse par rapport à N-1 est une bonne nouvelle (vert) et une baisse une
// mauvaise (rouge). Réceptions et stock restent neutres (une hausse n'est ni bonne ni mauvaise en soi).
const COLS = [
  { key: 'caNet', label: 'CANet', fmt: 'eur', compare: true },
  { key: 'mtMrg', label: 'MtMrg', fmt: 'eur', compare: true },
  { key: 'marge', label: 'Marge %', fmt: 'pct', compare: true },
  { key: 'qtRecep', label: 'QtRecep', fmt: 'qte' },
  { key: 'qtVte', label: 'QtVte', fmt: 'qte', compare: true },
  { key: 'qtStkFin', label: 'QtStkFin', fmt: 'qte' },
  { key: 'taux', label: 'Taux de sortie', fmt: 'pct', compare: true },
]
// Couleur de chaque période : N-1 en gris (le passé, comme dans les budgets), N en bleu canard (la semaine
// analysée, couleur de la carte Statistiques Achats)
const PERIOD = {
  n1: {
    group: 'bg-gray-200/70 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200',
    head: 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400',
    cell: 'bg-gray-50 text-gray-600 dark:bg-neutral-800/40 dark:text-neutral-300',
    total: 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200',
    edge: 'border-l-2 border-l-gray-300 dark:border-l-neutral-600',
    dot: 'bg-gray-400',
  },
  n: {
    group: 'bg-teal-600 text-white dark:bg-teal-500/80',
    head: 'bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    cell: 'text-gray-900 dark:text-white',
    total: 'bg-teal-50 text-gray-900 dark:bg-teal-500/15 dark:text-white',
    edge: 'border-l-2 border-l-teal-500',
    dot: 'bg-teal-600',
  },
}
const fmt = (v, f) => {
  if (v == null) return '—'
  if (f === 'pct') return `${(Math.round(v * 1000) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} %`
  if (f === 'eur') return `${Math.round(v).toLocaleString('fr-FR')} €`
  return Math.round(v).toLocaleString('fr-FR')
}
const SELECT = 'h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const CHIP = 'h-7 inline-flex items-center gap-1 rounded-lg border px-2 text-xs font-semibold'

// Filtre d'un axe : liste de valeurs à cocher, avec recherche
function FilterButton({ dim, values, selected, onChange }) {
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
  const shown = needle ? values.filter(v => v.toUpperCase().includes(needle)) : values
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
          <input autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Rechercher (${values.length})…`}
            aria-label={`Rechercher dans ${dim.label}`} className="Input h-8 text-xs w-full" />
          <div className="flex gap-2 text-[11px]">
            <button type="button" className="underline text-gray-600 dark:text-neutral-300"
              onClick={() => onChange(new Set([...selected, ...shown.slice(0, 1000)]))}>Tout cocher{needle ? ' (recherche)' : ''}</button>
            {active && <button type="button" className="underline text-gray-600 dark:text-neutral-300" onClick={() => onChange(new Set())}>Effacer</button>}
          </div>
          <ul className="max-h-64 overflow-y-auto space-y-0.5">
            {shown.slice(0, PAGE).map(v => (
              <li key={v}>
                <label className="flex items-center gap-2 px-1 py-0.5 rounded text-xs text-gray-800 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer">
                  <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
                  <span className="truncate">{v}</span>
                </label>
              </li>
            ))}
            {shown.length > PAGE && <li className="px-1 text-[11px] text-gray-500 dark:text-neutral-400">… {shown.length - PAGE} autres : affine la recherche.</li>}
            {shown.length === 0 && <li className="px-1 text-[11px] text-gray-500 dark:text-neutral-400">Aucune valeur.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// Cellules d'une période ; en N, comparaison avec N-1 colorée (vert en hausse, rouge en baisse)
function Cells({ s, ref1, n1 = false, total = false }) {
  const v = indicateurs(s)
  const r = ref1 ? indicateurs(ref1) : null
  const P = PERIOD[n1 ? 'n1' : 'n']
  return COLS.map((c, i) => {
    let tone = ''
    if (!n1 && c.compare && r && v[c.key] != null && r[c.key] != null && v[c.key] && r[c.key]
      && Math.abs(v[c.key] - r[c.key]) > Math.abs(r[c.key]) * 0.0005) {
      tone = v[c.key] > r[c.key] ? `${TONE.engage.text} font-semibold` : `${TONE.depassement.text} font-semibold`
    }
    return (
      <td key={c.key} className={`py-1.5 px-2 text-right text-xs tabular-nums whitespace-nowrap ${total ? `${P.total} py-2` : P.cell} ${tone} ${i === 0 ? P.edge : ''}`}>
        {fmt(v[c.key], c.fmt)}
      </td>
    )
  })
}

export default function SortiePivot({ n, n1, labelN, labelN1, defaultFilters = {} }) {
  const [levels, setLevels] = useState(['magasin'])
  const [filters, setFilters] = useState(defaultFilters)
  const [open, setOpen] = useState(() => new Set())
  const [more, setMore] = useState({})
  const [sort, setSort] = useState({ key: 'caNet', period: 'n', dir: -1 })

  const values = useMemo(() => Object.fromEntries(DIMS.map(d => [d.key, dimValues([n, n1], d.key)])), [n, n1])
  const p = useMemo(() => pivot({ n, n1, levels, filters }), [n, n1, levels, filters])
  const available = DIMS.filter(d => !levels.includes(d.key))
  const activeFilters = DIMS.filter(d => filters[d.key]?.size)

  const setLevel = next => { setLevels(next); setOpen(new Set()); setMore({}) }
  const move = (i, d) => { const l = [...levels]; [l[i], l[i + d]] = [l[i + d], l[i]]; setLevel(l) }
  const toggle = path => setOpen(s => { const x = new Set(s); if (x.has(path)) x.delete(path); else x.add(path); return x })
  const sortVal = row => {
    if (sort.key === 'label') return row.label
    return indicateurs(sort.period === 'n' ? row.n : row.n1)[sort.key] ?? -Infinity
  }
  const children = path => p.children(path).sort((a, b) => {
    const x = sortVal(a), y = sortVal(b)
    return (typeof x === 'string' ? x.localeCompare(y, 'fr', { numeric: true }) : x - y) * sort.dir
  })
  const sortBy = (key, period) => setSort(s => (s.key === key && s.period === period ? { ...s, dir: -s.dir } : { key, period, dir: key === 'label' ? 1 : -1 }))
  const arrow = (key, period) => (sort.key === key && sort.period === period ? (sort.dir < 0 ? ' ↓' : ' ↑') : '')

  function renderRows(path) {
    const rows = children(path)
    const limit = more[path] || PAGE
    return <>
      {rows.slice(0, limit).map(r => {
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
              <Cells s={r.n1} n1 />
              <Cells s={r.n} ref1={r.n1} />
            </tr>
            {canOpen && isOpen && renderRows(r.path)}
          </Fragment>
        )
      })}
      {rows.length > limit && (
        <tr><td colSpan={15} className="py-1.5 pl-4 text-xs">
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-20">Filtres</span>
          {DIMS.map(d => (
            <FilterButton key={d.key} dim={d} values={values[d.key]} selected={filters[d.key] || new Set()}
              onChange={set => setFilters(f => ({ ...f, [d.key]: set }))} />
          ))}
          {activeFilters.length > 0 && (
            <button type="button" onClick={() => setFilters({})} className="text-xs underline text-gray-500 dark:text-neutral-400">Effacer les filtres</button>
          )}
        </div>
        {activeFilters.length > 0 && (
          <p className="text-[11px] text-gray-600 dark:text-neutral-300">
            {activeFilters.map(d => `${d.label} : ${[...filters[d.key]].slice(0, 4).join(', ')}${filters[d.key].size > 4 ? ` +${filters[d.key].size - 4}` : ''}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" onClick={() => sortBy('label', 'n')}
                className={`${th} sticky left-0 z-20 bg-white dark:bg-neutral-900 text-left text-gray-500 dark:text-neutral-400 min-w-[12rem] border-b border-gray-200 dark:border-neutral-700`}>
                {levels.length ? levels.map(dimLabel).join(' › ') : 'Total'}{arrow('label', 'n')}
              </th>
              <th colSpan={7} scope="colgroup" className={`py-1.5 text-xs font-bold text-center ${PERIOD.n1.group} ${PERIOD.n1.edge}`}>N-1 · {labelN1}</th>
              <th colSpan={7} scope="colgroup" className={`py-1.5 text-xs font-bold text-center ${PERIOD.n.group} ${PERIOD.n.edge}`}>N · {labelN}</th>
            </tr>
            <tr>
              {['n1', 'n'].map(period => COLS.map((c, i) => (
                <th key={`${period}-${c.key}`} scope="col" onClick={() => sortBy(c.key, period)} title="Trier"
                  className={`${th} text-right border-b border-gray-200 dark:border-neutral-700 ${i === 0 ? PERIOD[period].edge : ''} ${PERIOD[period].head}`}>
                  {c.label}{arrow(c.key, period)}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>{levels.length > 0 && renderRows('')}</tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-neutral-600 font-bold">
              <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-neutral-900 py-2 pl-2 pr-2 text-left text-xs text-gray-900 dark:text-white border-t border-gray-300 dark:border-neutral-600">
                Total{activeFilters.length ? ' (filtré)' : ''}
              </th>
              <Cells s={p.total.n1} n1 total />
              <Cells s={p.total.n} ref1={p.total.n1} total />
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-neutral-300" aria-label="Légende des couleurs">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${PERIOD.n1.dot}`} />N-1 · {labelN1} (référence)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${PERIOD.n.dot}`} />N · {labelN} (semaine analysée)</li>
        <li className={`font-semibold ${TONE.engage.text}`}>En hausse par rapport à N-1</li>
        <li className={`font-semibold ${TONE.depassement.text}`}>En baisse par rapport à N-1</li>
      </ul>
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">
        Marge % = MtMrg ÷ (CANet ÷ 1,20). Taux de sortie = QtVte ÷ (QtVte + QtStkFin). Sur une ligne regroupée, les montants et quantités
        sont additionnés puis les % recalculés. Vert et rouge sur CANet, MtMrg, Marge %, QtVte et taux de sortie (une hausse y est une bonne nouvelle) ;
        QtRecep et QtStkFin restent neutres. Clique sur un en-tête de colonne pour trier.
      </p>
    </div>
  )
}
