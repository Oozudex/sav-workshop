// Segment d'un budget (vue Univers › Segment › Marques) : une ligne par marque, une colonne par magasin,
// comme l'onglet « BUDGET PAR MARQUES » du fichier Excel. Chaque case : N-1 et budget à saisir.
// En haut le budget de base et le budget groupe, en bas le total saisi et le reste par magasin.
import { useState } from 'react'
import { IconButton } from '../admin/ui'
import { emptyCell, formatBudget, formatQte, objectif, sumValues } from '../../lib/budgets'
import { deleteLine, setCommentaire } from '../../lib/budgetsStore'
import { AddBrandForm, BrandEngage, BrandNote, OrphanTag, Reste, SaisieCell, TextInput, brandInfo } from './SegmentSaisie'
import { TONE } from './tones'

const TH = 'py-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400'
const STICKY = 'sticky left-0 z-10 bg-white dark:bg-neutral-900'

export default function BrandGrid({ budgetId, seg, magasins, totals, hasGroupe, adapte, brands, user, readOnly = false }) {
  const [error, setError] = useState('')
  const run = p => p.catch(err => setError(err.message))
  const cell = magId => totals?.[magId] || emptyCell()
  const sum = key => magasins.reduce((t, m) => t + cell(m.id)[key], 0)
  const total = { base: sum('base'), groupe: sum('groupe') }
  // Le budget adapté répartit l'enveloppe du segment entre ses marques : son total est celui du budget
  // groupe, sauf dans les magasins où aucune marque n'a de N-1 (rien à répartir)
  const nonReparti = magasins.reduce((t, m) => t + Math.max(objectif(cell(m.id), hasGroupe), 0) - cell(m.id).adapte, 0)
  const refRow = (key, value) => (
    <tr className={TONE[key].row}>
      <th scope="row" className={`${STICKY} ${TONE[key].sticky} py-1.5 pr-2 text-xs font-semibold ${TONE[key].text}`}>{TONE[key].label}</th>
      {magasins.map(m => <td key={m.id} className={`py-1.5 px-1.5 text-right text-xs font-semibold tabular-nums ${TONE[key].text}`}>{formatBudget(value(m.id))}</td>)}
      <td className={`py-1.5 px-1.5 text-right text-xs font-bold tabular-nums ${TONE[key].text}`}>{formatBudget(total[key])}</td>
      <td colSpan={readOnly ? 1 : 2} />
    </tr>
  )

  // Ligne de détail sous le total saisi (zéro affiché « — »)
  const footRow = (label, tone, value, totalValue, format) => (
    <tr className={`text-xs ${tone ? TONE[tone].text : 'text-gray-700 dark:text-neutral-300'}`}>
      <th scope="row" className={`${STICKY} py-1 pr-2 text-left font-medium`}>{label}</th>
      {magasins.map(m => <td key={m.id} className="py-1 px-1.5 text-right tabular-nums">{Math.round(value(m.id)) ? format(value(m.id)) : '—'}</td>)}
      <td className="py-1 px-1.5 text-right tabular-nums font-semibold">{Math.round(totalValue) ? format(totalValue) : '—'}</td>
      <td colSpan={readOnly ? 1 : 2} />
    </tr>
  )

  function removeOrphan(b) {
    if (!confirm(`Supprimer « ${b.nom} » de ce budget ? Son N-1 et sa saisie sont supprimés pour tous les magasins.`)) return
    run(deleteLine(budgetId, b.id))
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-neutral-300">
        <span className="font-semibold text-gray-900 dark:text-white">{seg.univers}{seg.nom ? ` › ${seg.nom}` : ''}</span>
        <span className={TONE.base.text}>Base <strong className="tabular-nums">{formatBudget(total.base)}</strong></span>
        {hasGroupe && <span className={TONE.groupe.text}>Groupe <strong className="tabular-nums">{formatBudget(total.groupe)}</strong></span>}
        <span className={TONE.n1.text}>N-1 <strong className="tabular-nums">{formatBudget(sum('n1'))}</strong></span>
        <span>Saisi <strong className="tabular-nums">{formatBudget(sum('saisie'))}</strong></span>
        <span className={TONE.engage.text}>Engagé <strong className="tabular-nums">{formatBudget(sum('engage'))}</strong></span>
        <span className={TONE.previsionnel.text}>Prévisionnel <strong className="tabular-nums">{formatBudget(sum('saisie') - sum('engage'))}</strong></span>
        {(sum('qte') > 0 || sum('qteN1') > 0) && <span>Qté <strong className="tabular-nums">{formatQte(sum('qte'))}</strong> <span className={TONE.n1.text}>(N-1 {formatQte(sum('qteN1'))})</span></span>}
        <Reste objectif={objectif(total, hasGroupe)} saisie={sum('saisie')} />
        {readOnly && (
          <span className="ml-auto h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            Lecture seule · univers non attribué
          </span>
        )}
      </div>
      {nonReparti >= 1 && brands.length > 0 && (
        <p className={`text-[11px] ${TONE.adapte.text}`}>
          Budget adapté : {formatBudget(nonReparti)} non réparti entre les marques (magasins où aucune marque n’a de N-1 ni de demande).
        </p>
      )}
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className={`${TH} ${STICKY} pl-0 min-w-[9rem]`}>Marque</th>
              {magasins.map(m => <th key={m.id} scope="col" className={`${TH} text-right min-w-[7.5rem]`} title={m.nom}>{m.nom}</th>)}
              <th scope="col" className={`${TH} text-right min-w-[6.5rem]`}>Total</th>
              <th scope="col" className={`${TH} min-w-[12rem]`}>Commentaire</th>
              {!readOnly && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {refRow('base', id => cell(id).base)}
            {hasGroupe && refRow('groupe', id => cell(id).groupe)}
            {brands.map(b => {
              const n1Total = sumValues(b.line?.n1)
              const saisieTotal = sumValues(b.line?.saisie)
              const qte = sumValues(b.line?.quantite), qteN1 = sumValues(b.line?.quantiteN1)
              const adapteB = adapte?.byBrand.get(b.id) || {}
              const adapteTotal = sumValues(adapteB)
              const ecart = saisieTotal - adapteTotal
              return (
                <tr key={b.id} className="align-top">
                  <th scope="row" className={`${STICKY} border-t border-gray-100 dark:border-neutral-800 py-1.5 pr-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap`}>
                    {b.nom}{b.orphan && <OrphanTag />}
                    <BrandNote info={brandInfo(adapte, b)} brand={b} />
                    <div className="mt-2"><BrandEngage budgetId={budgetId} brand={b} user={user} readOnly={readOnly} run={run} /></div>
                  </th>
                  {magasins.map(m => (
                    <td key={m.id} className="border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5">
                      <SaisieCell budgetId={budgetId} brand={b} mag={m} user={user} readOnly={readOnly} run={run} adapte={adapteB[m.id] || 0} />
                    </td>
                  ))}
                  <td className="border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5 text-right">
                    <p className="h-8 leading-8 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formatBudget(saisieTotal)}</p>
                    {(qte > 0 || !readOnly) && <p className="h-7 leading-7 mt-1 text-xs tabular-nums text-gray-700 dark:text-neutral-300">{qte > 0 ? formatQte(qte) : ''}</p>}
                    <p className={`mt-0.5 text-[10px] tabular-nums ${TONE.n1.head}`}>N-1 {formatBudget(n1Total)}{qteN1 > 0 ? ` · ${formatQte(qteN1)}` : ''}</p>
                    {!b.orphan && <p className={`text-[10px] tabular-nums ${TONE.adapte.text}`}>Adapté {formatBudget(adapteTotal)}</p>}
                    {saisieTotal > 0 && Math.round(ecart) !== 0 && (
                      <p className={`text-[10px] tabular-nums ${ecart > 0 ? TONE.depassement.text : 'text-gray-500 dark:text-neutral-400'}`}>
                        {ecart > 0 ? '+' : '−'}{formatBudget(Math.abs(ecart))} vs adapté
                      </p>
                    )}
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
            {footRow('dont engagé', 'engage', id => cell(id).engage, sum('engage'), formatBudget)}
            {footRow('dont prévisionnel', 'previsionnel', id => cell(id).saisie - cell(id).engage, sum('saisie') - sum('engage'), formatBudget)}
            {(sum('qte') > 0 || sum('qteN1') > 0) && footRow('Quantité', null, id => cell(id).qte, sum('qte'), formatQte)}
            <tr className="text-xs">
              <th scope="row" className={`${STICKY} py-1.5 pr-2 text-left font-semibold text-gray-700 dark:text-neutral-200`}>Reste</th>
              {magasins.map(m => <td key={m.id} className="py-1.5 px-1.5 text-right"><Reste objectif={objectif(cell(m.id), hasGroupe)} saisie={cell(m.id).saisie} short /></td>)}
              <td className="py-1.5 px-1.5 text-right"><Reste objectif={objectif(total, hasGroupe)} saisie={sum('saisie')} short /></td>
              <td colSpan={readOnly ? 1 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && <AddBrandForm seg={seg} brands={brands} user={user} />}
    </div>
  )
}
