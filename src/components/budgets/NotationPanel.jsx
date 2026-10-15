// Notation des fournisseurs d'un budget : pondération commune des 3 critères, puis une fiche par fournisseur
// (pour tout le groupe, déclinaisons regroupées) avec ses notes sur 10, son budget demandé et le budget
// adapté qui en découle. Sans fiche dans ce budget, le fournisseur reprend la plus récente des budgets précédents.
import { useMemo, useState } from 'react'
import { EmptyState } from '../admin/ui'
import {
  CRITERES, NOTE_NEUTRE, canEditUnivers, coefMarque, formatBudget, fournisseurKey, normLabel, notationReglages, toAmount,
} from '../../lib/budgets'
import { saveFiche, saveLien, saveNotationReglages } from '../../lib/budgetsStore'
import { CELL_INPUT } from './SegmentSaisie'
import { TONE } from './tones'

export const formatNote = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('fr-FR'))
export const formatCoef = c => `×${(Math.round(c * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`

// Champ numérique enregistré à la sortie ; min / max : bornes acceptées
function NumInput({ value, onSave, label, min, max, placeholder, className = '' }) {
  const [draft, setDraft] = useState(null)
  const [invalid, setInvalid] = useState(false)
  const shown = value == null ? '' : value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  function commit() {
    if (draft == null) return
    const raw = draft.trim()
    setDraft(null)
    if (raw === shown) return
    const v = raw === '' ? null : toAmount(raw)
    if (raw !== '' && (v == null || (min != null && v < min) || (max != null && v > max))) { setInvalid(true); return }
    setInvalid(false)
    onSave(v)
  }
  return (
    <input inputMode="decimal" aria-label={label} aria-invalid={invalid || undefined} placeholder={placeholder}
      value={draft ?? shown} onFocus={e => { setDraft(shown); e.target.select() }} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); setInvalid(false); e.currentTarget.blur() } }}
      className={`${CELL_INPUT} text-right tabular-nums ${invalid ? '!border-red-400' : ''} ${className}`} />
  )
}

// Explication du calcul (point info demandé par les acheteurs)
export function AdapteInfo({ reglages, defaultOpen = false }) {
  const { amplitude } = notationReglages(reglages)
  return (
    <details open={defaultOpen} className={`rounded-xl border px-4 py-2.5 text-xs border-violet-200 bg-violet-50/50 dark:border-violet-500/30 dark:bg-violet-500/5 text-gray-700 dark:text-neutral-300`}>
      <summary className={`cursor-pointer font-semibold ${TONE.adapte.text}`}>ⓘ Comment est calculé le budget adapté ?</summary>
      <ol className="mt-2 space-y-1.5 list-decimal pl-4">
        <li><strong>Part du N-1.</strong> Dans chaque segment et chaque magasin, le budget groupe (ou la base s’il n’est pas fixé) est partagé entre les marques selon leur N-1. Une marque sans N-1 part de 0.</li>
        <li><strong>Note.</strong> La note de la marque (moyenne pondérée des 3 critères) ajuste sa part : 5/10 ne change rien, 10/10 donne +{amplitude} %, 0/10 donne −{amplitude} %. Une marque non notée compte comme 5/10. On recale ensuite pour que le total du segment reste égal à son budget.</li>
        <li><strong>Budget demandé</strong> (facultatif). Si la marque demande plus que son budget adapté, on comble l’écart à hauteur de sa note (8/10 → 80 % de l’écart), en prenant d’abord le budget non réparti du segment, puis sur les autres marques du segment. Une demande déjà couverte ne change rien.</li>
      </ol>
      <p className="mt-2 text-gray-600 dark:text-neutral-400">
        Exemple : segment à 100 000 €, Nike 60 % du N-1 notée 8/10, Asics 40 % notée 4/10. Après la note : Nike 63 636 €, Asics 36 364 €.
        Nike demande 70 000 € : il manque 6 364 €, on en comble 80 % → Nike 68 727 €, Asics 31 273 €.
        Le budget adapté est une recommandation : il ne modifie ni la base, ni le budget groupe, ni la saisie.
      </p>
    </details>
  )
}

