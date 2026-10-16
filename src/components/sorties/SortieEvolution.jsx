// Graphique de saison sous le tableau d'une semaine, de la première semaine de la saison (réglée dans les
// paramètres de la page, par défaut AH : S23, PE : S49) jusqu'à la semaine affichée, pour un indicateur au
// choix, avec les filtres du tableau en direct (sauf modèle, référence et couleur, absents des résumés).
// Trois vues : « Par magasin » (une courbe N par magasin), « Top 10 marques » (les 10 marques d'un univers
// au plus fort CANet cumulé sur la saison, une courbe N chacune) — le N-1 dans l'info-bulle — et « Groupe »
// (N bleu canard, N-1 gris en pointillés). S'appuie sur les résumés des semaines.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DIMS, INDICATEURS, RECEP, RESUME_DIMS, SAISON_NOMS, formatIndicateur, indicateurs, pivot, recepActif,
  saisonDe, semaineId, semaineLabel, semaineN1, semainesEntre,
} from '../../lib/sorties'
import { useParametresAchats, useResumes, useSemaines } from '../../lib/sortiesStore'

const SELECT = 'h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const H = 280
const PAD = { top: 12, right: 16, bottom: 26, left: 64 }
// Vue groupe. N : bleu canard (la saison en cours) ; N-1 : gris foncé en pointillés (la référence)
const LINE = {
  n: { stroke: 'stroke-teal-600 dark:stroke-teal-400', fill: 'fill-teal-600 dark:fill-teal-400', dash: undefined, swatch: 'bg-teal-600 dark:bg-teal-400' },
  n1: { stroke: 'stroke-gray-500 dark:stroke-neutral-400', fill: 'fill-gray-500 dark:fill-neutral-400', dash: '6 4', swatch: 'bg-gray-500 dark:bg-neutral-400' },
}
// Vue par magasin : 8 teintes dans un ordre validé pour les daltoniens (clair / sombre), puis les mêmes
// teintes en pointillés. La couleur suit le magasin (ordre alphabétique de tous les magasins), jamais son
// rang : filtrer ou masquer un magasin ne repeint pas les autres. Le nom est écrit au bout de chaque courbe.
const MAG_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const MAG_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const MAG_CSS = `.evo-mag{${MAG_LIGHT.map((c, i) => `--mag-${i}:${c}`).join(';')}}`
  + `.dark .evo-mag{${MAG_DARK.map((c, i) => `--mag-${i}:${c}`).join(';')}}`
const magStyle = i => ({ color: `var(--mag-${i % 8})`, dash: i >= 8 ? '7 4' : undefined })
const LABEL_W = 112 // place à droite pour les noms des magasins

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

// Petit trait de légende (plein ou pointillé) à la couleur de la courbe
function Swatch({ color, dash }) {
  return (
    <svg width="18" height="6" aria-hidden="true" className="shrink-0">
      <line x1="1" x2="17" y1="3" y2="3" style={{ stroke: color }} strokeWidth="2.5" strokeDasharray={dash ? '4 2.5' : undefined} strokeLinecap="round" />
    </svg>
  )
}

function GroupLegend({ labelN, labelN1 }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-neutral-300">
      <span className="flex items-center gap-1.5"><span className={`h-0.5 w-4 rounded ${LINE.n.swatch}`} />N · {labelN}</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-gray-500 dark:border-neutral-400" />N-1 · {labelN1}</span>
    </div>
  )
}

// Noms au bout des courbes, écartés pour ne pas se chevaucher (11 px au moins)
function placeLabels(items, top, bottom) {
  const out = [...items].sort((a, b) => a.y - b.y).map(o => ({ ...o, ly: o.y }))
  for (let i = 1; i < out.length; i++) out[i].ly = Math.max(out[i].ly, out[i - 1].ly + 11)
  for (let i = out.length - 1; i >= 0; i--) out[i].ly = Math.min(out[i].ly, i === out.length - 1 ? bottom : out[i + 1].ly - 11)
  for (const o of out) o.ly = Math.max(top, o.ly)
  return out
}

