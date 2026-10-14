// Saisie d'un segment pour un magasin : budget de base, puis par marque le N-1 et le budget à remplir.
// Le commentaire d'une marque est commun à tous les magasins (comme la colonne COMMENTAIRES du N-1).
// readOnly : univers non attribué à l'acheteur (lecture seule).
import { useState } from 'react'
import { IconButton } from '../admin/ui'
import { formatBudget, hasValue, marqueKey, normLabel, toAmount } from '../../lib/budgets'
import { addMarque, deleteMarque, setSaisie, updateMarque } from '../../lib/budgetsStore'

const CELL_INPUT = 'w-full h-8 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20'

const inputValue = v => (typeof v === 'number' ? String(v).replace('.', ',') : '')

// Entrée : enregistre et passe à la ligne suivante
function focusNext(el) {
  const all = [...document.querySelectorAll('input[data-budget-saisie]')]
  all[all.indexOf(el) + 1]?.focus()
}

function AmountInput({ value, onSave, label }) {
  const [draft, setDraft] = useState(null)
  const [invalid, setInvalid] = useState(false)

  function commit() {
    if (draft == null) return
    const v = draft.trim() === '' ? null : toAmount(draft)
    setDraft(null)
    if (draft.trim() !== '' && v == null) { setInvalid(true); return }
    setInvalid(false)
    if (v !== (typeof value === 'number' ? value : null)) onSave(v)
  }

  return (
    <input data-budget-saisie inputMode="decimal" aria-label={label} aria-invalid={invalid || undefined}
      value={draft ?? inputValue(value)}
      onFocus={e => { setDraft(inputValue(value)); e.target.select() }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; commit(); focusNext(el) }
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      className={`${CELL_INPUT} text-right tabular-nums ${invalid ? '!border-red-400' : ''}`} />
  )
}

function TextInput({ value, onSave, label, placeholder }) {
  const [draft, setDraft] = useState(null)
  function commit() {
    if (draft == null) return
    const v = draft.trim()
    setDraft(null)
    if (v !== (value || '')) onSave(v)
  }
  return (
    <input aria-label={label} placeholder={placeholder} value={draft ?? (value || '')}
      onFocus={() => setDraft(value || '')} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() } }}
      className={CELL_INPUT} />
  )
}

function Reste({ base, saisie }) {
  const reste = base - saisie
  const cls = Math.round(reste) === 0 ? 'text-emerald-700 dark:text-emerald-400'
    : reste < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-neutral-300'
  return <span className={`font-semibold tabular-nums ${cls}`}>{reste < 0 ? `Dépassement ${formatBudget(-reste)}` : `Reste ${formatBudget(reste)}`}</span>
}

