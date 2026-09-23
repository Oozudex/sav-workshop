import { useMemo, useState } from 'react'
import { STATUS_LABELS } from '../lib/constants'
import {
  OPEN_STATUSES, PERIODS, computePeriodStats, computeSnapshot, monthlyCreated, periodRange, previousYear,
} from '../lib/ticketStats'
import {
  BarList, Kpi, Legend, MonthlyChart, PairedBars, Ranking, Section, StatsModalShell, Tile,
  delta, fmtDays, fmtNum, fmtPct,
} from './StatsPanel'

/** Panneau de statistiques de l'atelier vélo, comparées à la même période de l'année précédente. */
export default function TicketStatsModal({ tickets, magasinNom, onClose }) {
  const [period, setPeriod] = useState('month')
  const now = useMemo(() => new Date(), [])

  const { cur, prev, snap, monthsN, monthsN1 } = useMemo(() => {
    const range = periodRange(period, now)
    return {
      cur: computePeriodStats(tickets, range, now),
      prev: computePeriodStats(tickets, previousYear(range), now),
      snap: computeSnapshot(tickets, now),
      monthsN: monthlyCreated(tickets, now.getFullYear()),
      monthsN1: monthlyCreated(tickets, now.getFullYear() - 1),
    }
  }, [tickets, period, now])

  return (
    <StatsModalShell
      title="Statistiques de l'atelier vélo"
      subtitle={magasinNom || 'Tous les magasins'}
      period={period} setPeriod={setPeriod}
      hasHistory={monthsN1.some(Boolean)}
      onClose={onClose}
    >
      <Section title="En ce moment" subtitle="Tickets non clôturés">
        <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,10rem))_1fr] gap-3">
          <Tile label="Vélos à l'atelier" value={snap.open} />
          <Tile label="En retard" value={snap.overdue} alert={snap.overdue > 0} />
          <Tile label="Âge moyen" value={fmtDays(snap.avgAgeDays)} />
          <BarList rows={snap.byStatus.map(([s, n]) => [STATUS_LABELS[s], n])} />
        </div>
      </Section>

      <Section title={PERIODS[period]} subtitle="Évolution par rapport à la même période N-1">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Tickets créés" value={fmtNum(cur.created)} previous={fmtNum(prev.created)}
            d={delta(cur.created, prev.created)} />
          <Kpi label="Tickets clôturés" value={fmtNum(cur.closed)} previous={fmtNum(prev.closed)}
            d={delta(cur.closed, prev.closed)} />
          <Kpi label="Délai moyen de réparation" value={fmtDays(cur.avgRepairDays)} previous={fmtDays(prev.avgRepairDays)}
            d={delta(cur.avgRepairDays, prev.avgRepairDays, { kind: 'days', better: 'down' })}
            hint="De la création à la clôture" />
          <Kpi label="Rendus à la date prévue" value={fmtPct(cur.onTimeRate)} previous={fmtPct(prev.onTimeRate)}
            d={delta(cur.onTimeRate, prev.onTimeRate, { kind: 'rate', better: 'up' })}
            hint="Tickets clôturés avant la fin de la date prévue" />
          <Kpi label="Sous garantie" value={fmtPct(cur.warrantyRate)} previous={fmtPct(prev.warrantyRate)}
            d={delta(cur.warrantyRate, prev.warrantyRate, { kind: 'rate' })} />
          <Kpi label="Urgents" value={fmtPct(cur.urgentRate)} previous={fmtPct(prev.urgentRate)}
            d={delta(cur.urgentRate, prev.urgentRate, { kind: 'rate' })} />
        </div>
      </Section>

      <MonthlyChart title="Tickets créés par mois" current={monthsN} previous={monthsN1} year={now.getFullYear()} />

      <Section title="Où passe le temps" subtitle="Durée moyenne dans chaque statut, tickets clôturés sur la période" action={<Legend />}>
        <PairedBars
          rows={OPEN_STATUSES.map(s => [STATUS_LABELS[s], cur.avgDaysByStatus[s], prev.avgDaysByStatus[s]])}
          empty="Aucun ticket clôturé sur la période."
        />
      </Section>

      <Section title="Répartition" subtitle="Tickets créés sur la période">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Ranking title="Types de vélo" rows={cur.byBikeType} previousRows={prev.byBikeType} />
          <Ranking title="Marques" rows={cur.topBrands} previousRows={prev.topBrands} />
          <Ranking title="Tickets ouverts par vendeur" rows={cur.byCreator} previousRows={prev.byCreator} />
        </div>
      </Section>
    </StatsModalShell>
  )
}