function Reglages({ reglages, user }) {
  const { poids, amplitude } = notationReglages(reglages)
  const [error, setError] = useState('')
  const save = data => saveNotationReglages(data, user).then(() => setError(''), err => setError(err.message))
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Pondération des critères</p>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          Commune à tous les acheteurs{reglages?.updatedBy?.nom ? ` · modifiée par ${reglages.updatedBy.nom}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CRITERES.map(c => (
          <label key={c.key} className="space-y-1" title={c.hint}>
            <span className="block text-[11px] font-semibold text-gray-600 dark:text-neutral-300">{c.label}</span>
            <NumInput value={poids[c.key]} min={0} max={10} label={`Poids ${c.label}`}
              onSave={v => save({ poids: { ...poids, [c.key]: v ?? 1 } })} />
          </label>
        ))}
        <label className="space-y-1" title="Effet d’une note de 10/10 (ou 0/10) sur la part de la marque">
          <span className="block text-[11px] font-semibold text-gray-600 dark:text-neutral-300">Effet de la note (± %)</span>
          <NumInput value={amplitude} min={0} max={100} label="Effet maximal de la note en %"
            onSave={v => save({ amplitude: v ?? 20 })} />
        </label>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">
        Poids 2 = le critère compte double. Avec ±{amplitude} %, une marque notée 10/10 a un coefficient de {formatCoef(coefMarque(10, amplitude))}, notée 0/10 de {formatCoef(coefMarque(0, amplitude))}.
      </p>
      {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

const TH = 'py-1.5 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400'

// marques : une entrée par fiche (clé) avec ses univers, N-1, saisie et budget adapté
// Fournisseur d'une déclinaison : nom saisi (liste des fournisseurs proposée). Vide : automatique ;
// son propre nom : marque seule.
function LienInput({ decl, listId, onSave }) {
  const [draft, setDraft] = useState(null)
  const current = decl.fournisseur
  function commit() {
    if (draft == null) return
    const v = normLabel(draft.trim())
    setDraft(null)
    if (v === current) return
    if (!v || v === decl.auto) onSave(null)
    else if (v === normLabel(decl.nom)) onSave('')
    else onSave(v)
  }
  return (
    <input list={listId} aria-label={`Fournisseur de ${decl.nom}`} value={draft ?? current} placeholder={decl.auto}
      onFocus={e => { setDraft(current); e.target.select() }} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() } }}
      className={`${CELL_INPUT} uppercase`} />
  )
}

const sumMap = map => Object.values(map || {}).reduce((t, v) => t + (typeof v === 'number' ? v : 0), 0)

// Une ligne par fournisseur (ses déclinaisons regroupées : « ADIDAS FEMME », « ADIDAS OFFRE TERRAIN »…)
export default function NotationPanel({ budget, segments, brandsBySeg, adapte, fiche, fournisseur, liens, reglages, keep, user }) {
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const needle = normLabel(q)

  const fournisseurs = useMemo(() => {
    const m = new Map()
    for (const s of segments) {
      for (const b of brandsBySeg.get(s.id) || []) {
        if (b.orphan) continue
        const f = fournisseur(b.nom)
        if (!m.has(f.key)) m.set(f.key, { key: f.key, nom: f.nom, univers: new Set(), n1: 0, saisie: 0, decl: new Map() })
        const e = m.get(f.key)
        e.univers.add(b.univers)
        e.n1 += sumMap(b.line?.n1)
        e.saisie += sumMap(b.line?.saisie)
        const n = normLabel(b.nom)
        if (!e.decl.has(n)) e.decl.set(n, { nom: n, key: fournisseurKey(n), fournisseur: f.nom, auto: f.auto, univers: new Set(), n1: 0 })
        const d = e.decl.get(n)
        d.univers.add(b.univers)
        d.n1 += sumMap(b.line?.n1)
      }
    }
    return [...m.values()].map(e => ({
      ...e, univers: [...e.univers].sort(),
      decl: [...e.decl.values()].map(d => ({ ...d, univers: [...d.univers].sort() })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [segments, brandsBySeg, fournisseur])

  const shown = fournisseurs.filter(f => f.univers.some(keep)
    && (!needle || normLabel(f.nom).includes(needle) || f.decl.some(d => d.nom.includes(needle))))
  const run = p => p.then(() => setError(''), err => setError(err.message))
  const toggle = k => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const listId = `fournisseurs-${budget.id}`
  const nbLiens = Object.keys(liens || {}).length

  return (
    <div className="space-y-3">
      <Reglages reglages={reglages} user={user} />
      <AdapteInfo reglages={reglages} />
      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mr-auto">Notes des fournisseurs <span className="font-normal text-gray-500 dark:text-neutral-400">· {shown.length}</span></p>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une marque…"
            aria-label="Rechercher une marque" className="Input h-9 text-sm sm:max-w-xs" />
        </div>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          Notes sur 10, une fiche par fournisseur pour tout le groupe : modifiable par la direction et par les acheteurs qui ont une de ses marques dans leurs univers.
          Les déclinaisons (« ADIDAS FEMME », « ADIDAS OFFRE TERRAIN »…) sont regroupées sous leur fournisseur et partagent ses notes et son budget demandé ;
          déplie une ligne pour changer un regroupement{nbLiens ? ` (${nbLiens} lien${nbLiens > 1 ? 's' : ''} choisi${nbLiens > 1 ? 's' : ''} à la main)` : ''}.
          Les notes se reportent d’un budget à l’autre : sans note dans ce budget, le fournisseur reprend la dernière saisie.
        </p>
        {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        <datalist id={listId}>{fournisseurs.map(f => <option key={f.key} value={f.nom} />)}</datalist>
        {shown.length === 0 ? (
          <EmptyState title="Aucune marque" text={needle ? `Aucune marque ne correspond à « ${q.trim()} ».` : 'Aucune marque pour ce filtre.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} pl-0 min-w-[12rem]`}>Fournisseur</th>
                  <th scope="col" className={`${TH} text-right ${TONE.n1.head}`}>N-1</th>
                  {CRITERES.map(c => <th key={c.key} scope="col" className={`${TH} text-right min-w-[5rem]`} title={c.hint}>{c.label}</th>)}
                  <th scope="col" className={`${TH} text-right`}>Note</th>
                  <th scope="col" className={`${TH} text-right min-w-[8rem]`}>Budget demandé</th>
                  <th scope="col" className={`${TH} text-right ${TONE.adapte.head}`}>Adapté</th>
                  <th scope="col" className={`${TH} text-right`}>Saisi</th>
                </tr>
              </thead>
              {shown.map(m => {
                const f = fiche(m.key)
                const info = adapte.get(m.key)
                const editable = m.univers.some(u => canEditUnivers(user, u))
                const ident = { nom: m.nom, univers: m.univers }
                // Première modification d'une fiche reprise d'un budget précédent : on recopie ses notes et sa demande
                const herite = f?.herite ? { notes: { ...(f.notes || {}) }, ...(f.demande != null ? { demande: f.demande } : {}) } : {}
                const saveNote = (k, v) => run(saveFiche(budget.id, m.key, ident, { ...herite, notes: { ...(herite.notes || {}), [k]: v } }, user))
                const saveDemande = v => run(saveFiche(budget.id, m.key, ident, { ...herite, demande: v }, user))
                const ecart = info ? m.saisie - info.total : 0
                const isOpen = open.has(m.key) || (!!needle && m.decl.length > 1 && !normLabel(m.nom).includes(needle))
                const td = 'border-t border-gray-100 dark:border-neutral-800 py-1.5 px-1.5'
                return (
                  <tbody key={m.key}>
                    <tr className="align-middle">
                      <th scope="row" className={`${td} !pl-0 pr-2`}>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{m.nom}</span>
                        {f?.herite && <span className="ml-1.5 h-4 px-1 inline-flex items-center rounded text-[9px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">repris de {f.source}</span>}
                        <button type="button" onClick={() => toggle(m.key)} aria-expanded={isOpen}
                          className="block text-[10px] font-semibold text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white">
                          {isOpen ? '▾' : '▸'} {m.decl.length > 1 ? `${m.decl.length} déclinaisons` : 'Regrouper…'}
                        </button>
                      </th>
                      <td className={`${td} text-right text-sm tabular-nums whitespace-nowrap ${TONE.n1.text}`}>{formatBudget(m.n1)}</td>
                      {CRITERES.map(c => (
                        <td key={c.key} className={td}>
                          {editable ? (
                            <NumInput value={f?.notes?.[c.key]} min={0} max={10} placeholder="—" label={`${c.label} ${m.nom}`}
                              onSave={v => saveNote(c.key, v)} />
                          ) : <p className="text-right text-sm tabular-nums text-gray-900 dark:text-white">{formatNote(f?.notes?.[c.key])}</p>}
                        </td>
                      ))}
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{info?.note == null ? '—' : `${formatNote(info.note)}/10`}</span>
                        <span className={`block text-[10px] tabular-nums ${info?.note == null ? 'text-gray-400' : info.note >= NOTE_NEUTRE ? TONE.engage.text : TONE.depassement.text}`}>
                          {formatCoef(info?.coef ?? 1)}
                        </span>
                      </td>
                      <td className={td}>
                        {editable ? (
                          <NumInput value={f?.demande} min={0} placeholder="—" label={`Budget demandé par ${m.nom}`} onSave={saveDemande} />
                        ) : <p className="text-right text-sm tabular-nums text-gray-900 dark:text-white">{f?.demande ? formatBudget(f.demande) : '—'}</p>}
                      </td>
                      <td className={`${td} text-right text-sm font-semibold tabular-nums whitespace-nowrap ${TONE.adapte.text}`}>
                        {formatBudget(info?.total)}
                        {info?.demande != null && (
                          <span className={`block text-[10px] font-normal ${info.total + 0.5 >= info.demande ? TONE.engage.text : 'text-gray-500 dark:text-neutral-400'}`}>
                            {info.total + 0.5 >= info.demande ? 'demande couverte' : `${formatBudget(info.demande - info.total)} sous la demande`}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right text-sm tabular-nums whitespace-nowrap text-gray-900 dark:text-white`}>
                        {formatBudget(m.saisie)}
                        {info && m.saisie > 0 && Math.round(ecart) !== 0 && (
                          <span className={`block text-[10px] ${ecart > 0 ? TONE.depassement.text : 'text-gray-500 dark:text-neutral-400'}`}>
                            {ecart > 0 ? '+' : '−'}{formatBudget(Math.abs(ecart))} vs adapté
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={CRITERES.length + 6} className="pb-3 pl-4">
                          <div className="sticky left-0 max-w-[48rem] rounded-lg bg-gray-50 dark:bg-neutral-800/40 p-2 space-y-1">
                            <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                              Fournisseur de chaque déclinaison : choisis ou tape un nom pour la lier, tape son propre nom pour la séparer, vide le champ pour revenir au regroupement automatique.
                            </p>
                            {m.decl.map(d => {
                              const canLink = d.univers.some(u => canEditUnivers(user, u))
                              return (
                                <div key={d.nom} className="grid grid-cols-[minmax(0,16rem)_7rem_12rem_auto] items-center gap-x-3 py-0.5">
                                  <span className="min-w-0 text-xs font-medium text-gray-900 dark:text-white">{d.nom}
                                    <span className="block truncate text-[10px] font-normal text-gray-500 dark:text-neutral-400" title={d.univers.join(', ')}>{d.univers.join(' · ')}</span>
                                  </span>
                                  <span className={`text-right text-xs tabular-nums whitespace-nowrap ${TONE.n1.text}`}>N-1 {formatBudget(d.n1)}</span>
                                  {canLink ? (
                                    <LienInput decl={d} listId={listId} onSave={v => run(saveLien(d.key, v, user))} />
                                  ) : <span className="text-xs text-gray-700 dark:text-neutral-300">→ {d.fournisseur}</span>}
                                  {typeof liens?.[d.key] === 'string' && (
                                    <span className="text-[10px] text-gray-500 dark:text-neutral-400">choisi à la main{canLink && <> · <button type="button" className="underline hover:text-gray-900 dark:hover:text-white" onClick={() => run(saveLien(d.key, null, user))}>automatique</button></>}</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
