// Briques communes des panneaux de statistiques (tickets SAV, commandes clients)
import { useEffect, useState } from 'react'
import { PERIODS } from '../lib/ticketStats'

// Palette catégorielle validée (skill dataviz, slots 1-2) : année N en bleu, N-1 en orange
export const SERIES = {
  current: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  previous: 'bg-[#eb6834] dark:bg-[#d95926]',
}
export const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

export const fmtNum = (n, digits = 0) => n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
export const fmtPct = r => r == null ? '—' : `${Math.round(r * 100)} %`
export const fmtDays = d => d == null ? '—' : `${fmtNum(d, 1)} j`

// Évolution par rapport à N-1. `better` : 'up' | 'down' | null (sens neutre)
export function delta(current, previous, { kind = 'count', better = null } = {}) {
  if (current == null || previous == null) return { text: 'pas de données N-1', tone: 'none' }
  let diff, text
  if (kind === 'count') {
    if (previous === 0) return { text: current ? 'nouveau' : '=', tone: 'none' }
    diff = (current - previous) / previous
    text = `${diff > 0 ? '+' : ''}${Math.round(diff * 100)} %`
  } else if (kind === 'rate') {
    diff = current - previous
    text = `${diff > 0 ? '+' : ''}${Math.round(diff * 100)} pts`
  } else {
    diff = current - previous
    text = `${diff > 0 ? '+' : ''}${fmtNum(diff, 1)} j`
  }
  if (Math.abs(diff) < 1e-9) return { text: '=', tone: 'none' }
  const tone = !better ? 'neutral' : (diff > 0) === (better === 'up') ? 'good' : 'bad'
  return { text, tone, up: diff > 0 }
}

const TONE = {
  good: 'text-emerald-700 dark:text-emerald-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-gray-500 dark:text-neutral-400',
  none: 'text-gray-400 dark:text-neutral-500',
}

export function Kpi({ label, value, previous, d, hint }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5">
      <p className="text-xs text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
      <p className={`text-xs mt-1 ${TONE[d.tone]}`}>
        {d.tone !== 'none' && <span aria-hidden>{d.up ? '▲ ' : '▼ '}</span>}
        {d.text}
        {previous != null && <span className="text-gray-400 dark:text-neutral-500"> · N-1 : {previous}</span>}
      </p>
      {hint && <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-1">{hint}</p>}
    </div>
  )
}

export function Section({ title, subtitle, children, action }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-neutral-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-neutral-300">
      <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${SERIES.current}`} />Année N</span>
      <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${SERIES.previous}`} />Année N-1</span>
    </div>
  )
}

