// Bouton « Récapitulatif » des fiches commande (clients et OBUT) : PDF à imprimer et à remettre au client.
// Le PDF s'ouvre dans un nouvel onglet (ouvert au clic, sinon le navigateur le bloque), sinon il est téléchargé.
import { useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { nomFichierRecap, recapClient, recapObut } from '../lib/recapCommande'

async function nomMagasin(magasinId) {
  if (!magasinId) return ''
  try { return (await getDoc(doc(db, 'magasins', magasinId))).get('nom') || '' } catch { return '' }
}

/** kind : 'client' (commande client) ou 'obut' ; commande : le document Firestore */
export default function RecapButton({ kind, commande, className = '' }) {
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState(false)

  async function imprimer() {
    setBusy(true); setErreur(false)
    const onglet = window.open('', '_blank')
    onglet?.document.write('<p style="font:14px system-ui;padding:2rem">Préparation du récapitulatif…</p>')
    try {
      const magasin = await nomMagasin(commande.magasinId)
      const recap = kind === 'obut' ? recapObut(commande, magasin) : recapClient(commande, magasin)
      const { renderRecapPdf, fetchPublic } = await import('../lib/recapPdf')
      const bytes = await renderRecapPdf(recap, fetchPublic)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      if (onglet && !onglet.closed) onglet.location.href = url
      else {
        const a = document.createElement('a')
        a.href = url; a.download = nomFichierRecap(recap)
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000)
    } catch {
      onglet?.close()
      setErreur(true)
    } finally { setBusy(false) }
  }

  return (
    <button type="button" onClick={imprimer} disabled={busy}
      title={erreur ? 'La génération a échoué : réessaie' : 'Récapitulatif à imprimer et à remettre au client'}
      className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${erreur
        ? 'border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-400'
        : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'} ${className}`}>
      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2M7 14h10v7H7z" />
      </svg>
      {busy ? 'Préparation…' : erreur ? 'Réessayer' : 'Récapitulatif'}
    </button>
  )
}
