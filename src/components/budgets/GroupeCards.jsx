// Budget groupe : deux cartes sous les chiffres clés du budget. La direction saisit soit le montant,
// soit l'évolution en % du N-1 total ; l'autre carte se met à jour. Le budget groupe est réparti sur
// chaque univers, segment et magasin au prorata du budget de base (la base ne bouge pas).
import { useState } from 'react'
import { evolution, formatBudget, formatPct, groupeTotal, toAmount } from '../../lib/budgets'
import { setGroupe } from '../../lib/budgetsStore'
import { TONE } from './tones'

const INPUT = 'w-full h-10 px-2 rounded-lg border text-xl font-bold text-right tabular-nums bg-white dark:bg-neutral-950 border-indigo-200 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50'

// « −3 % », « -3,5 », « 2 » → nombre
const parsePct = v => toAmount(String(v).replace(/[%\s]/g, '').replace('−', '-'))
const show = (n, digits) => (n == null ? '' : (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString('fr-FR', { maximumFractionDigits: digits }))

function NumberField({ value, digits, parse, onSave, label, suffix, disabled }) {
  const [draft, setDraft] = useState(null)
  const [invalid, setInvalid] = useState(false)
  function commit() {
    if (draft == null) return
    const raw = draft.trim()
    setDraft(null)
    if (raw === show(value, digits)) return
    const v = raw === '' ? null : parse(raw)
    if (raw !== '' && v == null) { setInvalid(true); return }
    setInvalid(false)
    onSave(v)
  }
  return (
    <div className="relative">
      <input inputMode="decimal" aria-label={label} aria-invalid={invalid || undefined} disabled={disabled}
        value={draft ?? show(value, digits)} placeholder="—"
        onFocus={e => { setDraft(show(value, digits)); e.target.select() }}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(null); setInvalid(false); e.currentTarget.blur() }
        }}
        className={`${INPUT} pr-8 ${invalid ? '!border-red-400' : ''}`} />
      <span aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-indigo-400">{suffix}</span>
    </div>
  )
}

function Card({ label, children, foot }) {
  return (
    <div className={`rounded-2xl border border-t-4 ${TONE.groupe.bar} px-4 py-3 space-y-1.5 bg-indigo-50/40 dark:bg-indigo-500/5 border-gray-200 dark:border-neutral-800`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${TONE.groupe.text}`}>{label}</p>
      {children}
      {foot && <p className="text-[11px] text-gray-600 dark:text-neutral-300">{foot}</p>}
    </div>
  )
}

export default function GroupeCards({ budget, n1Total, baseTotal, canEdit, user }) {
  const [error, setError] = useState('')
  const groupe = budget.groupe
  const total = groupeTotal(groupe, n1Total)
  const pct = groupe?.mode === 'pct' ? groupe.pct : evolution(total, n1Total)
  const vsBase = evolution(total, baseTotal)
  const save = g => setGroupe(budget.id, g, user).then(() => setError(''), err => setError(err.message))
  const when = groupe?.at?.toDate?.()?.toLocaleDateString('fr-FR')

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card label="Budget groupe (montant)"
          foot={total == null ? 'Pas encore fixé par la direction.'
            : `${formatPct(vsBase)} par rapport au budget de base · réparti au prorata de la base`}>
          {canEdit ? (
            <NumberField value={total} digits={0} parse={toAmount} suffix="€" label="Budget groupe en euros"
              onSave={v => save(v == null ? null : { mode: 'montant', montant: v })} />
          ) : (
            <p className={`text-xl font-bold tabular-nums ${TONE.groupe.text}`}>{total == null ? '—' : formatBudget(total)}</p>
          )}
        </Card>
        <Card label="Évolution par rapport au N-1"
          foot={n1Total > 0 ? `N-1 total : ${formatBudget(n1Total)}${pct != null ? ` → ${formatBudget(n1Total * (1 + pct / 100))}` : ''}`
            : 'Pas de N-1 dans ce budget : saisis le montant.'}>
          {canEdit ? (
            <NumberField value={pct} digits={1} parse={parsePct} suffix="%" label="Évolution du budget groupe par rapport au N-1, en %"
              disabled={!(n1Total > 0)} onSave={v => save(v == null ? null : { mode: 'pct', pct: v })} />
          ) : (
            <p className={`text-xl font-bold tabular-nums ${TONE.groupe.text}`}>{formatPct(pct)}</p>
          )}
        </Card>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">
        {groupe && `Fixé ${groupe.mode === 'pct' ? 'en %' : 'en montant'}${groupe.by?.nom ? ` par ${groupe.by.nom}` : ''}${when ? ` le ${when}` : ''}. `}
        {canEdit ? 'Saisis le montant ou le % : l’autre se calcule. Vide le champ pour retirer le budget groupe.' : 'Seule la direction fixe le budget groupe.'}
        {total != null && !(baseTotal > 0) && ' Importe la base pour le répartir sur les univers.'}
      </p>
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
