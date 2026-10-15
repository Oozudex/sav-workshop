// Graphiques simples des statistiques de budget (SVG / CSS, sans bibliothèque) : barres horizontales,
// camembert (anneau) avec légende et barres groupées par magasin.
import { useState } from 'react'
import { formatBudget } from '../../lib/budgets'

// Couleurs des catégories (univers, fournisseurs) : distinctes des couleurs des notions de budget
export const CATEGORY_COLORS = ['#0f766e', '#db2777', '#ea580c', '#65a30d', '#0891b2', '#a16207', '#fb7185', '#78716c']
export const OTHERS_COLOR = '#d4d4d4'

const pct = (v, total) => (total > 0 ? `${Math.round((v / total) * 1000) / 10} %`.replace('.', ',') : '—')

export function ChartCard({ title, hint, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 ${className}`}>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {hint && <p className="text-[11px] text-gray-500 dark:text-neutral-400">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

// items : [{ label, value, bar (classe de couleur), sub }]
export function HBars({ items }) {
  const max = Math.max(...items.map(i => i.value || 0), 1)
  return (
    <ul className="space-y-2">
      {items.map(i => (
        <li key={i.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs">
          <span className="text-gray-600 dark:text-neutral-300 truncate">{i.label}</span>
          <span className="h-3 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
            <span className={`block h-full rounded-full ${i.bar}`} style={{ width: `${Math.max(0, (i.value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums font-semibold text-gray-900 dark:text-white whitespace-nowrap">
            {formatBudget(i.value)}{i.sub && <span className="ml-1 font-normal text-gray-500 dark:text-neutral-400">{i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

// Camembert en anneau. data : [{ label, value, color? }] ; center : texte au centre
export function Donut({ data, center, sub, colors = CATEGORY_COLORS }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((t, d) => t + Math.max(d.value, 0), 0)
  const R = 42, C = 2 * Math.PI * R
  let offset = 0
  const slices = data.map((d, i) => {
    const color = d.color || (d.autres ? OTHERS_COLOR : colors[i % colors.length])
    const len = total > 0 ? (Math.max(d.value, 0) / total) * C : 0
    const s = { ...d, color, len, offset }
    offset += len
    return s
  })
  const h = hover != null ? slices[hover] : null
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90" role="img"
        aria-label={data.map(d => `${d.label} ${pct(d.value, total)}`).join(', ')}>
        <circle cx="50" cy="50" r={R} fill="none" className="stroke-gray-100 dark:stroke-neutral-800" strokeWidth="14" />
        {slices.map((s, i) => s.len > 0 && (
          <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth={hover === i ? 16 : 14}
            strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.offset}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <g className="rotate-90 origin-center">
          <text x="50" y={sub || h ? 48 : 53} textAnchor="middle" className="fill-gray-900 dark:fill-white text-[9px] font-bold">
            {h ? pct(h.value, total) : center}
          </text>
          {(sub || h) && (
            <text x="50" y="59" textAnchor="middle" className="fill-gray-500 dark:fill-neutral-400 text-[6px]">
              {h ? h.label.slice(0, 18) : sub}
            </text>
          )}
        </g>
      </svg>
      <ul className="w-full space-y-1 text-xs">
        {slices.map((s, i) => (
          <li key={s.label} className={`flex items-center gap-2 rounded px-1 ${hover === i ? 'bg-gray-50 dark:bg-neutral-800' : ''}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate text-gray-700 dark:text-neutral-300">{s.label}</span>
            <span className="ml-auto tabular-nums text-gray-900 dark:text-white whitespace-nowrap">{formatBudget(s.value)}</span>
            <span className="w-12 text-right tabular-nums text-gray-500 dark:text-neutral-400">{pct(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Barres groupées : groups [{ label, values: { [serie]: n } }], series [{ key, label, bar }]
export function GroupedBars({ groups, series }) {
  const max = Math.max(...groups.flatMap(g => series.map(s => g.values[s.key] || 0)), 1)
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-neutral-300">
        {series.map(s => <li key={s.key} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${s.bar}`} />{s.label}</li>)}
      </ul>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 min-w-max h-44 pt-2">
          {groups.map(g => (
            <div key={g.label} className="flex flex-col items-center gap-1 w-20">
              <div className="flex items-end gap-0.5 h-36">
                {series.map(s => (
                  <span key={s.key} title={`${g.label} · ${s.label} : ${formatBudget(g.values[s.key])}`}
                    className={`w-4 rounded-t ${s.bar}`} style={{ height: `${Math.max(((g.values[s.key] || 0) / max) * 100, 0)}%` }} />
                ))}
              </div>
              <span className="w-full truncate text-center text-[10px] text-gray-600 dark:text-neutral-300" title={g.label}>{g.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
