// Un budget (ex. BUDGET AH27) : imports de la base et du N-1, puis deux lectures
// Univers › Segment › Marques (tableau marques × magasins) ou Magasin › Univers › Segment (saisie d'un magasin),
// et la notation des marques qui donne le budget adapté.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import BrandGrid from '../components/budgets/BrandGrid'
import BuyerFilter from '../components/budgets/BuyerFilter'
import GroupeCards from '../components/budgets/GroupeCards'
import NotationPanel, { AdapteInfo } from '../components/budgets/NotationPanel'
import SegmentSaisie from '../components/budgets/SegmentSaisie'
import { Legend, SplitBar, TONE } from '../components/budgets/tones'
import { ImportBaseDialog, ImportN1Dialog } from '../components/budgets/ImportDialogs'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Notice } from '../components/admin/ui'
import {
  FILTRE_SANS_ACHETEUR, SAISONS, addTotals, buyerFilterTest, canEditUnivers, defaultBuyerFilter, formatBudget, formatQte, objectif,
} from '../lib/budgets'
import { carryOverN1, deleteBudget, useAcheteurs, useBudgetUser } from '../lib/budgetsStore'
import { useBudgetModel } from '../lib/useBudgetModel'
import { budgetWorkbook, exportFileName, reimportColumn } from '../lib/budgetExport'
import { downloadWorkbook } from '../lib/excel'

const VIEWS = [['univers', 'Univers › Segment › Marques'], ['magasin', 'Magasin › Univers › Segment'], ['notation', 'Notation des marques']]
const GRID = 'grid grid-cols-[minmax(12rem,1fr)_repeat(4,6.5rem)_8.5rem] items-center gap-2'
const LEVEL_PAD = ['pl-2', 'pl-7', 'pl-12']

function dateLabel(ts) {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('fr-FR') : ''
}

function Reste({ cell, hasGroupe }) {
  const reste = Math.max(objectif(cell, hasGroupe), 0) - cell.saisie
  if (objectif(cell, hasGroupe) <= 0 && !cell.saisie) return <span className="text-gray-400 dark:text-neutral-500">—</span>
  const cls = Math.round(reste) === 0 ? TONE.ok.text : reste < 0 ? TONE.depassement.text : 'text-gray-700 dark:text-neutral-300'
  return <span className={`tabular-nums ${cls}`}>{reste < 0 ? `+${formatBudget(-reste)}` : formatBudget(reste)}</span>
}

function HeaderRow({ hasGroupe }) {
  return (
    <div className={`${GRID} px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 border-b border-gray-200 dark:border-neutral-800`}>
      <span>Libellé</span>
      <span className={`text-right ${TONE.base.head}`}>Base</span>
      <span className={`text-right ${TONE.groupe.head}`} title="Budget groupe réparti au prorata de la base">Groupe</span>
      <span className={`text-right ${TONE.n1.head}`}>N-1</span>
      <span className="text-right">Saisi</span>
      <span className="text-right" title={`${hasGroupe ? 'Budget groupe' : 'Base'} moins saisi ; + = dépassement`}>Reste</span>
    </div>
  )
}

