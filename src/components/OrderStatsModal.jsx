import { useMemo, useState } from 'react'
import { ORDER_STATUS_META, formatEuro } from '../lib/orders'
import { computeOrderPeriodStats, computeOrderSnapshot } from '../lib/orderStats'
import { PERIODS, monthlyCreated, periodRange, previousYear } from '../lib/ticketStats'
import {
  BarList, Kpi, Legend, MonthlyChart, PairedBars, Ranking, Section, StatsModalShell, Tile,
  delta, fmtDays, fmtNum, fmtPct,
} from './StatsPanel'

/** Panneau de statistiques des commandes clients, comparées à la même période de l'année précédente. */
export default function OrderStatsModal({ orders, magasinNom, onClose }) {
  const [period, setPeriod] = useState('month')
  const now = useMemo(() => new Date(), [])

  const { cur, prev, snap, monthsN, monthsN1 } = useMemo(() => {
    const range = periodRange(period, now)
    return {
      cur: computeOrderPeriodStats(orders, range),
      prev: computeOrderPeriodStats(orders, previousYear(range)),
      snap: computeOrderSnapshot(orders, now),
      monthsN: monthlyCreated(orders, now.getFullYear()),
      monthsN1: monthlyCreated(orders, now.getFullYear() - 1),
    }
  }, [orders, period, now])

  return (
    <StatsModalShell
      title="Statistiques des commandes clients"
      subtitle={magasinNom || 'Tous les magasins'}
      period={period} setPeriod={setPeriod}
      hasHistory={monthsN1.some(Boolean)}
      onClose={onClose}
    >
      <Section title="En ce moment" subtitle="Commandes en cours">
        <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,10rem))_1fr] gap-3">
          <Tile label="Commandes en cours" value={snap.open} />
          <Tile label="Réceptions en retard" value={snap.late} alert={snap.late > 0} />
          <Tile label="Reste à encaisser" value={formatEuro(snap.outstanding)} />
          <BarList rows={snap.byStatus.map(([s, n]) => [ORDER_STATUS_META[s].label, n])} />
        </div>
      </Section>

      <Section title={PERIODS[period]} subtitle="Évolution par rapport à la même période N-1">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Commandes créées" value={fmtNum(cur.created)} previous={fmtNum(prev.created)}
            d={delta(cur.created, prev.created)} />
          <Kpi label="Commandes retirées" value={fmtNum(cur.retirees)} previous={fmtNum(prev.retirees)}
            d={delta(cur.retirees, prev.retirees)} />
          <Kpi label="Chiffre d'affaires" value={formatEuro(cur.revenue)} previous={formatEuro(prev.revenue)}
            d={delta(cur.revenue, prev.revenue, { better: 'up' })}
            hint="Prix TTC des commandes retirées" />
          <Kpi label="Panier moyen" value={formatEuro(cur.avgBasket)} previous={formatEuro(prev.avgBasket)}
            d={delta(cur.avgBasket, prev.avgBasket, { better: 'up' })} />
          <Kpi label="Taux d'annulation" value={fmtPct(cur.cancelRate)} previous={fmtPct(prev.cancelRate)}
            d={delta(cur.cancelRate, prev.cancelRate, { kind: 'rate', better: 'down' })}
            hint="Parmi les commandes terminées" />
          <Kpi label="Avec acompte" value={fmtPct(cur.depositRate)} previous={fmtPct(prev.depositRate)}
            d={delta(cur.depositRate, prev.depositRate, { kind: 'rate' })} />
        </div>
      </Section>

      <MonthlyChart title="Commandes créées par mois" current={monthsN} previous={monthsN1} year={now.getFullYear()} />

      <Section title="Délais" subtitle="Moyennes sur la période" action={<Legend />}>
        <PairedBars rows={[
          ['Chez le fournisseur', cur.supplierDays, prev.supplierDays],
          ['Avant retrait', cur.pickupDays, prev.pickupDays],
        ]} format={fmtDays} empty="Aucune commande reçue ou retirée sur la période." />
        <p className="text-[11px] text-gray-400 dark:text-neutral-500">
          Fournisseur : de la commande passée à la réception en magasin. Retrait : du client prévenu au retrait.
        </p>
      </Section>

      <Section title="Répartition" subtitle="Commandes créées sur la période">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Ranking title="Types de produit" rows={cur.byType} previousRows={prev.byType} />
          <Ranking title="Fournisseurs" rows={cur.topSuppliers} previousRows={prev.topSuppliers} />
          <Ranking title="Commandes par vendeur" rows={cur.byCreator} previousRows={prev.byCreator} />
        </div>
      </Section>
    </StatsModalShell>
  )
}