// Histogramme mensuel N / N-1 avec info-bulle au survol et vue tableau
export function MonthlyChart({ title, current, previous, year }) {
  const [hover, setHover] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...current, ...previous)

  return (
    <Section
      title={title}
      subtitle={`${year} comparé à ${year - 1}`}
      action={
        <div className="flex items-center gap-4">
          <Legend />
          <button onClick={() => setAsTable(v => !v)} className="text-xs text-gray-500 dark:text-neutral-400 underline underline-offset-2">
            {asTable ? 'Voir le graphique' : 'Voir le tableau'}
          </button>
        </div>
      }
    >
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-gray-500 dark:text-neutral-400">
              <th className="text-left font-medium py-1">Mois</th>
              <th className="text-right font-medium py-1">{year}</th>
              <th className="text-right font-medium py-1">{year - 1}</th>
            </tr></thead>
            <tbody className="text-gray-800 dark:text-neutral-200">
              {MONTHS.map((m, i) => (
                <tr key={m} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="py-1">{m}</td><td className="text-right">{current[i]}</td><td className="text-right">{previous[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="h-40 flex items-end gap-1 border-b border-gray-200 dark:border-neutral-700" onMouseLeave={() => setHover(null)}>
            {MONTHS.map((m, i) => (
              <div key={m} className="relative flex-1 h-full flex items-end justify-center gap-0.5 cursor-default"
                onMouseEnter={() => setHover(i)}>
                <div className={`w-full max-w-3 rounded-t-[4px] ${SERIES.current}`} style={{ height: `${(current[i] / max) * 100}%` }} />
                <div className={`w-full max-w-3 rounded-t-[4px] ${SERIES.previous}`} style={{ height: `${(previous[i] / max) * 100}%` }} />
                {hover === i && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-lg
                                  bg-white border-gray-200 text-gray-800 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100">
                    <p className="font-semibold mb-0.5">{m}</p>
                    <p className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${SERIES.current}`} />{year} : {current[i]}</p>
                    <p className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${SERIES.previous}`} />{year - 1} : {previous[i]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {MONTHS.map(m => <span key={m} className="flex-1 text-center text-[10px] text-gray-500 dark:text-neutral-400">{m}</span>)}
          </div>
        </div>
      )}
    </Section>
  )
}

// Barres horizontales appariées N / N-1 : rows = [[libellé, valeur N, valeur N-1]]
export function PairedBars({ rows, format = fmtDays, empty = 'Aucune donnée sur la période.' }) {
  const shown = rows.filter(([, c, p]) => c != null || p != null)
  const max = Math.max(0.1, ...shown.flatMap(([, c, p]) => [c || 0, p || 0]))
  if (!shown.length) return <p className="text-xs text-gray-400 dark:text-neutral-500">{empty}</p>
  return (
    <div className="space-y-2.5">
      {shown.map(([label, c, p]) => (
        <div key={label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
          <span className="text-xs text-gray-600 dark:text-neutral-300 truncate">{label}</span>
          <div className="space-y-0.5">
            {[['current', c], ['previous', p]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div className={`h-2.5 rounded-r-[4px] ${SERIES[k]}`} style={{ width: `${((v || 0) / max) * 85}%`, minWidth: v ? 2 : 0 }} />
                <span className="text-[11px] text-gray-600 dark:text-neutral-300 tabular-nums">{format(v)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Classement simple (une seule série) avec rappel de la valeur N-1
export function Ranking({ title, rows, previousRows }) {
  const prev = Object.fromEntries(previousRows)
  const max = Math.max(1, ...rows.map(r => r[1]))
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">{title}</p>
      {rows.length === 0 ? <p className="text-xs text-gray-400 dark:text-neutral-500">Aucune donnée.</p> : (
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map(([name, n]) => (
            <li key={name} className="text-xs">
              <div className="flex justify-between gap-2 text-gray-700 dark:text-neutral-200">
                <span className="truncate">{name}</span>
                <span className="tabular-nums shrink-0">{n}<span className="text-gray-400 dark:text-neutral-500"> · N-1 {prev[name] || 0}</span></span>
              </div>
              <div className="h-1.5 mt-0.5 rounded-full bg-gray-100 dark:bg-neutral-800">
                <div className={`h-full rounded-full ${SERIES.current}`} style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Chiffre clé sans comparaison (état actuel)
export function Tile({ label, value, alert = false }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5">
      <p className="text-xs text-gray-500 dark:text-neutral-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
        {alert ? '⚠ ' : ''}{value}
      </p>
    </div>
  )
}

// Barres simples (une série) : rows = [[libellé, valeur]]
export function BarList({ rows }) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3.5 space-y-1.5">
      {rows.map(([label, n]) => (
        <div key={label} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-xs">
          <span className="text-gray-600 dark:text-neutral-300 truncate">{label}</span>
          <div className="h-2 rounded-r-[4px]">
            <div className={`h-full rounded-r-[4px] ${SERIES.current}`} style={{ width: `${(n / max) * 100}%`, minWidth: n ? 2 : 0 }} />
          </div>
          <span className="text-right tabular-nums text-gray-700 dark:text-neutral-200">{n}</span>
        </div>
      ))}
    </div>
  )
}

/** Fenêtre de statistiques : en-tête, choix de la période, avertissement si pas d'historique N-1. */
export function StatsModalShell({ title, subtitle, period, setPeriod, hasHistory, onClose, children }) {
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 pt-[4vh] bg-black/50 backdrop-blur-sm overflow-y-auto"
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-5xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">{subtitle} · comparé à la même période l'an dernier</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center h-8 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
              {Object.entries(PERIODS).map(([k, label]) => (
                <button key={k} onClick={() => setPeriod(k)}
                  className={`h-full px-2.5 text-xs font-medium transition-colors ${period === k
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={onClose} aria-label="Fermer"
              className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-5 space-y-7">
          {!hasHistory && (
            <p className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30">
              Pas encore d'historique sur l'année précédente : les comparaisons N-1 se rempliront au fil du temps.
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
