// Une semaine de taux de sortie (TAUX DE SORTIE S42 2026) : import du fichier de la semaine et de celui de
// la même semaine N-1 (repris automatiquement s'il a déjà été importé), puis le tableau croisé.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChangeSemaineDialog from '../components/sorties/ChangeSemaineDialog'
import ImportSortieDialog from '../components/sorties/ImportSortieDialog'
import SortieEvolution from '../components/sorties/SortieEvolution'
import SortieInfo from '../components/sorties/SortieInfo'
import SortiePivot from '../components/sorties/SortiePivot'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Notice } from '../components/admin/ui'
import { normLabel } from '../lib/budgets'
import { useBudgetMagasins, useBudgetUnivers, useBudgetUser } from '../lib/budgetsStore'
import { finSemaine, recepRaccourcis, semaineId, semaineLabel, semaineN1 } from '../lib/sorties'
import { deleteSemaine, useParametresAchats, useSemaine, useSemaineData } from '../lib/sortiesStore'

const dateLabel = ts => ts?.toDate?.()?.toLocaleDateString('fr-FR') || ''

// dot : couleur de la période (N-1 gris, N bleu canard, comme dans le tableau)
function Status({ title, dot, s, data, onImport, importLabel }) {
  const f = s?.fichier
  return (
    <div className={`rounded-2xl border px-4 py-3 bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 border-t-4 ${f ? 'border-t-emerald-500' : 'border-t-amber-400'}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${dot}`} />{title}
      </p>
      {f ? (
        <p className="text-sm text-gray-900 dark:text-white">
          <strong className="tabular-nums">{f.lignes.toLocaleString('fr-FR')}</strong> lignes · importé le {dateLabel(f.at)}{f.by?.nom ? ` par ${f.by.nom}` : ''}
          {f.fileName && <span className="block text-[11px] text-gray-500 dark:text-neutral-400 truncate">{f.fileName}</span>}
        </p>
      ) : <p className="text-sm text-amber-700 dark:text-amber-400">Pas encore importé</p>}
      {data.loading && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Chargement des lignes…</p>}
      {data.error && <p className="text-[11px] text-red-600 dark:text-red-400">{data.error}</p>}
      {data.ds && !data.ds.recep && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">Sans les dates de réception (Der Recep) : réimporte le fichier pour les avoir.</p>
      )}
      <button type="button" onClick={onImport} className={`mt-2 ${f ? BTN_SECONDARY : BTN_PRIMARY}`}>{f ? `Réimporter` : importLabel}</button>
    </div>
  )
}

export default function SortieDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useBudgetUser()
  const { semaine, loading } = useSemaine(id)
  const p = semaine ? semaineN1(semaine) : null
  const { semaine: semN1 } = useSemaine(p ? semaineId(p.annee, p.semaine) : null)
  const dataN = useSemaineData(semaine)
  const dataN1 = useSemaineData(semN1)
  const { list: magasins } = useBudgetMagasins()
  const { list: univers } = useBudgetUnivers()
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const [tableFilters, setTableFilters] = useState({})
  const { saisons } = useParametresAchats()
  const isDirection = user.role === 'directeurgen'

  // Acheteur : filtre par défaut sur ses univers (s'ils existent dans les fichiers)
  const defaultFilters = useMemo(() => {
    if (user.role !== 'acheteur' || !user.univers.length) return {}
    const mine = new Set(user.univers.map(normLabel))
    const values = new Set([...(dataN.ds?.dims.univers || []), ...(dataN1.ds?.dims.univers || [])].filter(v => mine.has(normLabel(v))))
    return values.size ? { univers: values } : {}
  }, [user.role, user.univers, dataN.ds, dataN1.ds])

  if (loading) return <Page><p className="text-sm text-gray-500 dark:text-neutral-400">Chargement…</p></Page>
  if (!semaine) return <Page><EmptyState title="Semaine introuvable" action={<Link to="/stats-achats" className={`${BTN_SECONDARY} inline-flex items-center`}>Retour</Link>} /></Page>

  const labelN = semaineLabel(semaine.annee, semaine.semaine)
  const labelN1 = semaineLabel(p.annee, p.semaine)
  const ready = dataN.ds || dataN1.ds

  async function remove() {
    if (!confirm(`Supprimer ${semaine.nom} et ses lignes ? (La semaine N-1 ${labelN1} n’est pas supprimée.)`)) return
    try { await deleteSemaine(semaine.id); navigate('/stats-achats') } catch (err) { setNotice({ text: err.message }) }
  }

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/stats-achats" className="text-xs text-gray-500 dark:text-neutral-400 hover:underline">← Statistiques Achats</Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{semaine.nom}</h1>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">Comparée à la même semaine de l’année précédente : {labelN1}.</p>
        </div>
        <div className="flex items-center gap-1">
          {(isDirection || user.role === 'acheteur') && <button type="button" onClick={() => setDialog('move')} className={BTN_SECONDARY}>Changer de semaine</button>}
          {isDirection && (
            <button type="button" onClick={remove} className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">Supprimer</button>
          )}
        </div>
      </div>
      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Status title={`Semaine N · ${labelN}`} dot="bg-teal-600" s={semaine} data={dataN} importLabel="Importer la semaine" onImport={() => setDialog('n')} />
        <Status title={`N-1 · ${labelN1}`} dot="bg-gray-400" s={semN1} data={dataN1} importLabel="Importer le N-1" onImport={() => setDialog('n1')} />
      </div>
      <p className="text-[11px] text-gray-500 dark:text-neutral-400 -mt-2">
        Le N-1 est la semaine {labelN1} enregistrée dans l’application : une fois importée, elle est reprise automatiquement
        (et l’an prochain, {labelN} servira de N-1 sans rien réimporter).
      </p>

      {ready ? (
        <>
          <SortiePivot key={`${semaine.fichier?.version}-${semN1?.fichier?.version}`} n={dataN.ds} n1={dataN1.ds} labelN={labelN} labelN1={labelN1}
            defaultFilters={defaultFilters} onFiltersChange={setTableFilters} recepRaccourcis={recepRaccourcis(semaine, saisons)}
            finN={finSemaine(semaine.annee, semaine.semaine)} finN1={finSemaine(p.annee, p.semaine)} />
          <SortieEvolution key={semaine.id} semaine={semaine} filters={tableFilters} />
        </>
      ) : !dataN.loading && !dataN1.loading && (<>
        <SortieInfo labelN={labelN} labelN1={labelN1} />
        <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <EmptyState title="Rien à afficher" text="Importe le fichier de la semaine et celui de la même semaine de l’année précédente." />
        </div>
      </>)}

      {dialog === 'move' && (
        <ChangeSemaineDialog semaine={semaine} user={user} onClose={() => setDialog(null)}
          onDone={to => {
            setDialog(null)
            navigate(`/stats-achats/sorties/${to}`, { replace: true })
            setNotice({ tone: 'ok', text: `${semaine.nom} a été rangée dans la bonne semaine.` })
          }} />
      )}
      {(dialog === 'n' || dialog === 'n1') && (
        <ImportSortieDialog target={dialog === 'n' ? { ...semaine, label: `la semaine ${labelN}` } : { ...p, label: `le N-1 (${labelN1})` }}
          magasins={magasins} univers={univers} user={user} onClose={() => setDialog(null)}
          onDone={() => setNotice({ tone: 'ok', text: `Import enregistré (${dialog === 'n' ? labelN : labelN1}).` })} />
      )}
    </Page>
  )
}

function Page({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="w-full space-y-4">{children}</div>
      </main>
    </div>
  )
}
