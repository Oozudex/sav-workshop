// Statistiques OBUT (acheteurs et direction) : volumes et chiffre d'affaires, N vs N-1
import { useMemo, useState } from 'react'
import { formatEuro } from '../../lib/orders'

const MONTHS_FR    = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const MONTHS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function StatCard({ label, value, sub, color = 'teal', trend }) {
  const cls = {
    teal:   { wrap: 'from-teal-50 to-teal-100/50 dark:from-teal-500/10 dark:to-teal-500/5 border-teal-200 dark:border-teal-500/30', val: 'text-teal-700 dark:text-teal-300' },
    blue:   { wrap: 'from-blue-50 to-blue-100/50 dark:from-blue-500/10 dark:to-blue-500/5 border-blue-200 dark:border-blue-500/30', val: 'text-blue-700 dark:text-blue-300' },
    violet: { wrap: 'from-violet-50 to-violet-100/50 dark:from-violet-500/10 dark:to-violet-500/5 border-violet-200 dark:border-violet-500/30', val: 'text-violet-700 dark:text-violet-300' },
    amber:  { wrap: 'from-amber-50 to-amber-100/50 dark:from-amber-500/10 dark:to-amber-500/5 border-amber-200 dark:border-amber-500/30', val: 'text-amber-700 dark:text-amber-300' },
  }[color] || {}
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${cls.wrap} border p-4 space-y-1`}>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold tabular-nums ${cls.val}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-neutral-500">{sub}</p>}
      {trend !== undefined && trend !== null && (
        <p className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} % vs N-1
        </p>
      )}
    </div>
  )
}

function ObutBarChart({ data }) {
  const max = Math.max(...data.map(d => Math.max(d.current || 0, d.previous || 0)), 1)
  return (
    <div className="flex items-end gap-1.5 h-32 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <div className="w-full flex items-end justify-center gap-px h-24">
            <div className="w-[46%] bg-indigo-500 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d.current || 0) / max) * 100}%`, minHeight: d.current > 0 ? '3px' : '0' }}
              title={`${d.current || 0}`} />
            <div className="w-[46%] bg-gray-200 dark:bg-neutral-600 rounded-t-sm transition-all duration-300"
              style={{ height: `${((d.previous || 0) / max) * 100}%`, minHeight: d.previous > 0 ? '3px' : '0' }}
              title={`${d.previous || 0}`} />
          </div>
          <span className="text-[8px] text-gray-400 dark:text-neutral-500 leading-none truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  )
}



