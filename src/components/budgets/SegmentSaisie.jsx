// Saisie d'un segment pour un magasin (vue Magasin › Univers › Segment) : budget de base, puis par marque
// le N-1 et le budget à remplir. Le commentaire d'une marque est commun à tous les magasins.
// readOnly : univers non attribué à l'acheteur.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '../admin/ui'
import { formatBudget, formatQte, hasValue, normLabel, objectif, toAmount } from '../../lib/budgets'
import { addBrand, deleteLine, setCommentaire, setEngage, setQuantite, setSaisie } from '../../lib/budgetsStore'
import { EngageSwitch, TONE, lineFilled, saisieTone } from './tones'

export const CELL_INPUT = 'w-full h-8 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20'

const inputValue = v => (typeof v === 'number' ? String(v).replace('.', ',') : '')

// Entrée : enregistre et passe au champ suivant
function focusNext(el) {
  const all = [...document.querySelectorAll('input[data-budget-saisie]')]
  all[all.indexOf(el) + 1]?.focus()
}

export function AmountInput({ value, onSave, label, placeholder, className = '' }) {
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
    <input data-budget-saisie inputMode="decimal" aria-label={label} aria-invalid={invalid || undefined} placeholder={placeholder}
      value={draft ?? inputValue(value)}
      onFocus={e => { setDraft(inputValue(value)); e.target.select() }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; commit(); focusNext(el) }
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      className={`${CELL_INPUT} text-right tabular-nums ${invalid ? '!border-red-400' : ''} ${className}`} />
  )
}

// Interrupteur Engagé / Prévisionnel d'une marque : une commande vaut pour tous les magasins
export function BrandEngage({ budgetId, brand, user, readOnly, run }) {
  const on = brand.line?.engage === true
  const filled = lineFilled(brand.line)
  if (readOnly) return filled ? <span className={`text-[11px] font-semibold ${on ? TONE.engage.text : TONE.previsionnel.text}`}>{on ? 'Engagé' : 'Prévisionnel'}</span> : null
  return <EngageSwitch on={on} withText disabled={!filled && !on} label={`${brand.nom} engagé (tous magasins)`}
    onChange={v => run(setEngage(budgetId, brand, v, user))} />
}

// Note de la marque (coefficient) et budget demandé, sous son nom
export function BrandNote({ info, brand }) {
  if (!info || (info.note == null && info.demande == null)) return null
  const r = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR')
  return (
    <span className={`block mt-0.5 text-[10px] font-normal ${TONE.adapte.text}`}
      title={`Note pondérée ${info.note == null ? 'non notée' : `${r(info.note)}/10`} · coefficient ×${(Math.round(info.coef * 100) / 100).toLocaleString('fr-FR')}${info.demande != null ? ` · demande ${formatBudget(info.demande)}` : ''}`}>
      {brand && info.nom !== normLabel(brand.nom) && `${info.nom} · `}{info.note != null && `Note ${r(info.note)}/10`}{info.note != null && info.demande != null && ' · '}{info.demande != null && `Demande ${formatBudget(info.demande)}`}
    </span>
  )
}

export const brandInfo = (adapte, brand) => adapte?.marques.get(adapte.keyOf.get(brand.id))

