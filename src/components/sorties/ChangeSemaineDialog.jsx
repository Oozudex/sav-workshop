// Changer la semaine d'un taux de sortie (acheteurs et direction) : quand le fichier a été importé dans la mauvaise semaine,
// on le range dans la bonne (fichier, lignes et N-1 associé suivent la nouvelle semaine).
import { useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice } from '../admin/ui'
import { isoWeek, semaineId, semaineLabel, semaineN1, semaineNom, weeksInYear } from '../../lib/sorties'
import { moveSemaine, useSemaines } from '../../lib/sortiesStore'

const SELECT = 'w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'

export default function ChangeSemaineDialog({ semaine: from, user, onClose, onDone }) {
  const { list } = useSemaines()
  const now = isoWeek().annee
  const [annee, setAnnee] = useState(from.annee)
  const [semaine, setSemaine] = useState(from.semaine)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const max = weeksInYear(annee)
  const s = Math.min(semaine, max)
  const id = semaineId(annee, s)
  const same = id === from.id
  const existing = list.find(x => x.id === id)
  const occupee = !same && !!existing?.fichier
  const p = semaineN1({ annee, semaine: s })
  const annees = [...new Set([now - 2, now - 1, now, now + 1, from.annee])].sort()

  async function submit() {
    setBusy(true); setError('')
    try { onDone(await moveSemaine(from, { annee, semaine: s }, user)) } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title="Changer de semaine" subtitle={`${from.nom} : à utiliser si le fichier a été importé dans la mauvaise semaine`} onClose={onClose}
      footer={<>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={submit} disabled={busy || same || occupee} className={BTN_PRIMARY}>{busy ? 'Déplacement…' : 'Déplacer'}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Année">
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))} className={SELECT}>
            {annees.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Semaine">
          <select value={s} onChange={e => setSemaine(Number(e.target.value))} className={SELECT}>
            {Array.from({ length: max }, (_, i) => i + 1).map(w => <option key={w} value={w}>S{String(w).padStart(2, '0')}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-sm text-gray-900 dark:text-white">Nouveau nom : <strong>{semaineNom(annee, s)}</strong></p>
      <p className="text-xs text-gray-500 dark:text-neutral-400">
        Le fichier importé et ses lignes passent dans cette semaine, qui sera comparée à {semaineLabel(p.annee, p.semaine)}.
        La semaine N-1 de l’ancienne ({semaineLabel(semaineN1(from).annee, semaineN1(from).semaine)}) n’est pas déplacée.
      </p>
      {same && <p className="text-xs text-gray-500 dark:text-neutral-400">C’est la semaine actuelle : choisis-en une autre.</p>}
      {occupee && <Notice notice={{ text: `${existing.nom} a déjà un fichier importé. Supprime-la d’abord si c’est elle qui est fausse.` }} />}
    </Modal>
  )
}
