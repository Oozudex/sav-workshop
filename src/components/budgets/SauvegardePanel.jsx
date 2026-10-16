// Budgets › sauvegarde automatique sur Google Drive (direction) : chaque nuit à 2 h, une Cloud Function
// exporte les budgets modifiés (même fichier que « Exporter (Excel) ») dans un Drive partagé.
// Réglage et dernier passage : budget_reglages/sauvegardes { dossierId, dernier }.
import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../lib/firebase'
import { dossierDriveId } from '../../lib/drive'
import { BTN_PRIMARY, BTN_SECONDARY, Notice } from '../admin/ui'

// Compte de service des Cloud Functions : à ajouter au Drive partagé (Gestionnaire de contenu)
export const COMPTE_SAUVEGARDE = '288904675566-compute@developer.gserviceaccount.com'

const dateHeure = ts => ts?.toDate?.()?.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) || ''

export default function SauvegardePanel({ user }) {
  const [reglage, setReglage] = useState(undefined)
  const [lien, setLien] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  useEffect(() => onSnapshot(doc(db, 'budget_reglages', 'sauvegardes'),
    s => setReglage(s.exists() ? s.data() : null), () => setReglage(null)), [])

  const dossierId = reglage?.dossierId || null
  const lienId = dossierDriveId(lien)
  const dernier = reglage?.dernier

  async function enregistrer() {
    if (!lienId) return setNotice({ text: 'Lien non reconnu : colle l’adresse du Drive partagé (…/drive/folders/…).' })
    setBusy(true)
    try {
      await setDoc(doc(db, 'budget_reglages', 'sauvegardes'), {
        dossierId: lienId, dossierLien: lien.trim(), updatedAt: serverTimestamp(), updatedBy: { uid: user.uid, nom: user.displayName },
      }, { merge: true })
      setLien(''); setNotice({ tone: 'ok', text: 'Dossier enregistré. Lance « Sauvegarder maintenant » pour vérifier.' })
    } catch (err) { setNotice({ text: err.message }) }
    setBusy(false)
  }

  async function maintenant() {
    setBusy(true); setNotice(null)
    try {
      const { data } = await httpsCallable(functions, 'sauvegarderBudgetsMaintenant')()
      setNotice(data.statut === 'erreur' ? { text: data.erreur }
        : data.statut === 'sans-dossier' ? { text: 'Aucun dossier enregistré.' }
          : { tone: 'ok', text: data.sauvegardes.length ? `Sauvegardé : ${data.sauvegardes.join(', ')}.` : 'Rien à sauvegarder : aucun budget modifié depuis la dernière sauvegarde.' })
    } catch (err) { setNotice({ text: err.message }) }
    setBusy(false)
  }

  async function copier() {
    try { await navigator.clipboard.writeText(COMPTE_SAUVEGARDE); setNotice({ tone: 'ok', text: 'Adresse copiée.' }) } catch { /* copie manuelle */ }
  }

  if (reglage === undefined) return null
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sauvegarde automatique sur Google Drive</h2>
        <p className="text-xs text-gray-600 dark:text-neutral-300 mt-0.5 leading-relaxed">
          Chaque nuit à 2 h, chaque budget modifié depuis sa dernière sauvegarde est exporté (le même fichier qu’« Exporter (Excel) »)
          dans un dossier à son nom. On garde les 30 derniers jours, puis une sauvegarde par mois.
        </p>
      </div>
      {dossierId ? (
        <p className="text-xs text-gray-700 dark:text-neutral-200">
          Dossier : <a href={reglage.dossierLien || `https://drive.google.com/drive/folders/${dossierId}`} target="_blank" rel="noreferrer" className="underline font-semibold">ouvrir dans Google Drive</a>
          {dernier && <> · Dernier passage le {dateHeure(dernier.at)} : {dernier.statut === 'erreur'
            ? <span className="text-red-600 dark:text-red-400">{dernier.erreur}</span>
            : `${dernier.sauvegardes} budget(s) sauvegardé(s)`}</>}
        </p>
      ) : (
        <ol className="list-decimal pl-4 text-xs text-gray-700 dark:text-neutral-200 space-y-1">
          <li>Dans Google Drive, crée un <strong>Drive partagé</strong> (par exemple « Sauvegardes budgets »).</li>
          <li>
            Ajoute comme membre, avec le rôle <strong>Gestionnaire de contenu</strong> :{' '}
            <code className="px-1 rounded bg-gray-100 dark:bg-neutral-800 break-all">{COMPTE_SAUVEGARDE}</code>{' '}
            <button type="button" onClick={copier} className="underline">Copier</button>
          </li>
          <li>Colle ci-dessous le lien du Drive partagé (ou d’un dossier à l’intérieur).</li>
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={lien} onChange={e => setLien(e.target.value)} placeholder={dossierId ? 'Changer de dossier : coller un autre lien' : 'https://drive.google.com/drive/folders/…'}
          aria-label="Lien du dossier Google Drive" className="Input h-9 text-sm flex-1 min-w-[16rem]" />
        <button type="button" onClick={enregistrer} disabled={busy || !lien.trim()} className={BTN_SECONDARY}>Enregistrer</button>
        {dossierId && <button type="button" onClick={maintenant} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>}
      </div>
      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
    </section>
  )
}
