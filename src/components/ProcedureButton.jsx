// Bouton « Procédure » d'une page (ex. SAV) : ouvre le document de la procédure (Google Drive).
// Le lien est enregistré dans app_settings/{settingId} ; seuls les administrateurs le renseignent.
import { useEffect, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { safeUrl } from '../lib/security'
import { isHttpUrl, normalizeUrl } from '../lib/services'
import { BTN_PRIMARY, BTN_SECONDARY, Field, INVALID, Modal, Notice } from './admin/ui'
import Portal from './Portal'

const DOC_ICON = 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
const EDIT_ICON = 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'

const Svg = ({ d }) => (
  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

function ProcedureModal({ settingId, current, user, onClose }) {
  const [url, setUrl] = useState(current || '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = normalizeUrl(url)
  const invalid = tried && !isHttpUrl(value)

  async function save(e) {
    e.preventDefault()
    setTried(true); setError('')
    if (!isHttpUrl(value)) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'app_settings', settingId), { procedureUrl: value, updatedAt: serverTimestamp(), updatedBy: user?.uid || null })
      onClose()
    } catch (err) { setError(err.message || 'Enregistrement impossible') } finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Retirer le lien de la procédure ? Le bouton disparaîtra pour les magasins.')) return
    setBusy(true)
    try { await deleteDoc(doc(db, 'app_settings', settingId)); onClose() }
    catch (err) { setError(err.message || 'Suppression impossible') } finally { setBusy(false) }
  }

  return (
    <Portal>
      <Modal title="Lien de la procédure" subtitle="Affiché pour tous les magasins" onClose={onClose}
        footer={<>
          {current && <button type="button" onClick={remove} disabled={busy} className={`${BTN_SECONDARY} mr-auto !text-red-600 dark:!text-red-400`}>Retirer le lien</button>}
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
          <button type="submit" form="procedure-form" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>}>
        <form id="procedure-form" onSubmit={save} noValidate className="space-y-3">
          <Field label="Lien (Google Drive)" error={invalid ? 'Lien invalide.' : ''} hint="Pensez à partager le fichier avec les magasins dans Google Drive.">
            <input className={`Input ${invalid ? INVALID : ''}`} type="url" inputMode="url" autoFocus
              value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
          </Field>
          {error && <Notice notice={{ tone: 'error', text: error }} />}
        </form>
      </Modal>
    </Portal>
  )
}

export default function ProcedureButton({ settingId, isAdmin, user }) {
  const [url, setUrl] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'app_settings', settingId),
    snap => setUrl(snap.get('procedureUrl') || ''),
    () => setUrl('')), [settingId])

  const safe = safeUrl(url)
  if (!safe && !isAdmin) return null

  const btn = 'h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors text-gray-700 border-gray-200 hover:bg-gray-50 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800'
  return (
    <>
      {safe ? (
        <span className="inline-flex items-center gap-1">
          <a href={safe} target="_blank" rel="noopener noreferrer" className={btn} title="Ouvrir la procédure (Google Drive)">
            <Svg d={DOC_ICON} /> Procédure
          </a>
          {isAdmin && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Modifier le lien de la procédure" title="Modifier le lien de la procédure"
              className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800">
              <Svg d={EDIT_ICON} />
            </button>
          )}
        </span>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className={`${btn} border-dashed`} title="Ajouter le lien de la procédure (administrateurs)">
          <Svg d={DOC_ICON} /> Ajouter la procédure
        </button>
      )}
      {editing && <ProcedureModal settingId={settingId} current={safe || ''} user={user} onClose={() => setEditing(false)} />}
    </>
  )
}