// Case d'une marque pour un magasin (tableau marques × magasins) : montant, quantité (vert si la marque
// est engagée, ambre si prévisionnelle), rappel du N-1 et budget adapté
export function SaisieCell({ budgetId, brand, mag, user, readOnly, run, adapte }) {
  const line = brand.line
  const tone = saisieTone(line, mag.id)
  const engage = line?.engage === true
  const filled = hasValue(line?.saisie, mag.id) || hasValue(line?.quantite, mag.id)
  const n1 = [hasValue(line?.n1, mag.id) && formatBudget(line.n1[mag.id]), hasValue(line?.quantiteN1, mag.id) && formatQte(line.quantiteN1[mag.id])]
    .filter(Boolean).join(' · ')
  const where = `${brand.nom} – ${mag.nom}`
  return <>
    {readOnly ? (
      <div className={`text-right tabular-nums ${!filled ? 'text-gray-400' : engage ? TONE.engage.text : TONE.previsionnel.text}`}>
        <p className="h-8 leading-8 text-sm">{hasValue(line?.saisie, mag.id) ? formatBudget(line.saisie[mag.id]) : '—'}</p>
        {hasValue(line?.quantite, mag.id) && <p className="text-[11px]">{formatQte(line.quantite[mag.id])}</p>}
      </div>
    ) : <>
      <AmountInput value={line?.saisie?.[mag.id]} label={`Budget ${where}`} className={tone}
        onSave={v => run(setSaisie(budgetId, brand, mag.id, v, user))} />
      <AmountInput value={line?.quantite?.[mag.id]} label={`Quantité ${where}`} placeholder="Qté" className={`mt-1 !h-7 !text-xs ${tone}`}
        onSave={v => run(setQuantite(budgetId, brand, mag.id, v, user))} />
    </>}
    <p className={`mt-0.5 text-right text-[10px] tabular-nums ${TONE.n1.head}`}>N-1 {n1 || '—'}</p>
    {adapte != null && !brand.orphan && <p className={`text-right text-[10px] tabular-nums ${TONE.adapte.text}`}>Adapté {formatBudget(adapte)}</p>}
  </>
}

export function TextInput({ value, onSave, label, placeholder }) {
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

// Reste à répartir : objectif (budget groupe, sinon base) moins saisi ; vert = tout est réparti, rouge = dépassement
// Une base négative (retours) ne laisse rien à répartir
export function Reste({ objectif, saisie, short = false }) {
  const reste = Math.max(objectif, 0) - saisie
  if (objectif <= 0 && !saisie) return <span className="text-gray-400 dark:text-neutral-500">—</span>
  const cls = Math.round(reste) === 0 ? TONE.ok.text
    : reste < 0 ? TONE.depassement.text : 'text-gray-700 dark:text-neutral-300'
  const text = short ? (reste < 0 ? `+${formatBudget(-reste)}` : formatBudget(reste))
    : reste < 0 ? `Dépassement ${formatBudget(-reste)}` : `Reste ${formatBudget(reste)}`
  return <span className={`font-semibold tabular-nums ${cls}`}>{text}</span>
}

// Bulle d'explication : s'ouvre au survol, au focus ou au clic (mobile), affichée par-dessus le tableau
// (portail : pas coupée par le défilement horizontal)
function Tip({ text, children, className, label }) {
  const [pos, setPos] = useState(null)
  const show = e => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ left: Math.min(r.left, window.innerWidth - 272), top: r.bottom + 6 })
  }
  return <>
    <button type="button" aria-label={label} aria-expanded={!!pos} className={className}
      onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}
      onClick={e => (pos ? setPos(null) : show(e))}>
      {children}
    </button>
    {pos && createPortal(
      <span role="tooltip" style={{ left: Math.max(pos.left, 8), top: pos.top }}
        className="fixed z-50 w-64 rounded-lg px-3 py-2 text-xs font-normal normal-case leading-snug shadow-lg bg-gray-900 text-white dark:bg-neutral-700">
        {text}
      </span>, document.body)}
  </>
}

export function OrphanTag() {
  return (
    <Tip label="Marque retirée : explication" text="Marque retirée de la liste (onglet Marques) mais qui a encore des montants dans ce budget (N-1 ou saisie). Elle reste affichée pour ne rien perdre ; elle n’a pas de budget adapté. La corbeille au bout de la ligne la supprime de ce budget."
      className="ml-1.5 h-4 px-1 inline-flex items-center rounded text-[9px] font-semibold uppercase bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 cursor-help">
      retirée
    </Tip>
  )
}

