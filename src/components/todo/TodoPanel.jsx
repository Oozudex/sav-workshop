// Liste des tâches d'un rayon : mot du soir, ajout rapide, tâches à faire, tâches terminées.
// compact : version de l'accueil (tâches terminées aujourd'hui seulement).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaff } from '../../lib/useStaff'
import { bikeRain, confetti, promoRain } from '../../lib/celebrate'
import TigerScreen from './TigerScreen'
import { classement, fmtJour, lundi, motRecent, sortTodos, tigreDeLaSemaine, toMs, ymd } from '../../lib/todos'

const AUTO_BADGES = {
  op_debut:   { label: 'Début d’OP', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  op_fin:     { label: 'Fin d’OP', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  atelier:    { label: 'Atelier', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  recurrente: { label: '🔁 Récurrente', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' },
  transfert:  { label: 'Transfert', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
}

const selectCls = 'h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-700 min-w-0'

// Tâche automatique : page à ouvrir (le ticket à relancer, la fiche de l'OP)
function lienAuto(t) {
  if (!t.auto?.refId) return null
  if (t.auto.type === 'atelier') return { to: `/tickets?open=${encodeURIComponent(t.auto.refId)}`, label: 'Ouvrir le ticket' }
  if (t.auto.type === 'op_debut' || t.auto.type === 'op_fin') return { to: `/operations/${encodeURIComponent(t.auto.refId)}`, label: 'Ouvrir l’OP' }
  if (t.auto.type === 'transfert') return { to: '/transfert', label: 'Ouvrir les transferts' }
  return null
}

function echeanceLabel(t, today) {
  if (!t.echeance || t.auto?.type === 'recurrente') return null
  const prefix = t.auto?.type === 'op_debut' ? 'Début' : t.auto?.type === 'op_fin' ? 'Fin' : 'Pour'
  const late = t.echeance < today
  const label = t.echeance === today ? `${prefix} aujourd’hui` : `${prefix} le ${fmtJour(t.echeance)}`
  return { label, late }
}

/* ── Une tâche ── */
function TodoItem({ t, today, staff, onToggle, onAssign, onRemove }) {
  const navigate = useNavigate()
  const [asking, setAsking] = useState(null) // position du clic, le temps de choisir « qui l'a fait »
  const badge = t.auto && AUTO_BADGES[t.auto.type]
  const ech = echeanceLabel(t, today)
  const lien = !t.fait && lienAuto(t)
  return (
    <li className="group flex items-start gap-2.5 py-2">
      <button type="button" role="checkbox" aria-checked={!!t.fait}
        onClick={e => {
          // Tâche non assignée : on demande qui l'a faite (pour le tigre de la semaine)
          if (!t.fait && !t.assigneA && staff.length) setAsking(asking ? null : { clientX: e.clientX, clientY: e.clientY })
          else onToggle(t, e)
        }}
        aria-label={t.fait ? `Remettre « ${t.titre} » à faire` : `Terminer « ${t.titre} »`}
        className={['mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors',
          t.fait ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-neutral-600 hover:border-emerald-500'].join(' ')}>
        {t.fait && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        {lien ? (
          // Un clic sur la tâche ouvre directement le ticket à relancer (ou l'OP)
          <button type="button" onClick={() => navigate(lien.to)} title={lien.label}
            className="group/lien text-left text-sm leading-snug break-words text-gray-900 dark:text-neutral-100 hover:text-blue-700 dark:hover:text-blue-300">
            <span className="underline decoration-dotted decoration-gray-300 underline-offset-2 group-hover/lien:decoration-current dark:decoration-neutral-600">{t.titre}</span>
            <span className="ml-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">{lien.label} →</span>
          </button>
        ) : (
          <p className={`text-sm leading-snug break-words ${t.fait ? 'line-through text-gray-400 dark:text-neutral-500' : 'text-gray-900 dark:text-neutral-100'}`}>{t.titre}</p>
        )}
        {asking && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1.5">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mr-0.5">Qui l’a fait ?</span>
            {staff.map(s => (
              <button key={s.id} type="button" onClick={() => { setAsking(null); onToggle(t, asking, s.nom) }}
                className="h-6 px-2 rounded-md text-[11px] font-semibold bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-neutral-900 dark:text-emerald-300 dark:border-emerald-500/30">
                {s.nom}
              </button>
            ))}
            <button type="button" onClick={() => { setAsking(null); onToggle(t, asking) }}
              className="h-6 px-2 rounded-md text-[11px] text-gray-500 hover:text-gray-800 dark:text-neutral-400">
              Passer
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
          {ech && !t.fait && <span className={`text-[10px] font-medium ${ech.late ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-neutral-400'}`}>{ech.late ? '⚠ ' : ''}{ech.label}</span>}
          {t.fait ? (
            t.faitPar && <span className="text-[10px] text-gray-400 dark:text-neutral-500">fait par {t.faitPar}</span>
          ) : staff.length > 0 ? (
            <select value={t.assigneA || ''} onChange={e => onAssign(t, e.target.value)} aria-label="Assigner à"
              className={`h-6 px-1.5 rounded-md border text-[10px] font-medium max-w-[9rem] ${t.assigneA
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-dashed border-gray-300 bg-transparent text-gray-400 dark:border-neutral-600 dark:text-neutral-500'}`}>
              <option value="">{t.assigneA ? '— Personne' : '+ Assigner'}</option>
              {staff.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
              {t.assigneA && !staff.some(s => s.nom === t.assigneA) && <option value={t.assigneA}>{t.assigneA}</option>}
            </select>
          ) : t.assigneA && <span className="text-[10px] text-blue-700 dark:text-blue-300">{t.assigneA}</span>}
        </div>
      </div>
      <button type="button" onClick={() => onRemove(t)} aria-label={`Supprimer « ${t.titre} »`} title="Supprimer"
        className="h-6 w-6 shrink-0 grid place-items-center rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 dark:text-neutral-600 dark:hover:text-red-400 dark:hover:bg-red-500/10 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </li>
  )
}

/* ── Mot du soir ── */
function MotDuSoir({ mot, onSave, onVu, compact }) {
  const [writing, setWriting] = useState(false)
  const [texte, setTexte] = useState('')
  const [saving, setSaving] = useState(false)
  // Disparaît dès qu'un collègue l'a lu
  const recent = motRecent(mot) && !mot.vuPar?.length
  const at = toMs(mot?.at)
  const quand = at ? new Date(at).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : ''

  async function publish(e) {
    e.preventDefault()
    if (!texte.trim()) return
    setSaving(true)
    try { await onSave(texte); setWriting(false); setTexte('') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      {recent && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10 p-3">
          <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">🌙 Mot du soir · {quand}</p>
          <p className="mt-1 text-sm text-gray-800 dark:text-neutral-100 whitespace-pre-wrap break-words">{mot.texte}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80">Disparaît une fois lu</span>
            <button type="button" onClick={onVu}
              className="ml-auto h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
              Lu 👍
            </button>
          </div>
        </div>
      )}
      {writing ? (
        <form onSubmit={publish} className="rounded-xl border border-gray-200 dark:border-neutral-700 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400">Un mot pour l’équipe de demain matin</p>
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={compact ? 3 : 4} autoFocus
            placeholder="Ex. Livraison Nakamura à 9 h, le vélo de M. Durand est prêt à rendre…"
            className="Input text-sm resize-y leading-relaxed" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setWriting(false)} className="ml-auto h-8 px-3 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800">Annuler</button>
            <button type="submit" disabled={!texte.trim() || saving}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
              {saving ? '…' : 'Laisser le mot'}
            </button>
          </div>
          {recent && <p className="text-[10px] text-gray-400 dark:text-neutral-500">Il remplacera le mot actuel.</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setWriting(true)}
          className="w-full h-8 rounded-lg border border-dashed border-indigo-300 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
          🌙 Laisser un mot pour l’équipe de demain
        </button>
      )}
    </div>
  )
}

/* ── Panneau complet ── */
export default function TodoPanel({ data, magasinId, rayon, compact = false }) {
  const { todos, mot, today, loading, error } = data
  const staff = useStaff(magasinId, rayon)
  const [titre, setTitre] = useState('')
  const [assigneA, setAssigneA] = useState('')
  const [showDone, setShowDone] = useState(!compact)
  const [tigre, setTigre] = useState(false)

  const aFaire = useMemo(() => sortTodos(todos.filter(t => !t.fait), today), [todos, today])
  const faites = useMemo(() => todos.filter(t => t.fait && (!compact || ymd(new Date(toMs(t.faitAt) || Date.now())) === today))
    .sort((a, b) => toMs(b.faitAt) - toMs(a.faitAt)), [todos, today, compact])

  async function add(e) {
    e.preventDefault()
    if (!titre.trim()) return
    const value = titre
    setTitre('')
    await data.add(value, assigneA)
  }

  // Tâche finie : confettis ; fin d'OP : pluie de promos ; relance atelier : des vélos partout ;
  // dernière tâche de la liste : grand écran « Tié un tigre »
  function toggle(t, e, faitPar) {
    if (!t.fait) {
      if (aFaire.length === 1 && aFaire[0].id === t.id) setTigre(true)
      else if (t.auto?.type === 'op_fin') promoRain()
      else if (t.auto?.type === 'atelier' || t.auto?.type === 'transfert') bikeRain()
      else confetti({ x: e?.clientX, y: e?.clientY })
    }
    data.toggle(t, faitPar)
  }

  // Tigre de la semaine dernière, et classement de la semaine en cours (page complète)
  const tigre7 = useMemo(() => tigreDeLaSemaine(todos, today), [todos, today])
  const semaine = useMemo(() => (compact ? [] : classement(todos, lundi(today), today)), [todos, today, compact])

  function remove(t) {
    if (t.auto && !t.fait && !confirm(`« ${t.titre} » est une tâche automatique. La supprimer quand même ?`)) return
    data.remove(t)
  }

  if (error) return <p className="text-xs text-red-600 dark:text-red-400 py-4">Impossible de charger la liste. Recharge la page.</p>
  if (loading) return <p className="text-xs text-gray-400 dark:text-neutral-500 py-4">Chargement…</p>

  return (
    <div className="space-y-3">
      {tigre && <TigerScreen onClose={() => setTigre(false)} />}
      {tigre7 && (
        <div className="rounded-xl px-3 py-2.5 text-white shadow-sm"
          style={{ background: 'linear-gradient(120deg, #f59e0b, #ea580c 60%, #b91c1c)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">🐯 Tigre de la semaine dernière</p>
          <p className="text-sm font-black leading-snug">
            {tigre7.noms.join(' et ')} <span className="font-semibold text-white/85">· {tigre7.total} tâche{tigre7.total > 1 ? 's' : ''}</span>
          </p>
        </div>
      )}
      {semaine.length > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          <span className="font-semibold text-gray-700 dark:text-neutral-300">Cette semaine :</span>{' '}
          {semaine.slice(0, 5).map((r, i) => `${['🥇', '🥈', '🥉'][i] || '·'} ${r.nom} (${r.total})`).join('  ')}
        </p>
      )}
      <MotDuSoir mot={mot} onSave={data.saveMot} onVu={data.motVu} compact={compact} />

      <form onSubmit={add} className="flex gap-2">
        <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ajouter une tâche…" aria-label="Nouvelle tâche"
          className="Input h-9 text-sm flex-1 min-w-0" />
        {!compact && staff.length > 0 && (
          <select value={assigneA} onChange={e => setAssigneA(e.target.value)} aria-label="Assigner à" className={`${selectCls} !h-9 w-36`}>
            <option value="">Pour qui ?</option>
            {staff.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
          </select>
        )}
        <button type="submit" disabled={!titre.trim()} aria-label="Ajouter la tâche"
          className="h-9 px-3 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-gray-100">
          +
        </button>
      </form>

      {aFaire.length === 0 ? (
        <p className="text-center text-xs text-gray-400 dark:text-neutral-500 py-4">Rien à faire pour l’instant 🎉</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
          {aFaire.map(t => <TodoItem key={t.id} t={t} today={today} staff={staff} onToggle={toggle} onAssign={data.assign} onRemove={remove} />)}
        </ul>
      )}

      {faites.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone(v => !v)}
            className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300">
            {showDone ? '▾' : '▸'} {compact ? 'Terminées aujourd’hui' : 'Terminées (30 derniers jours)'} ({faites.length})
          </button>
          {showDone && (
            <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
              {faites.map(t => <TodoItem key={t.id} t={t} today={today} staff={staff} onToggle={toggle} onAssign={data.assign} onRemove={remove} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
