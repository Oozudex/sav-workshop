import { useEffect, useRef, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { toDate } from '../lib/ticketStats'

// Message à reporter dans la fiche atelier de l'outil du magasin avant la clôture
export function buildClosingMessage(ticket, comments) {
  const lines = [
    `N° SAV : ${ticket.trackingNumber || 'non renseigné'}`,
    `N° de série : ${ticket.serialNumber || 'non renseigné'}`,
    `Ticket : ${ticket.ticketNumber || ticket.id}`,
    '',
    'Commentaires :',
  ]
  if (!comments.length) lines.push('(aucun commentaire)')
  for (const c of comments) {
    const d = toDate(c.createdAt)
    const date = d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
    lines.push(`${date} · ${c.author || '—'} : ${c.text}`)
  }
  return lines.join('\n')
}

async function copyText(text, textarea) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Repli si le presse-papier moderne est indisponible
    textarea?.select()
    return document.execCommand?.('copy') ?? false
  }
}

/**
 * Procédure de clôture : le vendeur doit copier le récapitulatif (n° SAV, n° de série,
 * commentaires) pour le reporter dans la fiche atelier avant de pouvoir clôturer.
 */
export default function CloseTicketDialog({ ticket, onCancel, onConfirm }) {
  const [message, setMessage] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [closing, setClosing] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    getDocs(query(collection(db, 'tickets', ticket.id, 'comments'), orderBy('createdAt', 'asc')))
      .then(snap => setMessage(buildClosingMessage(ticket, snap.docs.map(d => d.data()))))
      .catch(() => setMessage(buildClosingMessage(ticket, [])))
  }, [ticket])

  useEffect(() => {
    const fn = e => e.key === 'Escape' && !closing && onCancel()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onCancel, closing])

  async function copy() {
    const ok = await copyText(message, textareaRef.current)
    setCopied(ok)
    setCopyError(!ok)
  }

  async function confirm() {
    setClosing(true)
    try { await onConfirm() } finally { setClosing(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center p-3 sm:p-4 sm:pt-[8vh] bg-black/60 backdrop-blur-sm overflow-y-auto"
      role="dialog" aria-modal="true" aria-labelledby="close-ticket-title">
      <div className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border-2 border-amber-400 dark:border-amber-500/70 bg-white dark:bg-neutral-900">
        <div className="flex items-start gap-3 px-4 sm:px-5 py-4 bg-amber-50 border-b border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30">
          <span aria-hidden className="h-9 w-9 shrink-0 rounded-full grid place-items-center bg-amber-400 text-amber-950 text-lg font-bold">!</span>
          <div>
            <h2 id="close-ticket-title" className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Avant de clôturer le ticket {ticket.ticketNumber}
            </h2>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Copie ce récapitulatif et colle-le dans la <strong>fiche atelier</strong> du logiciel du magasin :
              après la clôture, les données du client seront effacées sous 14 jours.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          <textarea
            ref={textareaRef}
            readOnly
            rows={10}
            value={message ?? 'Préparation du récapitulatif…'}
            className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-3 font-mono text-xs text-gray-800 dark:text-neutral-100 resize-none focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={copy} disabled={!message}
              className={`h-9 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${copied
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-amber-500 text-amber-950 hover:bg-amber-400'}`}>
              {copied ? '✓ Copié' : 'Copier le récapitulatif'}
            </button>
            <p className={`text-xs ${copyError ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-neutral-400'}`}>
              {copyError
                ? 'La copie a échoué : sélectionne le texte et copie-le avec Ctrl+C / Cmd+C, puis réessaie.'
                : copied ? 'Colle-le maintenant dans la fiche atelier.' : 'Étape obligatoire pour pouvoir clôturer.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onCancel} disabled={closing}
            className="h-9 px-4 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
            Annuler
          </button>
          <button onClick={confirm} disabled={!copied || closing}
            title={copied ? '' : "Copie d'abord le récapitulatif"}
            className="h-9 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                       bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {closing ? 'Clôture…' : 'Fermer et clôturer le ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
