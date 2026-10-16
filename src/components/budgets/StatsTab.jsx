// Onglet « Statistiques » des budgets : un budget, filtré par acheteur, par fournisseur (ou les deux) et
// par magasin. Chiffres clés, comparatif N-1 / base / groupe / adapté / saisi, avancement de la saisie,
// répartitions (camemberts), comparatif par magasin et tableaux par univers, fournisseur et acheteur.
import { useMemo, useState } from 'react'
import { EmptyState } from '../admin/ui'
import { acheteurCouvre, buyerFilterTest, defaultBuyerFilter, formatBudget, formatPct, formatQte, normLabel } from '../../lib/budgets'
import { byMagasin, envelopes, evol, groupRows, part, statsRows, sumRows, topWithOthers } from '../../lib/budgetStats'
import { useAcheteurs, useBudgetUser, useBudgets } from '../../lib/budgetsStore'
import { useBudgetModel } from '../../lib/useBudgetModel'
import BuyerFilter from './BuyerFilter'
import { ChartCard, Donut, GroupedBars, HBars } from './Charts'
import { formatNote } from './NotationPanel'
import { TONE } from './tones'

const SELECT = 'h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const TH = 'py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 text-right whitespace-nowrap'
const TD = 'py-1.5 px-2 text-right text-sm tabular-nums whitespace-nowrap border-t border-gray-100 dark:border-neutral-800'

