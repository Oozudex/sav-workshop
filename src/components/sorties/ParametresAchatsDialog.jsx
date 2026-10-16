// Paramètres des Statistiques Achats (engrenage de la page), communs à tout le groupe et réglés par les
// acheteurs et la direction. Pour l'instant : semaine de début de chaque saison (AH / PE), utilisée par le
// graphique de saison sous le tableau d'une semaine.
import { useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal } from '../admin/ui'
import { SAISON_DEBUT, SAISON_NOMS, isoWeek, saisonDe, saisonDebutValide, semaineLabel, weeksInYear } from '../../lib/sorties'
import { saveParametresAchats } from '../../lib/sortiesStore'

const SELECT = 'w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1)
const sLabel = w => `S${String(w).padStart(2, '0')}`

export function GearIcon({ className = 'h-4 w-4' }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

// Fin d'une saison : la semaine avant le début de l'autre
function finDe(d, saison) {
  const autre = d[saison === 'AH' ? 'PE' : 'AH']
  return autre > 1 ? sLabel(autre - 1) : 'S52'
}

export default function ParametresAchatsDialog({ parametres, user, onClose, onSaved }) {
  const [saisons, setSaisons] = useState(parametres.saisons)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ok = saisonDebutValide(saisons)
  const changed = saisons.AH !== parametres.saisons.AH || saisons.PE !== parametres.saisons.PE
  const now = isoWeek()
  const cur = ok ? saisonDe(now, saisons) : null
  const dateLabel = parametres.updatedAt?.toDate?.()?.toLocaleDateString('fr-FR')

  async function submit() {
    setBusy(true); setError('')
    try { await saveParametresAchats({ saisons }, user); onSaved?.(); onClose() } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Paramètres" subtitle="Statistiques Achats · communs à tout le groupe" onClose={onClose}
      footer={<>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={submit} disabled={busy || !ok || !changed} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Début des saisons</h3>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            Semaine où commence chaque saison. Le graphique sous le tableau d’une semaine part du début de sa saison.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['AH', 'PE'].map(k => (
            <Field key={k} label={`${SAISON_NOMS[k]} (${k})`}>
              <select value={saisons[k]} onChange={e => setSaisons(s => ({ ...s, [k]: Number(e.target.value) }))} className={SELECT}>
                {WEEKS.map(w => <option key={w} value={w}>{sLabel(w)}{w === SAISON_DEBUT[k] ? ' (par défaut)' : ''}</option>)}
              </select>
            </Field>
          ))}
        </div>
        {ok ? (
          <ul className="text-xs text-gray-600 dark:text-neutral-300 space-y-0.5">
            {['AH', 'PE'].map(k => (
              <li key={k}><strong>{k}</strong> : de la {sLabel(saisons[k])} à la {finDe(saisons, k)}{saisons[k] > saisons[k === 'AH' ? 'PE' : 'AH'] ? ' (jusqu’à l’année suivante)' : ''}</li>
            ))}
            <li className="text-gray-500 dark:text-neutral-400">
              Cette semaine ({semaineLabel(now.annee, now.semaine)}) est en {SAISON_NOMS[cur.saison]}, commencée en {semaineLabel(cur.debut.annee, cur.debut.semaine)}.
            </li>
          </ul>
        ) : <p role="alert" className="text-xs text-red-600 dark:text-red-400">Les deux saisons ne peuvent pas commencer la même semaine.</p>}
        {(saisons.AH !== SAISON_DEBUT.AH || saisons.PE !== SAISON_DEBUT.PE) && (
          <button type="button" onClick={() => setSaisons(SAISON_DEBUT)} className="text-xs underline text-gray-500 dark:text-neutral-400">
            Revenir aux valeurs par défaut ({sLabel(SAISON_DEBUT.AH)} / {sLabel(SAISON_DEBUT.PE)})
          </button>
        )}
        {weeksInYear(now.annee) === 53 && (
          <p className="text-[11px] text-gray-500 dark:text-neutral-400">{now.annee} compte 53 semaines : la S53 reste dans la saison en cours.</p>
        )}
      </section>
      {parametres.updatedBy?.nom && (
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">Modifié{dateLabel ? ` le ${dateLabel}` : ''} par {parametres.updatedBy.nom}.</p>
      )}
    </Modal>
  )
}
