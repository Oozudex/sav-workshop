// Graphique de saison sous le tableau d'une semaine : une courbe par année (N bleu canard, N-1 gris en
// pointillés) de la première semaine de la saison (AH : S23, PE : S49) jusqu'à la semaine affichée, pour
// un indicateur au choix, filtrable par magasin, univers et segment. S'appuie sur les résumés des semaines.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  INDICATEURS, RESUME_DIMS, SAISON_NOMS, dimLabel, formatIndicateur, indicateurs, pivot, possibleValues,
  saisonDe, semaineId, semaineLabel, semaineN1, semainesEntre,
} from '../../lib/sorties'
import { useResumes, useSemaines } from '../../lib/sortiesStore'
import { FilterButton } from './SortiePivot'

const SELECT = 'h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const H = 260
const PAD = { top: 12, right: 16, bottom: 26, left: 64 }
// N : bleu canard (la saison en cours) ; N-1 : gris foncé en pointillés (la référence), lisible sans couleur
const LINE = {
  n: { stroke: 'stroke-teal-600 dark:stroke-teal-400', fill: 'fill-teal-600 dark:fill-teal-400', dash: undefined, swatch: 'bg-teal-600 dark:bg-teal-400' },
  n1: { stroke: 'stroke-gray-500 dark:stroke-neutral-400', fill: 'fill-gray-500 dark:fill-neutral-400', dash: '6 4', swatch: 'bg-gray-500 dark:bg-neutral-400' },
}

// Graduations « rondes » de l'axe vertical (0 compris)
function ticks(min, max) {
  const lo = Math.min(0, min), hi = max > lo ? max : lo + 1
  const raw = (hi - lo) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)
  const out = []
  for (let v = Math.floor(lo / step) * step; v < hi + step * 0.999; v += step) out.push(Math.round(v / step) * step)
  return out
}

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(800)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Legend({ labelN, labelN1 }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-neutral-300">
      <span className="flex items-center gap-1.5"><span className={`h-0.5 w-4 rounded ${LINE.n.swatch}`} />N · {labelN}</span>
      <span className="flex items-center gap-1.5"><span className={`h-0.5 w-4 rounded border-t-2 border-dashed border-gray-500 dark:border-neutral-400`} />N-1 · {labelN1}</span>
    </div>
  )
}

