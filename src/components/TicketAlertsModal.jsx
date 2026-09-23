import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ALERT_RULES, measureRule } from '../lib/ticketStats'
import { useAuth } from '../store/useAuth'

const round = n => Math.round(n)

/** Réglage des seuils d'alerte de l'atelier vélo d'un magasin. */
export default function TicketAlertsModal({ magasinId, magasinNom, tickets, onClose }) {
  const user = useAuth(s => s.user)
  const [rules, setRules] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const ref = doc(db, 'magasins', magasinId, 'alert_settings', 'tickets')

  useEffect(() => {
    getDoc(ref)
      .then(snap => {
        const stored = snap.exists() ? snap.data().rules || {} : {}
        setRules(Object.fromEntries(ALERT_RULES.map(r => [r.key, {
          enabled: !!stored[r.key]?.enabled,
          threshold: stored[r.key]?.threshold ?? r.defaultThreshold,
        }])))
      })
      .catch(e => setError(e.message))
    // Chargé une fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinId])

  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const now = useMemo(() => new Date(), [])

  function update(key, patch) {
    setSaved(false)
    setRules(r => ({ ...r, [key]: { ...r[key], ...patch } }))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const clean = Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, {
        enabled: v.enabled, threshold: Math.max(0, Number(v.threshold) || 0),
      }]))
      await setDoc(ref, { rules: clean, updatedAt: serverTimestamp(), updatedBy: user?.uid || null })
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 pt-[5vh] bg-black/50 backdrop-blur-sm overflow-y-auto"
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Alertes de l'atelier vélo</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
              {magasinNom ? `${magasinNom} · ` : ''}Le directeur du magasin est prévenu (cloche en haut de l'écran) dès qu'un seuil actif est dépassé.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {!rules ? (
          <p className="p-6 text-sm text-gray-400 text-center">{error || 'Chargement…'}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {ALERT_RULES.map(rule => {
              const conf = rules[rule.key]
              const threshold = Math.max(0, Number(conf.threshold) || 0)
              const m = measureRule(rule, tickets, threshold, now)
              const breached = rule.kind === 'duration' ? m.value > 0 : m.value > threshold
              const current = rule.kind === 'duration'
                ? (m.max > 0 ? `plus ancien : ${round(m.max)} j${m.value ? ` · ${m.value} au-delà` : ''}` : 'aucun ticket concerné')
                : `actuellement : ${m.value}`

              return (
                <li key={rule.key} className="px-5 py-3.5 flex items-center gap-4">
                  <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 mt-0.5 shrink-0" checked={conf.enabled}
                      onChange={e => update(rule.key, { enabled: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{rule.label}</span>
                      <span className="block text-xs text-gray-500 dark:text-neutral-400">{rule.help}</span>
                      <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-medium ${
                        conf.enabled && breached ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-neutral-400'}`}>
                        {conf.enabled && (breached ? '⚠ Seuil dépassé · ' : '✓ Dans la limite · ')}{current}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 dark:text-neutral-400 whitespace-nowrap">Plus de</span>
                    <input type="number" min="0" inputMode="numeric"
                      className="Input h-9 !w-20 text-right"
                      value={conf.threshold}
                      disabled={!conf.enabled}
                      aria-label={`Seuil : ${rule.label}`}
                      onChange={e => update(rule.key, { threshold: e.target.value })} />
                    <span className="text-xs text-gray-500 dark:text-neutral-400 w-10">{rule.unit}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          {error && rules && <p className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400 mr-auto">Seuils enregistrés ✓</p>}
          <button onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">
            Fermer
          </button>
          <button onClick={save} disabled={!rules || saving}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
