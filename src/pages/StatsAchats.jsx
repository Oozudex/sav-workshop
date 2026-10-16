// Statistiques Achats (acheteurs et direction). Onglet « Taux de sortie » : une semaine par import
// (TAUX DE SORTIE S42 2026), comparée à la même semaine de l'année précédente.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, Modal, Notice } from '../components/admin/ui'
import { useBudgetUser } from '../lib/budgetsStore'
import { isoWeek, matchSemaine, semaineId, semaineLabel, semaineN1, semaineNom, weeksInYear } from '../lib/sorties'
import { ensureSemaine, useParametresAchats, useSemaines } from '../lib/sortiesStore'
import ParametresAchatsDialog, { GearIcon } from '../components/sorties/ParametresAchatsDialog'

const TABS = [['sorties', 'Taux de sortie']]
const SELECT = 'w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'

function NewSemaineModal({ semaines, onClose }) {
  const navigate = useNavigate()
  const user = useBudgetUser()
  const now = isoWeek()
  const [annee, setAnnee] = useState(now.annee)
  const [semaine, setSemaine] = useState(now.semaine)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const max = weeksInYear(annee)
  const s = Math.min(semaine, max)
  const id = semaineId(annee, s)
  const existing = semaines.find(x => x.id === id)

  async function submit() {
    setBusy(true); setError('')
    try {
      await ensureSemaine({ annee, semaine: s }, user)
      navigate(`/stats-achats/sorties/${id}`)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Nouvelle semaine" subtitle="Taux de sortie commun à tout le groupe" onClose={onClose}
      footer={<>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={submit} disabled={busy} className={BTN_PRIMARY}>{existing ? 'Ouvrir' : 'Créer'}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Année">
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} className={SELECT}>
            {[now.annee - 2, now.annee - 1, now.annee, now.annee + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Semaine">
          <select value={s} onChange={e => setSemaine(Number(e.target.value))} className={SELECT}>
            {Array.from({ length: max }, (_, i) => i + 1).map(w => <option key={w} value={w}>S{String(w).padStart(2, '0')}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-sm text-gray-900 dark:text-white">Nom : <strong>{semaineNom(annee, s)}</strong></p>
      <p className="text-xs text-gray-500 dark:text-neutral-400">Comparée à {semaineLabel(semaineN1({ annee, semaine: s }).annee, semaineN1({ annee, semaine: s }).semaine)} (même semaine de l’année précédente).</p>
      {existing && <Notice notice={{ tone: 'ok', text: `${existing.nom} existe déjà : elle sera ouverte.` }} />}
    </Modal>
  )
}

function SemaineCard({ s, n1, onOpen }) {
  const chip = (ok, text) => (
    <span className={`h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold ${ok
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>{text}</span>
  )
  const p = semaineN1(s)
  return (
    <button type="button" onClick={onOpen}
      className="flex flex-col text-left rounded-2xl border p-4 bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 hover:shadow-lg hover:ring-4 hover:ring-teal-200 dark:hover:ring-teal-500/30 transition-all space-y-2">
      <div>
        <p className="text-base font-bold text-gray-900 dark:text-white">{s.nom}</p>
        <p className="text-xs text-gray-500 dark:text-neutral-400">N-1 : {semaineLabel(p.annee, p.semaine)}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {chip(!!s.fichier, s.fichier ? `Semaine importée · ${s.fichier.lignes.toLocaleString('fr-FR')} lignes` : 'Semaine à importer')}
        {chip(!!n1?.fichier, n1?.fichier ? 'N-1 disponible' : 'N-1 à importer')}
      </div>
      {s.fichier?.totals && (
        <p className="text-xs text-gray-600 dark:text-neutral-300">CANet <strong className="tabular-nums">{Math.round(s.fichier.totals.caNet).toLocaleString('fr-FR')} €</strong></p>
      )}
    </button>
  )
}

// Périodes de la liste des semaines (année ISO de la semaine)
const PERIODES = [
  ['cette', 'Cette année', (s, an) => s.annee === an],
  ['derniere', 'L’année dernière', (s, an) => s.annee === an - 1],
  ['toutes', 'Toutes', () => true],
]

export default function StatsAchats() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('sorties')
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState(false)
  const parametres = useParametresAchats()
  const user = useBudgetUser()
  const [periode, setPeriode] = useState('cette')
  const [q, setQ] = useState('')
  const { list, loading } = useSemaines()
  const byId = new Map(list.map(s => [s.id, s]))
  const an = isoWeek().annee
  const counts = Object.fromEntries(PERIODES.map(([k, , f]) => [k, list.filter(s => f(s, an)).length]))
  const inPeriode = list.filter(s => PERIODES.find(x => x[0] === periode)[2](s, an))
  const shown = q.trim() ? inPeriode.filter(s => matchSemaine(s, q)) : inPeriode

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Statistiques Achats</h1>
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">Ventes, marge, stock et taux de sortie du groupe, semaine par semaine.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSettings(true)} disabled={parametres.loading} aria-label="Paramètres des Statistiques Achats" title="Paramètres"
                className="h-9 w-9 grid place-items-center rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:text-gray-800 hover:bg-gray-100 dark:hover:text-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                <GearIcon />
              </button>
              {tab === 'sorties' && <button type="button" onClick={() => setCreating(true)} className={BTN_PRIMARY}>Nouvelle semaine</button>}
            </div>
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

          {tab === 'sorties' && (loading ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">Chargement…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <EmptyState title="Aucune semaine" text="Crée la semaine en cours puis importe son fichier et celui de la même semaine de l’année précédente."
                action={<button type="button" onClick={() => setCreating(true)} className={BTN_PRIMARY}>Nouvelle semaine</button>} />
            </div>
          ) : (<>
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Période" className="inline-flex p-0.5 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
                {PERIODES.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={periode === k} onClick={() => setPeriode(k)}
                    className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-colors ${periode === k
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white'}`}>
                    {label} <span className="tabular-nums opacity-75">{counts[k]}</span>
                  </button>
                ))}
              </div>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une semaine (S42, 2025…)"
                aria-label="Rechercher une semaine" className="Input h-8 text-xs w-full sm:w-64" />
            </div>
            {shown.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <EmptyState title="Aucune semaine" text={q.trim()
                  ? `Aucune semaine ne correspond à « ${q.trim()} » ${periode === 'toutes' ? '' : 'sur cette période'}.`
                  : 'Aucune semaine sur cette période.'}
                  action={periode !== 'toutes' && <button type="button" onClick={() => setPeriode('toutes')} className={BTN_SECONDARY}>Voir toutes les semaines</button>} />
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {shown.map(s => {
                const p = semaineN1(s)
                return <SemaineCard key={s.id} s={s} n1={byId.get(semaineId(p.annee, p.semaine))} onOpen={() => navigate(`/stats-achats/sorties/${s.id}`)} />
              })}
            </div>
            )}
          </>))}
        </div>
      </main>
      {creating && <NewSemaineModal semaines={list} onClose={() => setCreating(false)} />}
      {settings && <ParametresAchatsDialog parametres={parametres} user={user} onClose={() => setSettings(false)} />}
    </div>
  )
}
