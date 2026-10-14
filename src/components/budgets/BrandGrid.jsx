// Segment d'un budget (vue Univers › Segment › Marques) : une ligne par marque, une colonne par magasin,
// comme l'onglet « BUDGET PAR MARQUES » du fichier Excel. Chaque case : N-1 et budget à saisir.
// En haut le budget de base, en bas le total saisi et le reste par magasin.
import { useState } from 'react'
import { IconButton } from '../admin/ui'
import { formatBudget, hasValue, sumValues } from '../../lib/budgets'
import { deleteLine, setCommentaire, setSaisie } from '../../lib/budgetsStore'
import { AddBrandForm, AmountInput, N1Comment, OrphanTag, Reste, TextInput } from './SegmentSaisie'

const TH = 'py-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400'
const STICKY = 'sticky left-0 z-10 bg-white dark:bg-neutral-900'

export default function BrandGrid({ budgetId, seg, magasins, totals, brands, user, readOnly = false }) {
  const [error, setError] = useState('')
  const run = p => p.catch(err => setError(err.message))
  const cell = magId => totals?.[magId] || { base: 0, n1: 0, saisie: 0 }
  const sum = key => magasins.reduce((t, m) => t + cell(m.id)[key], 0)

  function removeOrphan(b) {
    if (!confirm(`Supprimer « ${b.nom} » de ce budget ? Son N-1 et sa saisie sont supprimés pour tous les magasins.`)) return
    run(deleteLine(budgetId, b.id))
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-neutral-300">
        <span className="font-semibold text-gray-900 dark:text-white">{seg.univers}{seg.nom ? ` › ${seg.nom}` : ''}</span>
        <span>Base <strong className="tabular-nums">{formatBudget(sum('base'))}</strong></span>
        <span>N-1 <strong className="tabular-nums">{formatBudget(sum('n1'))}</strong></span>
        <span>Saisi <strong className="tabular-nums">{formatBudget(sum('saisie'))}</strong></span>
        <Reste base={sum('base')} saisie={sum('saisie')} />
        {readOnly && (
          <span className="ml-auto h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            Lecture seule · univers non attribué
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className={`${TH} ${STICKY} pl-0 min-w-[9rem]`}>Marque</th>
              {magasins.map(m => <th key={m.id} scope="col" className={`${TH} text-right min-w-[6.5rem]`} title={m.nom}>{m.nom}</th>)}
              <th scope="col" className={`${TH} text-right min-w-[6.5rem]`}>Total</th>
              <th scope="col" className={`${TH} min-w-[12rem]`}>Commentaire</th>
              {!readOnly && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-gray-50 dark:bg-neutral-800/40">
              <th scope="row" className={`${STICKY} !bg-gray-50 dark:!bg-neutral-800/40 py-1.5 pr-2 text-xs font-semibold text-gray-700 dark:text-neutral-200`}>Budget de base</th>
              {magasins.map(m => <td key={m.id} className="py-1.5 px-1.5 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">{formatBudget(cell(m.id).base)}</td>)}
              <td className="py-1.5 px-1.5 text-right text-xs font-bold tabular-nums text-gray-900 dark:text-white">{formatBudget(sum('base'))}</td>
              <td colSpan={readOnly ? 1 : 2} />
            </tr>
            {brands.map(b => {
              const n1Total = sumValues(b.line?.n1)
              const saisieTotal = sumValues(b.line?.saisie)
              return (
                <tr key={b.id} className="align-top">
                  <th scope="row" className={`${STICKY} border-t border-gray-100 dark:border-neutral-800 py-1.5 pr-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap`}>
                    {b.nom}{b.orphan && <OrphanTag />}<N1Comment text={b.line?.commentaireN1} />
                  </th>
                  {magasins.map(m => (
                    <td key={m.id} className="border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5">
                      {readOnly ? (
                        <p className="h-8 leading-8 text-right text-sm tabular-nums text-gray-900 dark:text-white">
                          {hasValue(b.line?.saisie, m.id) ? formatBudget(b.line.saisie[m.id]) : '—'}
                        </p>
                      ) : (
                        <AmountInput value={b.line?.saisie?.[m.id]} label={`Budget ${b.nom} – ${m.nom}`}
                          onSave={v => run(setSaisie(budgetId, b, m.id, v, user))} />
                      )}
                      <p className="mt-0.5 text-right text-[10px] tabular-nums text-gray-500 dark:text-neutral-400">
                        N-1 {hasValue(b.line?.n1, m.id) ? formatBudget(b.line.n1[m.id]) : '—'}
                      </p>
                    </td>
                  ))}
                  <td className="border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5 text-right">
                    <p className="h-8 leading-8 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formatBudget(saisieTotal)}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-gray-500 dark:text-neutral-400">N-1 {formatBudget(n1Total)}</p>
                  </td>
                  <td className="border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5">
                    {readOnly ? <p className="text-sm text-gray-600 dark:text-neutral-300 pt-1.5">{b.line?.commentaire}</p> : (
                      <TextInput value={b.line?.commentaire} label={`Commentaire ${b.nom}`} placeholder="Commentaire"
                        onSave={v => run(setCommentaire(budgetId, b, v, user))} />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="border-t border-gray-100 dark:border-neutral-800 py-1.5 pl-1">
                      {b.orphan && <IconButton icon="delete" danger label={`Supprimer ${b.nom} de ce budget`} onClick={() => removeOrphan(b)} />}
                    </td>
                  )}
                </tr>
              )
            })}
            {brands.length === 0 && (
              <tr><td colSpan={magasins.length + 4} className="py-3 text-xs text-gray-500 dark:text-neutral-400">
                Aucune marque dans ce segment : ajoute-les ci-dessous ou dans l’onglet Marques des budgets.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold text-gray-900 dark:text-white">
              <th scope="row" className={`${STICKY} border-t border-gray-200 dark:border-neutral-700 py-1.5 pr-2 text-left`}>Total saisi</th>
              {magasins.map(m => <td key={m.id} className="border-t border-gray-200 dark:border-neutral-700 py-1.5 px-1.5 text-right tabular-nums">{formatBudget(cell(m.id).saisie)}</td>)}
              <td className="border-t border-gray-200 dark:border-neutral-700 py-1.5 px-1.5 text-right tabular-nums">{formatBudget(sum('saisie'))}</td>
              <td colSpan={readOnly ? 1 : 2} className="border-t border-gray-200 dark:border-neutral-700" />
            </tr>
            <tr className="text-xs">
              <th scope="row" className={`${STICKY} py-1.5 pr-2 text-left font-semibold text-gray-700 dark:text-neutral-200`}>Reste</th>
              {magasins.map(m => <td key={m.id} className="py-1.5 px-1.5 text-right"><Reste base={cell(m.id).base} saisie={cell(m.id).saisie} short /></td>)}
              <td className="py-1.5 px-1.5 text-right"><Reste base={sum('base')} saisie={sum('saisie')} short /></td>
              <td colSpan={readOnly ? 1 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && <AddBrandForm seg={seg} brands={brands} user={user} />}
    </div>
  )
}