function MarqueRow({ budgetId, marque, magasin, user, siblings, readOnly }) {
  const [renaming, setRenaming] = useState(null)
  const [error, setError] = useState('')
  const n1 = marque.n1?.[magasin.id]
  const run = p => p.catch(err => setError(err.message))

  function rename(e) {
    e.preventDefault()
    if (renaming == null) return
    const nom = renaming.trim().toUpperCase()
    if (!nom || nom === marque.nom) return setRenaming(null)
    if (siblings.some(m => m.id !== marque.id && marqueKey(m.segId, m.nom) === marqueKey(marque.segId, nom))) {
      return setError(`« ${nom} » existe déjà dans ce segment.`)
    }
    setError('')
    setRenaming(null)
    run(updateMarque(budgetId, marque.id, { nom }, user))
  }

  function remove() {
    if (!confirm(`Supprimer la marque « ${marque.nom} » de ce segment ?\nSon N-1 et sa saisie sont supprimés pour tous les magasins.`)) return
    run(deleteMarque(budgetId, marque.id))
  }

  return (
    <tr className="border-t border-gray-100 dark:border-neutral-800 align-middle">
      <td className="py-1.5 pr-2">
        {renaming != null ? (
          <form onSubmit={rename}>
            <input autoFocus value={renaming} onChange={e => setRenaming(e.target.value)} onBlur={rename}
              onKeyDown={e => e.key === 'Escape' && setRenaming(null)} aria-label="Nouveau nom de la marque" className={`${CELL_INPUT} uppercase`} />
          </form>
        ) : (
          <span className="text-sm font-medium text-gray-900 dark:text-white">{marque.nom}</span>
        )}
        {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      </td>
      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-gray-600 dark:text-neutral-300 whitespace-nowrap">
        {hasValue(marque.n1, magasin.id) ? formatBudget(n1) : '—'}
        {marque.commentaireN1 && (
          <span title={`Commentaire N-1 : ${marque.commentaireN1}`} aria-label={`Commentaire N-1 : ${marque.commentaireN1}`}
            className="ml-1 inline-grid place-items-center h-4 w-4 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300 cursor-help">i</span>
        )}
      </td>
      {readOnly ? <>
        <td className="py-1.5 px-2 w-32 text-right text-sm tabular-nums text-gray-900 dark:text-white">
          {hasValue(marque.saisie, magasin.id) ? formatBudget(marque.saisie[magasin.id]) : '—'}
        </td>
        <td className="py-1.5 px-2 min-w-[12rem] text-sm text-gray-600 dark:text-neutral-300">{marque.commentaire}</td>
        <td />
      </> : <>
        <td className="py-1.5 px-2 w-32">
          <AmountInput value={marque.saisie?.[magasin.id]} label={`Budget ${marque.nom} – ${magasin.nom}`}
            onSave={v => run(setSaisie(budgetId, marque.id, magasin.id, v, user))} />
        </td>
        <td className="py-1.5 px-2 min-w-[12rem]">
          <TextInput value={marque.commentaire} label={`Commentaire ${marque.nom}`} placeholder="Commentaire"
            onSave={v => run(updateMarque(budgetId, marque.id, { commentaire: v }, user))} />
        </td>
        <td className="py-1.5 pl-1">
          <div className="flex items-center justify-end gap-0.5">
            <IconButton icon="edit" label={`Renommer ${marque.nom}`} onClick={() => setRenaming(marque.nom)} />
            <IconButton icon="delete" danger label={`Supprimer ${marque.nom}`} onClick={remove} />
          </div>
        </td>
      </>}
    </tr>
  )
}

export default function SegmentSaisie({ budgetId, seg, magasin, base, marques, user, readOnly = false }) {
  const [nom, setNom] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const n1 = marques.reduce((t, m) => t + (m.n1?.[magasin.id] || 0), 0)
  const saisie = marques.reduce((t, m) => t + (m.saisie?.[magasin.id] || 0), 0)

  async function add(e) {
    e.preventDefault()
    const v = nom.trim().toUpperCase()
    if (!v) return
    if (marques.some(m => normLabel(m.nom) === normLabel(v))) return setError(`« ${v} » existe déjà dans ce segment.`)
    setBusy(true); setError('')
    try { await addMarque(budgetId, seg, v, user); setNom('') } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-neutral-300">
        <span className="font-semibold text-gray-900 dark:text-white">{magasin.nom} · {seg.univers}{seg.nom ? ` › ${seg.nom}` : ''}</span>
        <span>Base <strong className="tabular-nums">{formatBudget(base)}</strong></span>
        <span>Saisi <strong className="tabular-nums">{formatBudget(saisie)}</strong></span>
        <Reste base={base} saisie={saisie} />
        {readOnly && (
          <span className="ml-auto h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            Lecture seule · univers non attribué
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
              <th scope="col" className="py-1 pr-2">Marque</th>
              <th scope="col" className="py-1 px-2 text-right">N-1</th>
              <th scope="col" className="py-1 px-2 text-right">Budget</th>
              <th scope="col" className="py-1 px-2">Commentaire <span className="normal-case font-normal">(tous magasins)</span></th>
              <th scope="col" className="py-1 pl-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {marques.map(m => <MarqueRow key={m.id} budgetId={budgetId} marque={m} magasin={magasin} user={user} siblings={marques} readOnly={readOnly} />)}
            {marques.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-xs text-gray-500 dark:text-neutral-400">Aucune marque dans ce segment.</td></tr>
            )}
          </tbody>
          {marques.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-neutral-700 text-sm font-semibold text-gray-900 dark:text-white">
                <td className="py-1.5 pr-2">Total</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{formatBudget(n1)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums pr-4">{formatBudget(saisie)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!readOnly && <form onSubmit={add} className="flex items-center gap-2 pt-1">
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nouvelle marque"
          aria-label={`Ajouter une marque à ${seg.univers}${seg.nom ? ` › ${seg.nom}` : ''}`} className={`${CELL_INPUT} max-w-xs uppercase`} />
        <button type="submit" disabled={busy || !nom.trim()}
          className="h-8 px-3 rounded-lg border text-xs font-semibold text-gray-700 border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800">
          Ajouter la marque
        </button>
        {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      </form>}
    </div>
  )
}