export default function SortieEvolution({ semaine, defaultFilters = {} }) {
  const { list } = useSemaines()
  const [ind, setInd] = useState('taux')
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(defaultFilters).filter(([k]) => RESUME_DIMS.includes(k))))
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState(null)
  const [ref, width] = useWidth()

  const saison = saisonDe(semaine)
  const weeks = useMemo(() => semainesEntre(saison.debut, semaine).map(w => {
    const p = semaineN1(w)
    return { ...w, id: semaineId(w.annee, w.semaine), idN1: semaineId(p.annee, p.semaine), label: `S${String(w.semaine).padStart(2, '0')}` }
  }), [saison.debut.annee, saison.debut.semaine, semaine.annee, semaine.semaine]) // eslint-disable-line react-hooks/exhaustive-deps

  // Semaines importées de la saison (N et N-1)
  const imported = useMemo(() => {
    const byId = new Map(list.filter(s => s.fichier).map(s => [s.id, s]))
    const ids = new Set(weeks.flatMap(w => [w.id, w.idN1]))
    return [...ids].map(id => byId.get(id)).filter(Boolean)
  }, [list, weeks])
  const { data, done, error } = useResumes(imported)

  const values = useMemo(() => Object.fromEntries(RESUME_DIMS.map(k => {
    const set = new Set()
    for (const r of data.values()) for (const v of r.dims[k]) set.add(v)
    return [k, [...set].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))]
  })), [data])
  const possible = useMemo(() => possibleValues([...data.values()], filters, RESUME_DIMS), [data, filters])
  const def = INDICATEURS.find(i => i.key === ind)
  const series = useMemo(() => weeks.map(w => {
    const val = id => (data.has(id) ? indicateurs(pivot({ n: data.get(id), n1: null, levels: [], filters }).total.n)[ind] : null)
    return { ...w, n: val(w.id), n1: val(w.idN1) }
  }), [weeks, data, filters, ind])

  const labelN = `${semaineLabel(saison.debut.annee, saison.debut.semaine)} → ${semaineLabel(semaine.annee, semaine.semaine)}`
  const p0 = semaineN1(saison.debut), p1 = semaineN1(semaine)
  const labelN1 = `${semaineLabel(p0.annee, p0.semaine)} → ${semaineLabel(p1.annee, p1.semaine)}`
  const activeFilters = RESUME_DIMS.filter(k => filters[k]?.size)
  const loading = done < imported.length

  // Géométrie
  const all = series.flatMap(s => [s.n, s.n1]).filter(v => v != null)
  const yt = ticks(Math.min(0, ...all), Math.max(0, ...all))
  const y0 = yt[0], y1 = yt.at(-1)
  const plotW = Math.max(100, width - PAD.left - PAD.right), plotH = H - PAD.top - PAD.bottom
  const step = series.length > 1 ? plotW / (series.length - 1) : 0
  const x = i => PAD.left + (series.length > 1 ? i * step : plotW / 2)
  const y = v => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH
  const path = key => series.reduce((d, s, i) => {
    if (s[key] == null) return d
    const prev = i > 0 && series[i - 1][key] != null
    return `${d}${prev ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`
  }, '')
  const every = Math.ceil(series.length / Math.max(1, Math.floor(plotW / 38)))
  const fmtAxis = v => (def.fmt === 'pct' ? `${Math.round(v * 100)} %` : Math.abs(v) >= 10000 ? `${Math.round(v / 1000).toLocaleString('fr-FR')} k${def.fmt === 'eur' ? '€' : ''}` : formatIndicateur(v, def.fmt))
  const ecart = (a, b) => {
    if (a == null || b == null || (def.fmt !== 'pct' && !b)) return ''
    const d = def.fmt === 'pct' ? (a - b) * 100 : (a - b) / Math.abs(b) * 100
    return `${d > 0 ? '+' : ''}${(Math.round(d * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })}${def.fmt === 'pct' ? ' pt' : ' %'}`
  }
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = series.length > 1 ? Math.round((px - PAD.left) / step) : 0
    setHover(Math.max(0, Math.min(series.length - 1, i)))
  }
  const h = hover != null ? series[hover] : null

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Depuis le début de la saison {SAISON_NOMS[saison.saison]}</h2>
          <p className="text-[11px] text-gray-500 dark:text-neutral-400">
            Chaque point est une semaine, comparée à la même semaine de l’année précédente. Une semaine non importée laisse un trou dans la courbe.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Legend labelN={labelN} labelN1={labelN1} />
          <button type="button" onClick={() => setAsTable(v => !v)} className="text-xs text-gray-500 dark:text-neutral-400 underline underline-offset-2">
            {asTable ? 'Voir le graphique' : 'Voir le tableau'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-gray-700 dark:text-neutral-200">
          Valeur{' '}
          <select value={ind} onChange={e => setInd(e.target.value)} className={SELECT}>
            {INDICATEURS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </label>
        {RESUME_DIMS.map(k => (
          <FilterButton key={k} dim={{ key: k, label: dimLabel(k) }} values={values[k]} possible={possible[k]} selected={filters[k] || new Set()}
            onChange={set => setFilters(f => ({ ...f, [k]: set }))} />
        ))}
        {activeFilters.length > 0 && (
          <button type="button" onClick={() => setFilters({})} className="text-xs underline text-gray-500 dark:text-neutral-400">Effacer les filtres</button>
        )}
        {loading && <span className="text-[11px] text-gray-500 dark:text-neutral-400">Chargement des semaines… {done}/{imported.length}</span>}
        {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
      </div>

      <div ref={ref} className="relative">
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-gray-500 dark:text-neutral-400">
              <th className="text-left font-medium py-1">Semaine</th>
              <th className="text-right font-medium py-1">N</th>
              <th className="text-right font-medium py-1">N-1</th>
              <th className="text-right font-medium py-1">Écart</th>
            </tr></thead>
            <tbody className="text-gray-800 dark:text-neutral-200">
              {series.map(s => (
                <tr key={s.id} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="py-1">{s.label} {s.annee}</td>
                  <td className="text-right">{formatIndicateur(s.n, def.fmt)}</td>
                  <td className="text-right">{formatIndicateur(s.n1, def.fmt)}</td>
                  <td className="text-right">{ecart(s.n, s.n1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg width={width} height={H} role="img" aria-label={`${def.label} par semaine, N et N-1`} className="block"
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {yt.map(v => (
              <g key={v}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)}
                  className={v === 0 ? 'stroke-gray-300 dark:stroke-neutral-600' : 'stroke-gray-100 dark:stroke-neutral-800'} />
                <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-gray-500 dark:fill-neutral-400 text-[10px] tabular-nums">{fmtAxis(v)}</text>
              </g>
            ))}
            {series.map((s, i) => (i % every === 0 || i === series.length - 1) && (
              <text key={s.id} x={x(i)} y={H - 8} textAnchor="middle" className="fill-gray-500 dark:fill-neutral-400 text-[10px]">{s.label}</text>
            ))}
            {h && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-gray-300 dark:stroke-neutral-600" />}
            {['n1', 'n'].map(k => (
              <g key={k}>
                <path d={path(k)} fill="none" strokeWidth={k === 'n' ? 2.5 : 2} strokeDasharray={LINE[k].dash} strokeLinejoin="round" strokeLinecap="round" className={LINE[k].stroke} />
                {series.map((s, i) => s[k] != null && (
                  <circle key={s.id} cx={x(i)} cy={y(s[k])} r={hover === i ? 4.5 : 3} strokeWidth={1.5}
                    className={`${LINE[k].fill} stroke-white dark:stroke-neutral-900`} />
                ))}
              </g>
            ))}
          </svg>
          {h && (
            <div className="pointer-events-none absolute z-10 top-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-lg bg-white border-gray-200 text-gray-800 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100"
              style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}>
              <p className="font-semibold mb-0.5">{h.label} {h.annee} · {def.label}</p>
              <p className="flex items-center gap-1.5 tabular-nums"><span className={`h-2 w-2 rounded-sm ${LINE.n.swatch}`} />N : {h.n == null ? 'non importée' : formatIndicateur(h.n, def.fmt)}</p>
              <p className="flex items-center gap-1.5 tabular-nums"><span className={`h-2 w-2 rounded-sm ${LINE.n1.swatch}`} />N-1 : {h.n1 == null ? 'non importée' : formatIndicateur(h.n1, def.fmt)}</p>
              {ecart(h.n, h.n1) && <p className="text-gray-500 dark:text-neutral-400 tabular-nums">Écart : {ecart(h.n, h.n1)}</p>}
            </div>
          )}
          {!loading && !all.length && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 dark:text-neutral-400">Aucune semaine importée sur la saison avec ces filtres.</p>
          )}
        </>
      )}
      </div>
    </section>
  )
}