export default function SortieEvolution({ semaine, filters: tableFilters = {} }) {
  const { list } = useSemaines()
  const [vue, setVue] = useState('magasin')
  const [ind, setInd] = useState('taux')
  // Filtres du tableau : ceux des axes résumés s'appliquent, les autres (modèle, référence, couleur) non
  const filters = useMemo(() => Object.fromEntries(Object.entries(tableFilters).filter(([k, set]) => RESUME_DIMS.includes(k) && set?.size)), [tableFilters])
  const appliques = DIMS.filter(d => filters[d.key])
  // Filtres du tableau absents des résumés : modèle, référence, couleur et période de réception
  const ignores = [
    ...DIMS.filter(d => !RESUME_DIMS.includes(d.key) && tableFilters[d.key]?.size).map(d => d.label),
    ...(recepActif(tableFilters.recep) ? [RECEP.label] : []),
  ]
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())
  const [emph, setEmph] = useState(null)
  const [ref, width] = useWidth()

  const { saisons } = useParametresAchats()
  const saison = saisonDe(semaine, saisons)
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

  // Tous les magasins des semaines chargées (ordre alphabétique : il fixe la couleur de chacun)
  const magasins = useMemo(() => {
    const set = new Set()
    for (const r of data.values()) for (const v of r.dims.magasin) set.add(v)
    return [...set].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  }, [data])
  const def = INDICATEURS.find(i => i.key === ind)

  // Vue groupe : une valeur N et N-1 par semaine
  const series = useMemo(() => weeks.map(w => {
    const val = id => (data.has(id) ? indicateurs(pivot({ n: data.get(id), n1: null, levels: [], filters }).total.n)[ind] : null)
    return { ...w, n: val(w.id), n1: val(w.idN1) }
  }), [weeks, data, filters, ind])

  // Vue par magasin : pour chaque semaine, valeur N et N-1 de chaque magasin
  const parMagasin = useMemo(() => weeks.map(w => {
    if (vue !== 'magasin') return { n: null, n1: null }
    const byMag = id => {
      if (!data.has(id)) return null
      const p = pivot({ n: data.get(id), n1: null, levels: ['magasin'], filters })
      return new Map(p.children('').map(r => [r.label, indicateurs(r.n)[ind]]))
    }
    return { n: byMag(w.id), n1: byMag(w.idN1) }
  }), [vue, weeks, data, filters, ind])
  const magColors = useMemo(() => new Map(magasins.map((m, i) => [m, magStyle(i)])), [magasins])
  const stores = useMemo(() => {
    const set = new Set(parMagasin.flatMap(w => (w.n ? [...w.n.keys()] : [])))
    return magasins.filter(m => set.has(m))
  }, [parMagasin, magasins])

  // Vue top 10 marques : univers au choix parmi ceux filtrés dans le tableau (tous sinon) ; les 10 marques
  // au plus fort CANet N cumulé de la saison, avec les autres filtres du tableau
  const universOptions = useMemo(() => {
    if (filters.univers?.size) return [...filters.univers].sort((a, b) => a.localeCompare(b, 'fr'))
    const set = new Set()
    for (const r of data.values()) for (const v of r.dims.univers) set.add(v)
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [filters.univers, data])
  const [univ, setUniv] = useState('')
  const univActif = universOptions.includes(univ) ? univ : universOptions[0] || ''
  const parMarque = useMemo(() => {
    if (vue !== 'marque' || !univActif) return { perWeek: weeks.map(() => ({ n: null, n1: null })), top: [] }
    const f = { ...filters, univers: new Set([univActif]) }
    const cumul = new Map()
    const perWeek = weeks.map(w => {
      const byBrand = (id, compte) => {
        if (!data.has(id)) return null
        const p = pivot({ n: data.get(id), n1: null, levels: ['marque'], filters: f })
        return new Map(p.children('').map(r => {
          if (compte) cumul.set(r.label, (cumul.get(r.label) || 0) + r.n[0])
          return [r.label, indicateurs(r.n)[ind]]
        }))
      }
      return { n: byBrand(w.id, true), n1: byBrand(w.idN1, false) }
    })
    const top = [...cumul].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m]) => m)
    return { perWeek, top }
  }, [vue, univActif, weeks, data, filters, ind])
  // Couleur d'une marque : ordre alphabétique des 10 (pas leur rang, qui bouge d'une semaine à l'autre)
  const brandColors = useMemo(() => new Map([...parMarque.top].sort((a, b) => a.localeCompare(b, 'fr')).map((m, i) => [m, magStyle(i)])), [parMarque.top])

  const parMarques = vue === 'marque'
  const entities = parMarques ? parMarque.top : stores
  const perWeek = parMarques ? parMarque.perWeek : parMagasin
  const colorOf = parMarques ? brandColors : magColors
  const shown = entities.filter(m => !hidden.has(m))

  const labelN = `${semaineLabel(saison.debut.annee, saison.debut.semaine)} → ${semaineLabel(semaine.annee, semaine.semaine)}`
  const p0 = semaineN1(saison.debut), p1 = semaineN1(semaine)
  const labelN1 = `${semaineLabel(p0.annee, p0.semaine)} → ${semaineLabel(p1.annee, p1.semaine)}`
  const loading = done < imported.length
  const multi = vue !== 'groupe' // une courbe par magasin ou par marque

  // Courbes à tracer : { key, label, vals[semaine], color | cls, dash, width, faded }
  const lines = multi
    ? shown.map(m => ({
      key: m, label: m, vals: perWeek.map(w => w.n?.get(m) ?? null), color: colorOf.get(m).color, dash: colorOf.get(m).dash,
      width: emph === m ? 3.5 : 2, faded: emph != null && emph !== m,
    }))
    : ['n1', 'n'].map(k => ({ key: k, vals: series.map(s => s[k]), cls: LINE[k], dash: LINE[k].dash, width: k === 'n' ? 2.5 : 2 }))

  // Géométrie
  const all = lines.flatMap(l => l.vals).filter(v => v != null)
  const yt = ticks(Math.min(0, ...all), Math.max(0, ...all))
  const y0 = yt[0], y1 = yt.at(-1)
  const right = multi ? LABEL_W : PAD.right
  const plotW = Math.max(100, width - PAD.left - right), plotH = H - PAD.top - PAD.bottom
  const step = weeks.length > 1 ? plotW / (weeks.length - 1) : 0
  const x = i => PAD.left + (weeks.length > 1 ? i * step : plotW / 2)
  const y = v => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH
  const path = vals => vals.reduce((d, v, i) => {
    if (v == null) return d
    return `${d}${i > 0 && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
  }, '')
  const every = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 38)))
  const fmtAxis = v => (def.fmt === 'pct' ? `${Math.round(v * 100)} %` : Math.abs(v) >= 10000 ? `${Math.round(v / 1000).toLocaleString('fr-FR')} k${def.fmt === 'eur' ? '€' : ''}` : formatIndicateur(v, def.fmt))
  const ecart = (a, b) => {
    if (a == null || b == null || (def.fmt !== 'pct' && !b)) return ''
    const d = def.fmt === 'pct' ? (a - b) * 100 : (a - b) / Math.abs(b) * 100
    return `${d > 0 ? '+' : ''}${(Math.round(d * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })}${def.fmt === 'pct' ? ' pt' : ' %'}`
  }
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = weeks.length > 1 ? Math.round((e.clientX - r.left - PAD.left) / step) : 0
    setHover(Math.max(0, Math.min(weeks.length - 1, i)))
  }
  const hw = hover != null ? weeks[hover] : null
  const tipStyle = hover == null ? null : x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }

  // Noms des magasins / marques au bout de leur courbe (dernier point connu)
  const endLabels = multi ? placeLabels(lines.flatMap(l => {
    const i = l.vals.findLastIndex(v => v != null)
    return i < 0 ? [] : [{ key: l.key, label: l.label, color: l.color, faded: l.faded, x: x(i), y: y(l.vals[i]) }]
  }), PAD.top + 4, PAD.top + plotH) : []

  const toggleStore = m => setHidden(s => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n })

  return (
    <section className="evo-mag rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <style>{MAG_CSS}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Depuis le début de la saison {SAISON_NOMS[saison.saison]}</h2>
          <p className="text-[11px] text-gray-500 dark:text-neutral-400">
            {parMarques
              ? `Les 10 marques de ${univActif || 'l’univers choisi'} au plus fort CANet depuis le début de la saison (${labelN}) ; survole une semaine pour lire aussi le N-1.`
              : multi
              ? `Une courbe par magasin (${labelN}) ; survole une semaine pour lire aussi le N-1. Une semaine non importée laisse un trou.`
              : 'Chaque point est une semaine, comparée à la même semaine de l’année précédente. Une semaine non importée laisse un trou dans la courbe.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!multi && <GroupLegend labelN={labelN} labelN1={labelN1} />}
          <button type="button" onClick={() => setAsTable(v => !v)} className="text-xs text-gray-500 dark:text-neutral-400 underline underline-offset-2">
            {asTable ? 'Voir le graphique' : 'Voir le tableau'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vue du graphique" className="inline-flex rounded-lg border border-gray-200 dark:border-neutral-700 p-0.5">
          {[['magasin', 'Par magasin'], ['marque', 'Top 10 marques'], ['groupe', 'Groupe N / N-1']].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={vue === k} onClick={() => { setVue(k); setHover(null); setEmph(null); setHidden(new Set()) }}
              className={`h-7 px-2.5 rounded-md text-xs font-semibold ${vue === k ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-neutral-300'}`}>
              {label}
            </button>
          ))}
        </div>
        {parMarques && (
          <label className="text-xs font-semibold text-gray-700 dark:text-neutral-200">
            Univers{' '}
            <select value={univActif} onChange={e => { setUniv(e.target.value); setHidden(new Set()); setEmph(null) }} className={SELECT}>
              {universOptions.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-gray-700 dark:text-neutral-200">
          Valeur{' '}
          <select value={ind} onChange={e => setInd(e.target.value)} className={SELECT}>
            {INDICATEURS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-gray-500 dark:text-neutral-400">
          Filtres du tableau : {appliques.length
            ? appliques.map(d => `${d.label} (${[...filters[d.key]].slice(0, 3).join(', ')}${filters[d.key].size > 3 ? ` +${filters[d.key].size - 3}` : ''})`).join(' · ')
            : 'aucun'}
        </span>
        {loading && <span className="text-[11px] text-gray-500 dark:text-neutral-400">Chargement des semaines… {done}/{imported.length}</span>}
        {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {ignores.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Le graphique ne tient pas compte {ignores.length > 1 ? 'des filtres' : 'du filtre'} {ignores.join(', ')} du tableau : ce détail n’est pas gardé semaine par semaine pour toute la saison.
          Les autres filtres s’appliquent.
        </p>
      )}

      <div ref={ref} className="relative">
      {asTable ? (
        <div className="overflow-x-auto">
          {multi ? (
            <table className="w-full text-xs tabular-nums">
              <thead><tr className="text-gray-500 dark:text-neutral-400">
                <th className="text-left font-medium py-1 pr-3">Semaine</th>
                {shown.map(m => <th key={m} className="text-right font-medium py-1 px-2 whitespace-nowrap">{m}</th>)}
              </tr></thead>
              <tbody className="text-gray-800 dark:text-neutral-200">
                {weeks.map((w, i) => (
                  <tr key={w.id} className="border-t border-gray-100 dark:border-neutral-800">
                    <td className="py-1 pr-3 whitespace-nowrap">{w.label} {w.annee}</td>
                    {shown.map(m => <td key={m} className="text-right px-2">{formatIndicateur(perWeek[i].n?.get(m), def.fmt)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
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
          )}
        </div>
      ) : (
        <>
          <svg width={width} height={H} role="img" className="block" onMouseMove={onMove} onMouseLeave={() => { setHover(null); setEmph(null) }}
            aria-label={parMarques ? `${def.label} par semaine des 10 premières marques de ${univActif}` : multi ? `${def.label} par semaine et par magasin` : `${def.label} par semaine, N et N-1`}>
            {yt.map(v => (
              <g key={v}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)}
                  className={v === 0 ? 'stroke-gray-300 dark:stroke-neutral-600' : 'stroke-gray-100 dark:stroke-neutral-800'} />
                <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-gray-500 dark:fill-neutral-400 text-[10px] tabular-nums">{fmtAxis(v)}</text>
              </g>
            ))}
            {weeks.map((w, i) => (i % every === 0 || i === weeks.length - 1) && (
              <text key={w.id} x={x(i)} y={H - 8} textAnchor="middle" className="fill-gray-500 dark:fill-neutral-400 text-[10px]">{w.label}</text>
            ))}
            {hw && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-gray-300 dark:stroke-neutral-600" />}
            {/* Courbe mise en avant dessinée en dernier (au-dessus des autres) */}
            {[...lines].sort((a, b) => (a.key === emph) - (b.key === emph)).map(l => (
              <g key={l.key} opacity={l.faded ? 0.15 : 1} style={l.color ? { color: l.color } : undefined}>
                <path d={path(l.vals)} fill="none" strokeWidth={l.width} strokeDasharray={l.dash} strokeLinejoin="round" strokeLinecap="round"
                  stroke={l.color ? 'currentColor' : undefined} className={l.cls?.stroke} />
                {multi && <path d={path(l.vals)} fill="none" stroke="transparent" strokeWidth={12} onMouseEnter={() => setEmph(l.key)} />}
                {l.vals.map((v, i) => v != null && (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : multi ? 2.5 : 3} strokeWidth={1.5}
                    fill={l.color ? 'currentColor' : undefined} className={`${l.cls?.fill || ''} stroke-white dark:stroke-neutral-900`} />
                ))}
              </g>
            ))}
            {endLabels.map(l => (
              <g key={l.key} opacity={l.faded ? 0.25 : 1} style={{ color: l.color }} className="cursor-default" onMouseEnter={() => setEmph(l.key)}>
                {Math.abs(l.ly - l.y) > 2 && <line x1={l.x + 3} x2={l.x + 8} y1={l.y} y2={l.ly} stroke="currentColor" strokeWidth={1} />}
                <text x={l.x + 10} y={l.ly} dy="0.32em" className="fill-gray-700 dark:fill-neutral-200 text-[10px] font-semibold">
                  {l.label.length > 16 ? `${l.label.slice(0, 15)}…` : l.label}
                </text>
              </g>
            ))}
          </svg>
          {hw && !multi && (
            <div className="pointer-events-none absolute z-10 top-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-lg bg-white border-gray-200 text-gray-800 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100" style={tipStyle}>
              <p className="font-semibold mb-0.5">{hw.label} {hw.annee} · {def.label}</p>
              <p className="flex items-center gap-1.5 tabular-nums"><span className={`h-2 w-2 rounded-sm ${LINE.n.swatch}`} />N : {series[hover].n == null ? 'non importée' : formatIndicateur(series[hover].n, def.fmt)}</p>
              <p className="flex items-center gap-1.5 tabular-nums"><span className={`h-2 w-2 rounded-sm ${LINE.n1.swatch}`} />N-1 : {series[hover].n1 == null ? 'non importée' : formatIndicateur(series[hover].n1, def.fmt)}</p>
              {ecart(series[hover].n, series[hover].n1) && <p className="text-gray-500 dark:text-neutral-400 tabular-nums">Écart : {ecart(series[hover].n, series[hover].n1)}</p>}
            </div>
          )}
          {hw && multi && (
            <div className="pointer-events-none absolute z-10 top-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-lg bg-white border-gray-200 text-gray-800 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100" style={tipStyle}>
              <p className="font-semibold mb-1">{hw.label} {hw.annee} · {def.label}</p>
              {perWeek[hover].n ? (
                <table className="tabular-nums">
                  <thead><tr className="text-[10px] text-gray-500 dark:text-neutral-400">
                    <th /><th className="text-right font-medium pl-3">N</th><th className="text-right font-medium pl-3">N-1</th>
                  </tr></thead>
                  <tbody>
                    {shown.map(m => ({ m, v: perWeek[hover].n.get(m) ?? null, r: perWeek[hover].n1?.get(m) ?? null }))
                      .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
                      .map(({ m, v, r }) => (
                        <tr key={m} className={emph && emph !== m ? 'opacity-40' : emph === m ? 'font-semibold' : ''}>
                          <td className="pr-1 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Swatch {...colorOf.get(m)} />{m}</span></td>
                          <td className="text-right pl-3 whitespace-nowrap">{formatIndicateur(v, def.fmt)}</td>
                          <td className="text-right pl-3 whitespace-nowrap text-gray-500 dark:text-neutral-400">{formatIndicateur(r, def.fmt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : <p className="text-gray-500 dark:text-neutral-400">Semaine non importée</p>}
            </div>
          )}
          {!loading && !all.length && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 dark:text-neutral-400">Aucune semaine importée sur la saison avec ces filtres.</p>
          )}
        </>
      )}
      </div>

      {multi && entities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" onMouseLeave={() => setEmph(null)}>
          {entities.map((m, rank) => {
            const off = hidden.has(m)
            return (
              <button key={m} type="button" aria-pressed={!off} onClick={() => toggleStore(m)} onMouseEnter={() => !off && setEmph(m)}
                title={`${off ? 'Afficher' : 'Masquer'} ${parMarques ? 'cette marque' : 'ce magasin'}`}
                className={`h-7 inline-flex items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold ${off
                  ? 'border-dashed border-gray-200 text-gray-400 dark:border-neutral-700 dark:text-neutral-500'
                  : 'border-gray-200 text-gray-700 dark:border-neutral-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800'}`}>
                <span style={{ opacity: off ? 0.3 : 1 }}><Swatch {...colorOf.get(m)} /></span>
                {parMarques && <span className="tabular-nums text-gray-400 dark:text-neutral-500">{rank + 1}.</span>}{m}
              </button>
            )
          })}
          {hidden.size > 0 && (
            <button type="button" onClick={() => setHidden(new Set())} className="text-xs underline text-gray-500 dark:text-neutral-400">Tout afficher</button>
          )}
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            {parMarques ? 'Classées par CANet cumulé de la saison. Clique sur une marque pour la masquer ou l’afficher.' : 'Clique sur un magasin pour le masquer ou l’afficher.'}
          </span>
        </div>
      )}
    </section>
  )
}