function Kpi({ label, value, tone, sub, subTone = '' }) {
  return (
    <div className={`rounded-2xl border border-t-4 ${TONE[tone].bar} px-4 py-3 bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800`}>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${TONE[tone].text}`}>{value}</p>
      {sub && <p className={`text-[11px] tabular-nums ${subTone || 'text-gray-500 dark:text-neutral-400'}`}>{sub}</p>}
    </div>
  )
}

// Évolution colorée : vert en hausse, rouge en baisse (rien de saisi : —)
function Evol({ value, base }) {
  const e = evol(value, base)
  if (e == null || !value) return <span className="text-gray-400">—</span>
  return <span className={e >= 0 ? TONE.engage.text : TONE.depassement.text}>{formatPct(e)}</span>
}

const pctText = p => (p == null ? '—' : `${Math.round(p)} %`)

export default function StatsTab() {
  const user = useBudgetUser()
  const { list: budgets, loading } = useBudgets()
  const [budgetId, setBudgetId] = useState('')
  const id = budgetId || budgets[0]?.id
  if (loading) return <p className="text-xs text-gray-500 dark:text-neutral-400">Chargement…</p>
  if (!id) return <EmptyState title="Aucun budget" text="Crée un budget pour voir ses statistiques." />
  return <Stats key={id} id={id} budgets={budgets} onBudget={setBudgetId} user={user} />
}

function Stats({ id, budgets, onBudget, user }) {
  const model = useBudgetModel(id)
  const { budget, magasins, segments, brandsBySeg, adapte, fournisseur, totals, hasGroupe } = model
  const acheteurs = useAcheteurs()
  const [filtre, setFiltre] = useState(() => defaultBuyerFilter(user))
  const [fourn, setFourn] = useState('')
  const [magId, setMagId] = useState('')
  const [sortF, setSortF] = useState('saisie')
  const [allF, setAllF] = useState(false)

  const keep = useMemo(() => buyerFilterTest(filtre, acheteurs), [filtre, acheteurs])
  const segs = useMemo(() => segments.filter(s => keep(s.univers, s.nom)), [segments, keep])
  const allRows = useMemo(() => statsRows({ segments: segs, brandsBySeg, adapte, fournisseur, magId: magId || null }),
    [segs, brandsBySeg, adapte, fournisseur, magId])
  const fournisseurs = useMemo(() => groupRows(allRows, r => r.fKey, r => r.fournisseur)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr')), [allRows])
  const fKey = fournisseurs.find(f => normLabel(f.label) === normLabel(fourn))?.key || null
  const rows = fKey ? allRows.filter(r => r.fKey === fKey) : allRows
  const t = sumRows(rows)
  const magIds = magId ? [magId] : magasins.map(m => m.id)
  const env = envelopes({ segments: segs, totals, magIds, hasGroupe, keepUnivers: u => !fKey || rows.some(r => r.univers === u) })
  const info = fKey ? adapte.marques.get(fKey) : null
  // Objectif de la saisie : budget groupe (ou base) des univers ; pour un fournisseur, son budget adapté
  const cible = fKey ? t.adapte : env.objectif
  const cibleLabel = fKey ? 'budget adapté' : hasGroupe ? 'budget groupe' : 'budget de base'

  const parUnivers = groupRows(rows, r => r.univers)
  const parSegment = parUnivers.length === 1 ? groupRows(rows, r => r.segId, r => r.segment || 'Sans segment') : null
  const repartition = parSegment || parUnivers
  const parMag = byMagasin(rows)
  const fRows = fKey ? [] : groupRows(rows, r => r.fKey, r => r.fournisseur)
    .sort((a, b) => (sortF === 'ecart' ? (b.saisie - b.adapte) - (a.saisie - a.adapte) : b[sortF] - a[sortF]) || b.n1 - a.n1)
  const prixMoyen = t.qte > 0 ? t.saisie / t.qte : null
  const prixMoyenN1 = t.qteN1 > 0 ? t.n1 / t.qteN1 : null

  const parAcheteur = !filtre && !fKey ? acheteurs.map(a => {
    const r = sumRows(rows.filter(x => acheteurCouvre(a, x.univers, x.segment)))
    const e = envelopes({ segments, totals, magIds, hasGroupe, keepUnivers: (u, segment) => acheteurCouvre(a, u, segment) })
    return { a, ...r, objectif: e.objectif, nbUnivers: (a.univers || []).length }
  }).filter(x => x.nbUnivers > 0) : []

  if (model.loading) return <p className="text-xs text-gray-500 dark:text-neutral-400">Chargement…</p>
  if (!budget) return <EmptyState title="Budget introuvable" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={id} onChange={e => onBudget(e.target.value)} aria-label="Budget" className={SELECT}>
          {budgets.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <BuyerFilter value={filtre} onChange={setFiltre} acheteurs={acheteurs} me={user.uid} />
        <input list="stats-fournisseurs" value={fourn} onChange={e => setFourn(e.target.value)} placeholder="Tous les fournisseurs"
          aria-label="Fournisseur" className={`${SELECT} w-56 uppercase placeholder:normal-case`} />
        <datalist id="stats-fournisseurs">{fournisseurs.map(f => <option key={f.key} value={f.label} />)}</datalist>
        {fourn && <button type="button" onClick={() => setFourn('')} className="text-xs text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white underline">Effacer</button>}
        <select value={magId} onChange={e => setMagId(e.target.value)} aria-label="Magasin" className={SELECT}>
          <option value="">Tous les magasins</option>
          {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      </div>
      {fourn && !fKey && <p className="text-xs text-gray-500 dark:text-neutral-400">Aucun fournisseur « {fourn} » pour ce filtre.</p>}

      {rows.length === 0 ? (
        <EmptyState title="Aucune donnée" text="Aucune marque pour ces filtres." />
      ) : <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="N-1" value={formatBudget(t.n1)} tone="n1" sub={t.qteN1 > 0 ? formatQte(t.qteN1) : ''} />
          {fKey ? (
            <Kpi label="Note / demande" value={info?.note == null ? 'Non noté' : `${formatNote(info.note)}/10`} tone="adapte"
              sub={info?.demande ? `Demande ${formatBudget(info.demande)}` : 'Pas de budget demandé'} />
          ) : <>
            <Kpi label="Budget de base" value={formatBudget(env.base)} tone="base" sub={<>vs N-1 <Evol value={env.base} base={t.n1} /></>} />
            <Kpi label="Budget groupe" value={hasGroupe ? formatBudget(env.groupe) : '—'} tone="groupe"
              sub={hasGroupe ? <>vs N-1 <Evol value={env.groupe} base={t.n1} /></> : 'Pas encore fixé'} />
          </>}
          <Kpi label="Budget adapté" value={formatBudget(t.adapte)} tone="adapte" sub={<>vs N-1 <Evol value={t.adapte} base={t.n1} /></>} />
          <Kpi label="Saisi" value={formatBudget(t.saisie)} tone="saisie" sub={<>vs N-1 <Evol value={t.saisie} base={t.n1} /> · {pctText(part(t.saisie, cible))} du {cibleLabel}</>} />
          <Kpi label="Engagé" value={formatBudget(t.engage)} tone="engage" sub={`${pctText(part(t.engage, t.saisie))} du saisi`} />
          <Kpi label="Quantités" value={t.qte > 0 ? formatQte(t.qte) : '—'} tone="saisie" sub={t.qteN1 > 0 ? <>vs N-1 <Evol value={t.qte} base={t.qteN1} /></> : 'Pas de N-1'} />
          <Kpi label="Prix moyen" value={prixMoyen == null ? '—' : formatBudget(prixMoyen)} tone="saisie"
            sub={prixMoyenN1 == null ? 'Saisi ÷ quantités' : <>N-1 {formatBudget(prixMoyenN1)} · <Evol value={prixMoyen} base={prixMoyenN1} /></>} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Comparatif des budgets" hint={fKey ? `Fournisseur ${info?.nom || fourn}` : 'Univers du filtre'}>
            <HBars items={[
              { label: 'N-1', value: t.n1, bar: TONE.n1.dot },
              ...(fKey ? [] : [{ label: 'Budget de base', value: env.base, bar: TONE.base.dot }]),
              ...(fKey || !hasGroupe ? [] : [{ label: 'Budget groupe', value: env.groupe, bar: TONE.groupe.dot }]),
              { label: 'Budget adapté', value: t.adapte, bar: TONE.adapte.dot },
              ...(fKey && info?.demande ? [{ label: 'Demandé', value: info.demande, bar: 'bg-violet-300' }] : []),
              { label: 'Saisi', value: t.saisie, bar: TONE.saisie.dot, sub: formatPct(evol(t.saisie, t.n1)) },
              { label: 'dont engagé', value: t.engage, bar: TONE.engage.dot },
            ]} />
          </ChartCard>
          <ChartCard title="Avancement de la saisie" hint={`Par rapport au ${cibleLabel}`}>
            <Donut center={pctText(part(t.saisie, cible))} sub="saisi" data={[
              { label: 'Engagé', value: t.engage, color: '#10b981' },
              { label: 'Prévisionnel', value: t.saisie - t.engage, color: '#f59e0b' },
              ...(cible > t.saisie ? [{ label: 'Reste à saisir', value: cible - t.saisie, color: '#e5e5e5' }] : []),
            ]} />
            {cible > 0 && t.saisie > cible && <p className={`text-xs ${TONE.depassement.text}`}>Dépassement de {formatBudget(t.saisie - cible)}.</p>}
          </ChartCard>
          <ChartCard title={`Répartition du saisi par ${parSegment ? 'segment' : 'univers'}`}>
            {t.saisie > 0 ? <Donut center={formatBudget(t.saisie)} data={topWithOthers(repartition, g => g.saisie)} />
              : <p className="text-xs text-gray-500 dark:text-neutral-400">Rien n’est encore saisi.</p>}
          </ChartCard>
          <ChartCard title={`Répartition du N-1 par ${parSegment ? 'segment' : 'univers'}`}>
            {t.n1 > 0 ? <Donut center={formatBudget(t.n1)} data={topWithOthers(repartition, g => g.n1)} />
              : <p className="text-xs text-gray-500 dark:text-neutral-400">Pas de N-1.</p>}
          </ChartCard>
          {!fKey && (
            <ChartCard title="Saisi par fournisseur" hint="Les plus gros fournisseurs du filtre">
              {t.saisie > 0 ? <Donut center={`${fRows.filter(f => f.saisie > 0).length}`} sub="fournisseurs" data={topWithOthers(fRows, g => g.saisie)} />
                : <p className="text-xs text-gray-500 dark:text-neutral-400">Rien n’est encore saisi.</p>}
            </ChartCard>
          )}
          {!magId && (
            <ChartCard title="Par magasin" hint={`N-1, ${fKey ? 'budget adapté' : cibleLabel} et saisi`}>
              <GroupedBars series={[
                { key: 'n1', label: 'N-1', bar: TONE.n1.dot },
                { key: 'cible', label: fKey ? 'Budget adapté' : hasGroupe ? 'Budget groupe' : 'Budget de base', bar: fKey ? TONE.adapte.dot : hasGroupe ? TONE.groupe.dot : TONE.base.dot },
                { key: 'saisie', label: 'Saisi', bar: TONE.saisie.dot },
              ]} groups={magasins.map(m => ({
                label: m.nom,
                values: { n1: parMag[m.id]?.n1 || 0, saisie: parMag[m.id]?.saisie || 0, cible: fKey ? parMag[m.id]?.adapte || 0 : env.parMag[m.id]?.objectif || 0 },
              }))} />
            </ChartCard>
          )}
        </div>

        <ChartCard title={`Par ${parSegment ? 'segment' : 'univers'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className={`${TH} !text-left`}>{parSegment ? 'Segment' : 'Univers'}</th>
                <th className={`${TH} ${TONE.n1.head}`}>N-1</th>
                {!fKey && !parSegment && <th className={`${TH} ${TONE.base.head}`}>Base</th>}
                {!fKey && !parSegment && hasGroupe && <th className={`${TH} ${TONE.groupe.head}`}>Groupe</th>}
                <th className={`${TH} ${TONE.adapte.head}`}>Adapté</th>
                <th className={TH}>Saisi</th>
                <th className={TH}>vs N-1</th>
                <th className={`${TH} ${TONE.engage.text}`}>Engagé</th>
                {!fKey && !parSegment && <th className={TH}>Avancement</th>}
              </tr></thead>
              <tbody>
                {repartition.map(g => {
                  const e = parSegment ? null : env.parUnivers.get(g.key)
                  return (
                    <tr key={g.key}>
                      <th scope="row" className={`${TD} !text-left font-medium text-gray-900 dark:text-white`}>{g.label}</th>
                      <td className={`${TD} ${TONE.n1.text}`}>{formatBudget(g.n1)}</td>
                      {!fKey && !parSegment && <td className={`${TD} ${TONE.base.text}`}>{formatBudget(e?.base)}</td>}
                      {!fKey && !parSegment && hasGroupe && <td className={`${TD} ${TONE.groupe.text}`}>{formatBudget(e?.groupe)}</td>}
                      <td className={`${TD} ${TONE.adapte.text}`}>{formatBudget(g.adapte)}</td>
                      <td className={`${TD} text-gray-900 dark:text-white`}>{formatBudget(g.saisie)}</td>
                      <td className={TD}><Evol value={g.saisie} base={g.n1} /></td>
                      <td className={`${TD} ${TONE.engage.text}`}>{g.engage ? formatBudget(g.engage) : '—'}</td>
                      {!fKey && !parSegment && <td className={TD}><Progress value={g.saisie} total={e?.objectif} /></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {!fKey && (
          <ChartCard title="Par fournisseur" hint="Clique sur un fournisseur pour filtrer les statistiques sur lui.">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500 dark:text-neutral-400">Trier par</span>
              {[['saisie', 'Saisi'], ['n1', 'N-1'], ['adapte', 'Adapté'], ['ecart', 'Écart saisi / adapté']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSortF(k)} aria-pressed={sortF === k}
                  className={`h-7 px-2 rounded-lg border ${sortF === k ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white font-semibold' : 'border-gray-200 text-gray-600 dark:border-neutral-700 dark:text-neutral-300'}`}>{l}</button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className={`${TH} !text-left`}>Fournisseur</th>
                  <th className={TH}>Note</th>
                  <th className={`${TH} ${TONE.n1.head}`}>N-1</th>
                  <th className={`${TH} ${TONE.adapte.head}`}>Adapté</th>
                  <th className={TH}>Saisi</th>
                  <th className={TH}>vs N-1</th>
                  <th className={TH}>Écart / adapté</th>
                  <th className={`${TH} ${TONE.engage.text}`}>Engagé</th>
                </tr></thead>
                <tbody>
                  {(allF ? fRows : fRows.slice(0, 15)).map(g => {
                    const m = adapte.marques.get(g.key)
                    const ecart = g.saisie - g.adapte
                    return (
                      <tr key={g.key}>
                        <th scope="row" className={`${TD} !text-left`}>
                          <button type="button" onClick={() => setFourn(g.label)} className="font-medium text-gray-900 dark:text-white hover:underline">{g.label}</button>
                        </th>
                        <td className={TD}>{m?.note == null ? '—' : `${formatNote(m.note)}/10`}</td>
                        <td className={`${TD} ${TONE.n1.text}`}>{formatBudget(g.n1)}</td>
                        <td className={`${TD} ${TONE.adapte.text}`}>{formatBudget(g.adapte)}</td>
                        <td className={`${TD} text-gray-900 dark:text-white`}>{formatBudget(g.saisie)}</td>
                        <td className={TD}><Evol value={g.saisie} base={g.n1} /></td>
                        <td className={`${TD} ${!g.saisie ? 'text-gray-400' : ecart > 0 ? TONE.depassement.text : 'text-gray-600 dark:text-neutral-300'}`}>
                          {!g.saisie ? '—' : `${ecart > 0 ? '+' : '−'}${formatBudget(Math.abs(ecart))}`}
                        </td>
                        <td className={`${TD} ${TONE.engage.text}`}>{g.engage ? formatBudget(g.engage) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {fRows.length > 15 && (
              <button type="button" onClick={() => setAllF(v => !v)} className="text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-white">
                {allF ? 'Voir les 15 premiers' : `Voir les ${fRows.length} fournisseurs`}
              </button>
            )}
          </ChartCard>
        )}

        {parAcheteur.length > 0 && (
          <ChartCard title="Par acheteur" hint={`Univers attribués à chaque acheteur ; avancement par rapport au ${cibleLabel}.`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className={`${TH} !text-left`}>Acheteur</th>
                  <th className={TH}>Univers</th>
                  <th className={`${TH} ${TONE.n1.head}`}>N-1</th>
                  <th className={`${TH} ${hasGroupe ? TONE.groupe.head : TONE.base.head}`}>{hasGroupe ? 'Groupe' : 'Base'}</th>
                  <th className={TH}>Saisi</th>
                  <th className={TH}>vs N-1</th>
                  <th className={`${TH} ${TONE.engage.text}`}>Engagé</th>
                  <th className={TH}>Avancement</th>
                </tr></thead>
                <tbody>
                  {parAcheteur.map(x => (
                    <tr key={x.a.id}>
                      <th scope="row" className={`${TD} !text-left`}>
                        <button type="button" onClick={() => setFiltre(`a:${x.a.id}`)} className="font-medium text-gray-900 dark:text-white hover:underline">{x.a.displayName || x.a.email}</button>
                      </th>
                      <td className={TD}>{x.nbUnivers}</td>
                      <td className={`${TD} ${TONE.n1.text}`}>{formatBudget(x.n1)}</td>
                      <td className={`${TD} ${hasGroupe ? TONE.groupe.text : TONE.base.text}`}>{formatBudget(x.objectif)}</td>
                      <td className={`${TD} text-gray-900 dark:text-white`}>{formatBudget(x.saisie)}</td>
                      <td className={TD}><Evol value={x.saisie} base={x.n1} /></td>
                      <td className={`${TD} ${TONE.engage.text}`}>{x.engage ? formatBudget(x.engage) : '—'}</td>
                      <td className={TD}><Progress value={x.saisie} total={x.objectif} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </>}
    </div>
  )
}

// Barre d'avancement saisi / objectif (rouge au-delà de 100 %)
function Progress({ value, total }) {
  const p = part(value, total)
  if (p == null) return <span className="text-gray-400">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
        <span className={`block h-full ${p > 100.5 ? 'bg-red-500' : p >= 99.5 ? 'bg-emerald-500' : 'bg-gray-900 dark:bg-white'}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </span>
      <span className={`w-10 text-right ${p > 100.5 ? TONE.depassement.text : ''}`}>{Math.round(p)} %</span>
    </span>
  )
}