export default function ObutStats({ commandes, magasins }) {
  const now          = new Date()
  const currentYear  = now.getFullYear()
  const prevYear     = currentYear - 1
  const currentMonth = now.getMonth()

  const [periode,      setPeriode]      = useState('annee')
  const [selectedYear, setSelectedYear] = useState(currentYear)

  const valid = useMemo(
    () => commandes.filter(c => c.statut !== 'annule' && c.dateCommande),
    [commandes]
  )

  const pad = n => String(n).padStart(2, '0')

  const byMonthKey = useMemo(() => {
    const map = {}
    valid.forEach(c => {
      const key = c.dateCommande.slice(0, 7)
      if (!map[key]) map[key] = { count: 0, revenue: 0 }
      map[key].count++
      map[key].revenue += c.totalTTC || 0
    })
    return map
  }, [valid])

  const byYear = useMemo(() => {
    const map = {}
    valid.forEach(c => {
      const y = c.dateCommande.slice(0, 4)
      if (!map[y]) map[y] = { count: 0, revenue: 0 }
      map[y].count++
      map[y].revenue += c.totalTTC || 0
    })
    return map
  }, [valid])

  const thisYearData  = byYear[String(currentYear)] || { count: 0, revenue: 0 }
  const lastYearData  = byYear[String(prevYear)]    || { count: 0, revenue: 0 }

  const yoyCount = lastYearData.count   > 0 ? Math.round((thisYearData.count   - lastYearData.count)   / lastYearData.count   * 100) : null
  const yoyCA    = lastYearData.revenue > 0 ? Math.round((thisYearData.revenue - lastYearData.revenue) / lastYearData.revenue * 100) : null

  const availableYears = useMemo(() => [...new Set(valid.map(c => c.dateCommande.slice(0, 4)))].sort((a, b) => b - a), [valid])

  const filtered = useMemo(() => valid.filter(c => {
    const y = Number(c.dateCommande.slice(0, 4))
    const m = Number(c.dateCommande.slice(5, 7)) - 1
    if (periode === 'annee') return y === selectedYear
    if (periode === 'ytd')   return y === currentYear
    if (periode === 'mois')  return y === currentYear && m === currentMonth
    return true
  }), [valid, periode, selectedYear, currentYear, currentMonth])

  const filteredCA = filtered.reduce((s, c) => s + (c.totalTTC || 0), 0)

  const monthlyComparison = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    label:    MONTHS_FR[i],
    current:  byMonthKey[`${currentYear}-${pad(i + 1)}`]?.count || 0,
    previous: byMonthKey[`${prevYear}-${pad(i + 1)}`]?.count   || 0,
  })), [byMonthKey, currentYear, prevYear])

  const tableYear  = periode === 'ytd' ? currentYear : selectedYear
  const showTable  = periode === 'annee' || periode === 'ytd'
  const monthlyTable = useMemo(() => !showTable ? null : MONTHS_LONG.map((label, i) => {
    const curr = byMonthKey[`${tableYear}-${pad(i + 1)}`]     || { count: 0, revenue: 0 }
    const prev = byMonthKey[`${tableYear - 1}-${pad(i + 1)}`] || { count: 0, revenue: 0 }
    return { label, curr, prev, diff: curr.count - prev.count }
  }), [byMonthKey, showTable, tableYear])

  const tableTotals = monthlyTable ? {
    curr: monthlyTable.reduce((s, r) => s + r.curr.count, 0),
    prev: monthlyTable.reduce((s, r) => s + r.prev.count, 0),
    ca:   monthlyTable.reduce((s, r) => s + r.curr.revenue, 0),
    diff: monthlyTable.reduce((s, r) => s + r.diff, 0),
  } : null

  const byModel = useMemo(() => {
    const map = {}
    filtered.forEach(c => {
      const key = c.modele || '—'
      if (!map[key]) map[key] = { count: 0, revenue: 0 }
      map[key].count++
      map[key].revenue += c.totalTTC || 0
    })
    return map
  }, [filtered])

  const sortedModels = Object.entries(byModel)
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.count - a.count)
  const maxModel = Math.max(...sortedModels.map(m => m.count), 1)

  const byMagasin = useMemo(() => {
    const map = {}
    filtered.forEach(c => { map[c.magasinId] = (map[c.magasinId] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])
  const maxMagasin = byMagasin[0]?.[1] || 1

  if (valid.length === 0) {
    return <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">Aucune commande enregistrée pour afficher des statistiques.</div>
  }

  return (
    <div className="space-y-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label="Total commandes" value={valid.length} sub="Toutes années confondues" color="blue" />
        <StatCard label="Chiffre d'affaires total" value={formatEuro(Math.round(valid.reduce((s, c) => s + (c.totalTTC || 0), 0))).replace(',00', '')} sub="Toutes années confondues" color="teal" />
        <StatCard label="Cette année" value={thisYearData.count} sub={String(currentYear)} color="violet" trend={yoyCount} />
        <StatCard label="CA cette année" value={formatEuro(Math.round(thisYearData.revenue)).replace(',00', '')} sub={String(currentYear)} color="amber" trend={yoyCA} />
      </div>

      {/* Bar chart N vs N-1 */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Commandes par mois — N vs N-1</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-neutral-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-indigo-500 inline-block" />{currentYear}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gray-300 dark:bg-neutral-600 inline-block" />{prevYear}</span>
          </div>
        </div>
        <ObutBarChart data={monthlyComparison} />
      </div>

      {/* Analyse par période */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Analyse par période</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="Input h-8 text-xs px-2" value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="mois">Ce mois</option>
              <option value="annee">Par année</option>
              <option value="ytd">Depuis début d'année</option>
              <option value="tout">Tout</option>
            </select>
            {periode === 'annee' && (
              <select className="Input h-8 text-xs px-2" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-neutral-800 border-y border-gray-100 dark:border-neutral-800 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pr-3 sm:pr-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Commandes</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{filtered.length}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pl-3 sm:pl-4">
            <p className="text-xs text-gray-500 dark:text-neutral-400">Chiffre d'affaires</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-gray-800 dark:text-neutral-100">{filteredCA.toFixed(0)} €</p>
          </div>
        </div>

        {sortedModels.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Par modèle</p>
            {sortedModels.map(m => (
              <div key={m.model} className="flex items-center gap-3">
                <p className="text-xs text-gray-600 dark:text-neutral-300 w-20 sm:w-24 shrink-0 truncate font-medium" title={m.model}>{m.model}</p>
                <div className="flex-1 h-3.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${(m.count / maxModel) * 100}%` }} />
                </div>
                <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-6 text-right shrink-0">{m.count}</p>
                <p className="hidden sm:block text-xs text-gray-400 dark:text-neutral-500 w-16 text-right shrink-0 tabular-nums">{m.revenue.toFixed(0)} €</p>
              </div>
            ))}
          </div>
        )}

        {byMagasin.length > 1 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Par magasin</p>
            {byMagasin.map(([magId, count]) => {
              const nom = magasins.find(m => m.id === magId)?.nom || magId
              return (
                <div key={magId} className="flex items-center gap-3">
                  <p className="text-xs text-gray-600 dark:text-neutral-300 w-24 sm:w-28 shrink-0 truncate" title={nom}>{nom}</p>
                  <div className="flex-1 h-3.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${(count / maxMagasin) * 100}%` }} />
                  </div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200 w-6 text-right shrink-0">{count}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Table mensuelle */}
      {showTable && monthlyTable && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Détail mensuel — {tableYear}</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-xs tabular-nums">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                <th className="text-left px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Mois</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear}</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">{tableYear - 1}</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">Évol.</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-500 dark:text-neutral-400">CA {tableYear}</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTable.map(({ label, curr, prev, diff }, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2 text-gray-700 dark:text-neutral-300">{label}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-white">{curr.count || '—'}</td>
                  <td className="px-4 py-2 text-right text-gray-400 dark:text-neutral-500">{prev.count || '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-neutral-600'}`}>
                    {curr.count === 0 && prev.count === 0 ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-neutral-400">{curr.revenue > 0 ? `${curr.revenue.toFixed(0)} €` : '—'}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-neutral-800/50 font-semibold border-t-2 border-gray-200 dark:border-neutral-700">
                <td className="px-4 py-2.5 text-gray-800 dark:text-neutral-200">Total</td>
                <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{tableTotals.curr}</td>
                <td className="px-4 py-2.5 text-right text-gray-500 dark:text-neutral-400">{tableTotals.prev}</td>
                <td className={`px-4 py-2.5 text-right ${tableTotals.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : tableTotals.diff < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-neutral-600'}`}>
                  {tableTotals.diff > 0 ? `+${tableTotals.diff}` : tableTotals.diff === 0 ? '=' : tableTotals.diff}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">{tableTotals.ca.toFixed(0)} €</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
