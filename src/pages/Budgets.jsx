// Budgets acheteurs : liste des budgets du groupe (BUDGET AH27, BUDGET PE28…) et listes communes
// des univers et des magasins utilisées pour lire les fichiers de base et de N-1.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ListEditor from '../components/budgets/ListEditor'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, Modal, Notice } from '../components/admin/ui'
import { SAISONS, budgetName, formatBudget, previousSeason, sumValues } from '../lib/budgets'
import { createBudget, useBudgetMagasins, useBudgetUnivers, useBudgetUser, useBudgets } from '../lib/budgetsStore'

const TABS = [['budgets', 'Budgets'], ['univers', 'Univers'], ['magasins', 'Magasins']]

function NewBudgetModal({ budgets, onClose }) {
  const navigate = useNavigate()
  const user = useBudgetUser()
  const year = new Date().getFullYear()
  const [saison, setSaison] = useState('AH')
  const [annee, setAnnee] = useState(year + 1)
  const [reprendre, setReprendre] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const nom = budgetName(saison, annee)
  const exists = budgets.some(b => b.saison === saison && b.annee === annee)
  const prevSeason = previousSeason({ saison, annee })
  const prev = budgets.find(b => b.saison === prevSeason.saison && b.annee === prevSeason.annee)

  async function submit() {
    setBusy(true); setError('')
    try {
      const id = await createBudget({ saison, annee, reprendre: !!prev && reprendre }, user)
      navigate(`/budgets/${id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Nouveau budget" subtitle="Budget commun à tout le groupe" onClose={onClose}
      footer={<>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={submit} disabled={busy || exists} className={BTN_PRIMARY}>{busy ? 'Création…' : `Créer ${nom}`}</button>
      </>}>
      <fieldset className="space-y-1">
        <legend className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">Saison</legend>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {Object.entries(SAISONS).map(([k, label]) => (
            <label key={k} className={`flex items-center gap-2 h-10 px-3 rounded-lg border cursor-pointer text-sm ${saison === k
              ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white text-gray-900 dark:text-white'
              : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300'}`}>
              <input type="radio" name="saison" value={k} checked={saison === k} onChange={() => setSaison(k)} className="sr-only" />
              <span className="font-semibold">{k}</span><span className="text-xs text-gray-500 dark:text-neutral-400">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Année">
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
          className="w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white">
          {[year - 1, year, year + 1, year + 2, year + 3].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </Field>
      <p className="text-sm text-gray-900 dark:text-white">Nom : <strong>{nom}</strong></p>
      {exists && <Notice notice={{ text: `${nom} existe déjà.` }} />}
      {prev && !exists && (
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-neutral-300">
          <input type="checkbox" checked={reprendre} onChange={e => setReprendre(e.target.checked)} className="mt-0.5" />
          <span>Reprendre les marques de <strong>{prev.nom}</strong>, avec sa saisie comme N-1</span>
        </label>
      )}
    </Modal>
  )
}

function BudgetCard({ budget, onOpen }) {
  const base = Object.values(budget.base || {}).reduce((t, m) => t + sumValues(m), 0)
  const chip = (ok, text) => (
    <span className={`h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold ${ok
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>{text}</span>
  )
  return (
    <button type="button" onClick={onOpen}
      className="text-left rounded-2xl border p-4 bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:shadow-lg hover:ring-4 hover:ring-violet-200 dark:hover:ring-violet-500/30 transition-all space-y-2">
      <div>
        <p className="text-base font-bold text-gray-900 dark:text-white">{budget.nom}</p>
        <p className="text-xs text-gray-500 dark:text-neutral-400">{SAISONS[budget.saison]} {budget.annee}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {chip(!!budget.baseImport, budget.baseImport ? 'Base importée' : 'Base à importer')}
        {chip(!!budget.n1Import, budget.n1Import ? 'N-1 récupéré' : 'N-1 à récupérer')}
      </div>
      {budget.baseImport && <p className="text-xs text-gray-600 dark:text-neutral-300">Budget de base <strong className="tabular-nums">{formatBudget(base)}</strong></p>}
      {budget.createdBy?.nom && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Créé par {budget.createdBy.nom}</p>}
    </button>
  )
}

export default function Budgets() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('budgets')
  const [creating, setCreating] = useState(false)
  const budgets = useBudgets()
  const univers = useBudgetUnivers()
  const magasins = useBudgetMagasins()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Budgets</h1>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                Budgets d’achat du groupe par univers, segment, magasin et marque.
              </p>
            </div>
            {tab === 'budgets' && <button type="button" onClick={() => setCreating(true)} className={BTN_PRIMARY}>Nouveau budget</button>}
          </div>

          <div role="tablist" aria-label="Rubriques" className="inline-flex p-1 rounded-xl bg-gray-100 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${tab === k
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'budgets' && (budgets.loading ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">Chargement…</p>
          ) : budgets.list.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <EmptyState title="Aucun budget" text="Crée le premier budget, par exemple BUDGET AH27."
                action={<button type="button" onClick={() => setCreating(true)} className={BTN_PRIMARY}>Nouveau budget</button>} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...budgets.list].sort((a, b) => b.annee - a.annee || a.saison.localeCompare(b.saison)).map(b => (
                <BudgetCard key={b.id} budget={b} onOpen={() => navigate(`/budgets/${b.id}`)} />
              ))}
            </div>
          ))}
          {tab === 'univers' && <ListEditor kind="univers" list={univers.list} loading={univers.loading} />}
          {tab === 'magasins' && <ListEditor kind="magasins" list={magasins.list} loading={magasins.loading} />}
        </div>
      </main>
      {creating && <NewBudgetModal budgets={budgets.list} onClose={() => setCreating(false)} />}
    </div>
  )
}
