import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { dismissAlert, useAlerts } from '../store/useAlerts'

const SCOPE_LABELS = { tickets: 'SAV', orders: 'Commandes' }
const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * Bandeau rouge des alertes à traiter, au centre de la Navbar (directeur de magasin, sur ordinateur).
 * Une alerte à la fois ; « Traité » la masque jusqu'à ce qu'un nouvel élément dépasse le seuil.
 */
export default function AlertsStrip() {
  const alerts = useAlerts(s => s.alerts)
  const magasinId = useAuth(s => s.profile?.magasinId)
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  if (!alerts.length || !magasinId) return null
  const i = Math.min(index, alerts.length - 1)
  const a = alerts[i]
  const many = alerts.length > 1

  async function dismiss() {
    setBusy(true)
    try { await dismissAlert(magasinId, a) } finally { setBusy(false) }
  }

  const arrow = (dir, d) => (
    <button type="button" onClick={() => setIndex((i + dir + alerts.length) % alerts.length)}
      aria-label={dir < 0 ? 'Alerte précédente' : 'Alerte suivante'}
      className="h-6 w-5 grid place-items-center rounded text-red-500 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/20">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
    </button>
  )

  return (
    <div role="alert"
      className="w-full max-w-xl h-8 flex items-center rounded-lg border overflow-hidden
                 border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <span className="pl-2.5 pr-1.5 shrink-0" aria-hidden>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </span>
      <button type="button" onClick={() => navigate(`${a.path}?alerte=${a.key}`)}
        title={`${a.label} : ${a.message}. Cliquer pour voir le détail.`}
        className="flex-1 min-w-0 text-left text-xs truncate hover:underline underline-offset-2">
        <span className="font-semibold">{SCOPE_LABELS[a.scope] || 'Alerte'} · </span>{capitalize(a.message)}
      </button>
      {many && (
        <span className="flex items-center shrink-0 pl-1 text-[11px] font-semibold tabular-nums">
          {arrow(-1, 'M15 19l-7-7 7-7')}
          {i + 1}/{alerts.length}
          {arrow(1, 'M9 5l7 7-7 7')}
        </span>
      )}
      <button type="button" onClick={dismiss} disabled={busy}
        title="Marquer comme traitée : l'alerte reviendra si d'autres éléments dépassent le seuil"
        className="h-full shrink-0 ml-1 px-2.5 inline-flex items-center gap-1 border-l text-[11px] font-semibold transition-colors disabled:opacity-50
                   border-red-200 hover:bg-red-100 dark:border-red-500/30 dark:hover:bg-red-500/20">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        Traité
      </button>
    </div>
  )
}