// Ajout rapide d'une marque à la liste (segment courant)
export function AddBrandForm({ seg, brands, user }) {
  const [nom, setNom] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function add(e) {
    e.preventDefault()
    const v = nom.trim().toUpperCase()
    if (!v) return
    if (brands.some(b => normLabel(b.nom) === normLabel(v))) return setError(`« ${v} » existe déjà dans ce segment.`)
    setBusy(true); setError('')
    try { await addBrand(seg, v, user); setNom('') } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <form onSubmit={add} className="flex flex-wrap items-center gap-2 pt-1">
      <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nouvelle marque"
        aria-label={`Ajouter une marque à ${seg.univers}${seg.nom ? ` › ${seg.nom}` : ''}`} className={`${CELL_INPUT} max-w-xs uppercase`} />
      <button type="submit" disabled={busy || !nom.trim()}
        className="h-8 px-3 rounded-lg border text-xs font-semibold text-gray-700 border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800">
        Ajouter la marque
      </button>
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}

export default function SegmentSaisie({ budgetId, seg, magasin, cell, hasGroupe, adapte, brands, user, readOnly = false }) {
  const [error, setError] = useState('')
  const run = p => p.catch(err => setError(err.message))
  const id = magasin.id
  const sumOf = key => brands.reduce((t, b) => t + (b.line?.[key]?.[id] || 0), 0)
  const n1 = sumOf('n1'), saisie = sumOf('saisie'), qte = sumOf('quantite'), qteN1 = sumOf('quantiteN1')
  const engage = brands.reduce((t, b) => t + (b.line?.engage === true ? b.line?.saisie?.[id] || 0 : 0), 0)

  function removeOrphan(b) {
    if (!confirm(`Supprimer « ${b.nom} » de ce budget ? Son N-1 et sa saisie sont supprimés pour tous les magasins.`)) return
    run(deleteLine(budgetId, b.id))
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-neutral-300">
        <span className="font-semibold text-gray-900 dark:text-white">{magasin.nom} · {seg.univers}{seg.nom ? ` › ${seg.nom}` : ''}</span>
        <span className={TONE.base.text}>Base <strong className="tabular-nums">{formatBudget(cell.base)}</strong></span>
        {hasGroupe && <span className={TONE.groupe.text}>Groupe <strong className="tabular-nums">{formatBudget(cell.groupe)}</strong></span>}
        <span>Saisi <strong className="tabular-nums">{formatBudget(saisie)}</strong></span>
        <span className={TONE.engage.text}>Engagé <strong className="tabular-nums">{formatBudget(engage)}</strong></span>
        <span className={TONE.previsionnel.text}>Prévisionnel <strong className="tabular-nums">{formatBudget(saisie - engage)}</strong></span>
        <Reste objectif={objectif(cell, hasGroupe)} saisie={saisie} />
        {readOnly && (
          <span className="ml-auto h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            Lecture seule · non attribué
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
              <th scope="col" className="py-1 pr-2">Marque</th>
              <th scope="col" className={`py-1 px-2 text-right ${TONE.n1.head}`}>N-1</th>
              <th scope="col" className={`py-1 px-2 text-right ${TONE.adapte.head}`}>Adapté</th>
              <th scope="col" className="py-1 px-2 text-right">Budget</th>
              <th scope="col" className="py-1 px-2 text-right">Quantité</th>
              <th scope="col" className="py-1 px-2">Statut <span className="normal-case font-normal">(tous magasins)</span></th>
              <th scope="col" className="py-1 px-2">Commentaire <span className="normal-case font-normal">(tous magasins)</span></th>
              <th scope="col" className="py-1 pl-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {brands.map(b => {
              const line = b.line
              const tone = saisieTone(line, id)
              const on = line?.engage === true
              const filled = hasValue(line?.saisie, id) || hasValue(line?.quantite, id)
              const where = `${b.nom} – ${magasin.nom}`
              const textTone = !filled ? 'text-gray-400' : on ? TONE.engage.text : TONE.previsionnel.text
              return (
                <tr key={b.id} className="border-t border-gray-100 dark:border-neutral-800 align-middle">
                  <th scope="row" className="py-1.5 pr-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {b.nom}{b.orphan && <OrphanTag />}
                    <BrandNote info={brandInfo(adapte, b)} brand={b} />
                  </th>
                  <td className={`py-1.5 px-2 text-right text-sm tabular-nums whitespace-nowrap ${TONE.n1.text}`}>
                    {hasValue(line?.n1, id) ? formatBudget(line.n1[id]) : '—'}
                    {hasValue(line?.quantiteN1, id) && <span className="block text-[11px]">{formatQte(line.quantiteN1[id])}</span>}
                  </td>
                  <td className={`py-1.5 px-2 text-right text-sm tabular-nums whitespace-nowrap ${TONE.adapte.text}`}>
                    {b.orphan ? '—' : formatBudget(adapte?.byBrand.get(b.id)?.[id])}
                  </td>
                  {readOnly ? <>
                    <td className={`py-1.5 px-2 w-32 text-right text-sm tabular-nums ${textTone}`}>
                      {hasValue(line?.saisie, id) ? formatBudget(line.saisie[id]) : '—'}
                    </td>
                    <td className={`py-1.5 px-2 w-24 text-right text-sm tabular-nums ${textTone}`}>
                      {hasValue(line?.quantite, id) ? formatQte(line.quantite[id]) : '—'}
                    </td>
                    <td className="py-1.5 px-2"><BrandEngage brand={b} readOnly /></td>
                    <td className="py-1.5 px-2 min-w-[12rem] text-sm text-gray-600 dark:text-neutral-300">{line?.commentaire}</td>
                    <td />
                  </> : <>
                    <td className="py-1.5 px-2 w-32">
                      <AmountInput value={line?.saisie?.[id]} label={`Budget ${where}`} className={tone}
                        onSave={v => run(setSaisie(budgetId, b, id, v, user))} />
                    </td>
                    <td className="py-1.5 px-2 w-24">
                      <AmountInput value={line?.quantite?.[id]} label={`Quantité ${where}`} placeholder="Qté" className={tone}
                        onSave={v => run(setQuantite(budgetId, b, id, v, user))} />
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <BrandEngage budgetId={budgetId} brand={b} user={user} run={run} />
                    </td>
                    <td className="py-1.5 px-2 min-w-[12rem]">
                      <TextInput value={line?.commentaire} label={`Commentaire ${b.nom}`} placeholder="Commentaire"
                        onSave={v => run(setCommentaire(budgetId, b, v, user))} />
                    </td>
                    <td className="py-1.5 pl-1 text-right">
                      {b.orphan && <IconButton icon="delete" danger label={`Supprimer ${b.nom} de ce budget`} onClick={() => removeOrphan(b)} />}
                    </td>
                  </>}
                </tr>
              )
            })}
            {brands.length === 0 && (
              <tr><td colSpan={8} className="py-3 text-xs text-gray-500 dark:text-neutral-400">Aucune marque dans ce segment : ajoute-les dans l’onglet Marques des budgets.</td></tr>
            )}
          </tbody>
          {brands.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-neutral-700 text-sm font-semibold text-gray-900 dark:text-white">
                <td className="py-1.5 pr-2">Total</td>
                <td className={`py-1.5 px-2 text-right tabular-nums ${TONE.n1.text}`}>
                  {formatBudget(n1)}{qteN1 > 0 && <span className="block text-[11px] font-normal">{formatQte(qteN1)}</span>}
                </td>
                <td />
                <td className="py-1.5 px-2 text-right tabular-nums pr-4">{formatBudget(saisie)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums pr-4">{qte > 0 ? formatQte(qte) : ''}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!readOnly && <AddBrandForm seg={seg} brands={brands} user={user} />}
    </div>
  )
}