function TreeRow({ level, label, hint, cell, hasGroupe, open, onToggle }) {
  const strong = level === 0
  return (
    <div className={`${GRID} py-1.5 pr-2 border-b border-gray-100 dark:border-neutral-800 ${strong ? 'bg-gray-50/60 dark:bg-neutral-800/30' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className={`${LEVEL_PAD[level]} flex items-center gap-2 min-w-0 text-left text-sm ${strong ? 'font-semibold' : ''} text-gray-900 dark:text-white hover:underline`}>
        <svg aria-hidden="true" className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="truncate">{label}</span>
        {hint && <span className="shrink-0 text-[11px] font-normal text-gray-500 dark:text-neutral-400">{hint}</span>}
      </button>
      <span className={`text-right text-sm tabular-nums ${TONE.base.text}`}>{formatBudget(cell.base)}</span>
      <span className={`text-right text-sm tabular-nums ${TONE.groupe.text}`}>{hasGroupe ? formatBudget(cell.groupe) : '—'}</span>
      <span className={`text-right text-sm tabular-nums ${TONE.n1.text}`}>{formatBudget(cell.n1)}</span>
      <span className={`text-right text-sm tabular-nums ${TONE.saisie.text}`}>
        {formatBudget(cell.saisie)}<SplitBar saisie={cell.saisie} engage={cell.engage} className="ml-auto mt-0.5 w-16" />
      </span>
      <span className="text-right text-sm"><Reste cell={cell} hasGroupe={hasGroupe} /></span>
    </div>
  )
}

function Kpi({ label, value, tone, hint, children }) {
  return (
    <div className={`rounded-2xl border border-t-4 ${TONE[tone].bar} px-4 py-3 bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800`}>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${TONE[tone].text}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 dark:text-neutral-400">{hint}</p>}
      {children}
    </div>
  )
}

export default function BudgetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useBudgetUser()
  const {
    budget, loading, brands, universList, magasins, segments, sums, hasGroupe, brandsBySeg, prev, fiche, reglages, liens,
    fournisseur, adapte, totals, groupeMontant,
  } = useBudgetModel(id)
  // Budget entier (sans filtre) pour l'explication du budget adapté
  const enveloppe = { n1: sums.n1, base: sums.base, groupe: groupeMontant }
  const [view, setView] = useState('univers')
  const isAcheteur = user.role === 'acheteur'
  const isDirection = user.role === 'directeurgen'
  const acheteurs = useAcheteurs()
  // Filtre par acheteur : ses univers attribués (par défaut, les miens pour un acheteur)
  const [filtre, setFiltre] = useState(() => defaultBuyerFilter(user))
  const [open, setOpen] = useState(() => new Set())
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const isOpen = key => open.has(key)
  const toggle = key => setOpen(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const groups = useMemo(() => {
    const g = []
    for (const s of segments) {
      if (g.at(-1)?.univers !== s.univers) g.push({ univers: s.univers, segments: [] })
      g.at(-1).segments.push(s)
    }
    return g
  }, [segments])
  const keep = buyerFilterTest(filtre, acheteurs)
  const shown = groups.filter(g => keep(g.univers))
  const filtreLabel = filtre === FILTRE_SANS_ACHETEUR ? ' des univers sans acheteur'
    : filtre ? ` · ${acheteurs.find(a => `a:${a.id}` === filtre)?.displayName || ''}` : ''

  if (loading) return <Page><p className="text-sm text-gray-500 dark:text-neutral-400">Chargement…</p></Page>
  if (!budget) return <Page><EmptyState title="Budget introuvable" action={<Link to="/budgets" className={BTN_SECONDARY + ' inline-flex items-center'}>Retour aux budgets</Link>} /></Page>

  const cellOf = (segs, mags) => addTotals(segs.flatMap(s => mags.map(m => totals[s.id]?.[m.id])))
  const total = cellOf(shown.flatMap(g => g.segments), magasins)
  const reste = objectif(total, hasGroupe) - total.saisie
  const onlyUnivers = g => g.segments.length === 1 && !g.segments[0].nom
  const segLabel = s => s.nom || 'Sans segment'
  const nbMarques = s => brandsBySeg.get(s.id)?.length || 0

  const saisie = (seg, mag) => (
    <div className="px-2 py-2 bg-gray-50 dark:bg-neutral-950/50 border-b border-gray-100 dark:border-neutral-800">
      <SegmentSaisie budgetId={budget.id} seg={seg} magasin={mag} cell={cellOf([seg], [mag])} hasGroupe={hasGroupe} adapte={adapte}
        brands={brandsBySeg.get(seg.id) || []} user={user} readOnly={!canEditUnivers(user, seg.univers)} />
    </div>
  )
  const grid = seg => (
    <div className="px-2 py-2 bg-gray-50 dark:bg-neutral-950/50 border-b border-gray-100 dark:border-neutral-800">
      <BrandGrid budgetId={budget.id} seg={seg} magasins={magasins} totals={totals[seg.id]} hasGroupe={hasGroupe} adapte={adapte}
        brands={brandsBySeg.get(seg.id) || []} user={user} readOnly={!canEditUnivers(user, seg.univers)} />
    </div>
  )

  async function carryOver() {
    if (!confirm(`Reprendre la saisie de ${prev.nom} comme N-1 (tous les univers) ?\nLe N-1 actuel est remplacé ; la saisie de ${budget.nom} n’est pas touchée.`)) return
    setBusy(true)
    try {
      const { count } = await carryOverN1(budget, prev, user)
      setNotice({ tone: 'ok', text: `N-1 repris de ${prev.nom} : ${count} marque(s).` })
    } catch (err) { setNotice({ text: err.message }) }
    setBusy(false)
  }

  // Export Excel du budget entier (tous univers, quel que soit le filtre)
  async function exportExcel() {
    setBusy(true)
    try {
      const sheets = budgetWorkbook({ budget, segments, magasins, totals, brandsBySeg, adapte, fournisseur, fiche, hasGroupe, groupeMontant, reglages })
      await downloadWorkbook(sheets, exportFileName(budget))
      setNotice({ tone: 'ok', text: `Export téléchargé. L’an prochain, il se réimporte comme N-1 : onglet « BUDGET PAR MARQUES », colonne « ${reimportColumn(budget)} ».` })
    } catch (err) { setNotice({ text: `Export impossible : ${err.message}` }) }
    setBusy(false)
  }

  async function remove() {
    if (!confirm(`Supprimer ${budget.nom} ? Toutes les marques et la saisie seront perdues.`)) return
    if (prompt(`Pour confirmer, tape le nom du budget : ${budget.nom}`)?.trim().toUpperCase() !== budget.nom) return
    setBusy(true)
    try { await deleteBudget(budget.id); navigate('/budgets') } catch (err) { setNotice({ text: err.message }); setBusy(false) }
  }

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/budgets" className="text-xs text-gray-500 dark:text-neutral-400 hover:underline">← Budgets</Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{budget.nom}</h1>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            {SAISONS[budget.saison]} {budget.annee}
            {budget.baseImport && ` · Base importée le ${dateLabel(budget.baseImport.at)}${budget.baseImport.fileName ? ` (${budget.baseImport.fileName})` : ''}`}
            {budget.n1Import && ` · N-1 : ${budget.n1Import.source}${dateLabel(budget.n1Import.at) ? ` le ${dateLabel(budget.n1Import.at)}` : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDialog('base')} className={budget.baseImport ? BTN_SECONDARY : BTN_PRIMARY}>
            {budget.baseImport ? 'Réimporter la base' : 'Importer la base'}
          </button>
          <button type="button" onClick={() => setDialog('n1')} className={BTN_SECONDARY}>Importer le N-1 (Excel)</button>
          {segments.length > 0 && <button type="button" onClick={exportExcel} disabled={busy} className={BTN_SECONDARY}>Exporter (Excel)</button>}
          {prev && <button type="button" onClick={carryOver} disabled={busy} className={BTN_SECONDARY}>Reprendre le N-1 de {prev.nom}</button>}
          {isDirection && (
            <button type="button" onClick={remove} disabled={busy}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 disabled:opacity-50">
              Supprimer
            </button>
          )}
        </div>
      </div>

      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
      {isAcheteur && !user.univers.length && (
        <Notice notice={{ text: 'Aucun univers ne t’est attribué : le budget est en lecture seule. La direction attribue les univers dans Admin › Comptes.' }} />
      )}

      {segments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <EmptyState title="Budget vide" text="Commence par importer la base (univers, magasins et budget de base)."
            action={<button type="button" onClick={() => setDialog('base')} className={BTN_PRIMARY}>Importer la base</button>} />
        </div>
      ) : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Budget de base" value={formatBudget(total.base)} tone="base" />
          <Kpi label="N-1" value={formatBudget(total.n1)} tone="n1" hint={total.qteN1 > 0 ? formatQte(total.qteN1) : ''} />
          <Kpi label="Saisi" value={formatBudget(total.saisie)} tone="saisie" hint={total.qte > 0 ? formatQte(total.qte) : ''}>
            {total.saisie > 0 && <>
              <SplitBar saisie={total.saisie} engage={total.engage} className="mt-1.5" />
              <p className="mt-1 text-[11px] tabular-nums">
                <span className={TONE.engage.text}>Engagé {formatBudget(total.engage)}</span>
                <span className="text-gray-400"> · </span>
                <span className={TONE.previsionnel.text}>Prév. {formatBudget(total.saisie - total.engage)}</span>
              </p>
            </>}
          </Kpi>
          <Kpi label={reste < 0 ? 'Dépassement' : 'Reste à répartir'} value={formatBudget(Math.abs(reste))}
            tone={reste < 0 ? 'depassement' : Math.round(reste) === 0 ? 'ok' : 'saisie'}
            hint={hasGroupe ? 'sur le budget groupe' : 'sur le budget de base'} />
        </div>
        <GroupeCards budget={budget} n1Total={sums.n1} baseTotal={sums.base} canEdit={isDirection} user={user} />
        <Legend keys={['n1', 'base', 'groupe', 'adapte', 'engage', 'previsionnel', 'ok', 'depassement']} />

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Affichage" className="inline-flex p-1 rounded-xl bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            {VIEWS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => { setView(k); setOpen(new Set()) }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${view === k
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <BuyerFilter value={filtre} onChange={setFiltre} acheteurs={acheteurs} me={user.uid} />
          {open.size > 0 && <button type="button" onClick={() => setOpen(new Set())} className={BTN_SECONDARY}>Tout replier</button>}
        </div>

        {view === 'notation' ? (
          <NotationPanel budget={budget} segments={segments} brandsBySeg={brandsBySeg} adapte={adapte.marques}
            fiche={fiche} fournisseur={fournisseur} liens={liens} reglages={reglages} keep={keep} user={user} enveloppe={enveloppe} />
        ) : <>
        <AdapteInfo reglages={reglages} enveloppe={enveloppe} />
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto">
          <div className="min-w-[51rem]">
            <HeaderRow hasGroupe={hasGroupe} />
            {view === 'univers' ? shown.map(g => {
              const uKey = `u:${g.univers}`
              return (
                <div key={uKey}>
                  <TreeRow level={0} label={g.univers} cell={cellOf(g.segments, magasins)} hasGroupe={hasGroupe} open={isOpen(uKey)} onToggle={() => toggle(uKey)}
                    hint={onlyUnivers(g) ? '' : `${g.segments.length} segment${g.segments.length > 1 ? 's' : ''}`} />
                  {isOpen(uKey) && (onlyUnivers(g)
                    ? grid(g.segments[0])
                    : g.segments.map(seg => {
                      const sKey = `s:${seg.id}`
                      return (
                        <div key={sKey}>
                          <TreeRow level={1} label={segLabel(seg)} hint={`${nbMarques(seg)} marque${nbMarques(seg) > 1 ? 's' : ''}`}
                            cell={cellOf([seg], magasins)} hasGroupe={hasGroupe} open={isOpen(sKey)} onToggle={() => toggle(sKey)} />
                          {isOpen(sKey) && grid(seg)}
                        </div>
                      )
                    }))}
                </div>
              )
            }) : magasins.map(mag => {
              const mKey = `m:${mag.id}`
              return (
                <div key={mKey}>
                  <TreeRow level={0} label={mag.nom} cell={cellOf(shown.flatMap(g => g.segments), [mag])} hasGroupe={hasGroupe} open={isOpen(mKey)} onToggle={() => toggle(mKey)} />
                  {isOpen(mKey) && shown.map(g => {
                    const uKey = `${mKey}|u:${g.univers}`
                    return (
                      <div key={uKey}>
                        <TreeRow level={1} label={g.univers} cell={cellOf(g.segments, [mag])} hasGroupe={hasGroupe} open={isOpen(uKey)} onToggle={() => toggle(uKey)} />
                        {isOpen(uKey) && (onlyUnivers(g) ? saisie(g.segments[0], mag) : g.segments.map(seg => {
                          const k = `${mKey}|s:${seg.id}`
                          return (
                            <div key={k}>
                              <TreeRow level={2} label={segLabel(seg)} hint={`${nbMarques(seg)} marque${nbMarques(seg) > 1 ? 's' : ''}`}
                                cell={cellOf([seg], [mag])} hasGroupe={hasGroupe} open={isOpen(k)} onToggle={() => toggle(k)} />
                              {isOpen(k) && saisie(seg, mag)}
                            </div>
                          )
                        }))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className={`${GRID} px-2 py-2 text-sm font-bold text-gray-900 dark:text-white`}>
              <span>Total{filtreLabel}</span>
              <span className={`text-right tabular-nums ${TONE.base.text}`}>{formatBudget(total.base)}</span>
              <span className={`text-right tabular-nums ${TONE.groupe.text}`}>{hasGroupe ? formatBudget(total.groupe) : '—'}</span>
              <span className={`text-right tabular-nums ${TONE.n1.text}`}>{formatBudget(total.n1)}</span>
              <span className="text-right tabular-nums">{formatBudget(total.saisie)}</span>
              <span className="text-right"><Reste cell={total} hasGroupe={hasGroupe} /></span>
            </div>
          </div>
        </div>
        </>}
        {magasins.length === 0 && <Notice notice={{ text: 'La liste des magasins est vide : remplis-la dans l’onglet Magasins des budgets.' }} />}
      </>}

      {dialog === 'base' && <ImportBaseDialog budget={budget} univers={universList} magasins={magasins} user={user} onClose={() => setDialog(null)} />}
      {dialog === 'n1' && <ImportN1Dialog budget={budget} brands={brands} univers={universList} magasins={magasins} user={user} onClose={() => setDialog(null)} />}
    </Page>
  )
}

function Page({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="w-full space-y-5">{children}</div>
      </main>
    </div>
  )
}
