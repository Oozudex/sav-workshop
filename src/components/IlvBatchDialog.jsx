// Toutes les ILV d'une OP en un seul PDF (une page par produit), prêt à imprimer.
import { useEffect, useMemo, useState } from 'react'
import { enrichIlvSources } from '../lib/ilvSources'
import { ILV_TYPES, opIlvBatch } from '../lib/ilv'
import { nomAffiche } from '../lib/opImport'

// Raison affichée pour un produit sans ILV
function raison(reason) {
  if (/pack/i.test(reason)) return 'pack à choisir dans la Liste des vélos (ILV)'
  if (/prix fort/i.test(reason)) return 'prix fort manquant'
  return reason.replace(/\.$/, '').toLowerCase()
}

const choice = active => ['h-8 px-3 rounded-lg text-xs font-semibold border transition-colors',
  active
    ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
    : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800',
].join(' ')

/** sources : un produit de l'OP par ILV (mêmes champs que pour IlvDialog) ; nom : nom de l'OP (fichier). */
export default function IlvBatchDialog({ sources, nom, onClose }) {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [duree, setDuree] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    enrichIlvSources(sources).then(setItems).catch(() => setLoadError('Impossible de charger les données des produits.'))
  }, [sources])

  useEffect(() => {
    const fn = e => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, busy])

  const batch = useMemo(() => (items ? opIlvBatch(items, { duree }) : null), [items, duree])
  const parType = batch ? Object.entries(batch.ilvs.reduce((acc, { ilv }) => ({ ...acc, [ilv.type]: (acc[ilv.type] || 0) + 1 }), {})) : []

  async function download() {
    if (!batch?.ilvs.length) return
    setBusy(true); setError('')
    try {
      const { renderIlvPages, fetchIlvAsset } = await import('../lib/ilvPdf')
      const bytes = await renderIlvPages(batch.ilvs.map(x => x.ilv), fetchIlvAsset, `ILV - ${nom}`)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `ILV - ${String(nom || 'OP').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setError('La génération des ILV a échoué. Réessaie.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ilv-batch-title">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
          <div className="min-w-0">
            <p id="ilv-batch-title" className="text-sm font-semibold text-gray-900 dark:text-white">Télécharger toutes les ILV</p>
            <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5 truncate">{nom} · un seul PDF, une ILV par page</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer"
            className="h-8 w-8 -mr-1 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
          {!batch && !loadError && <p className="text-sm text-gray-400 dark:text-neutral-500">Chargement des produits…</p>}
          {batch && (
            <>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Pack inclus dans le prix</p>
                <div className="flex gap-2">
                  {[1, 2].map(d => (
                    <button key={d} type="button" onClick={() => setDuree(d)} className={choice(duree === d)}>{d === 1 ? '1 an' : '2 ans'}</button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {batch.ilvs.length} ILV prête{batch.ilvs.length > 1 ? 's' : ''}
                </p>
                {parType.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                    {parType.map(([t, n]) => `${n} ${ILV_TYPES[t].toLowerCase()}`).join(' · ')}
                  </p>
                )}
              </div>

              {batch.skipped.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {batch.skipped.length} produit{batch.skipped.length > 1 ? 's' : ''} sans ILV :
                  </p>
                  <ul className="text-xs text-gray-600 dark:text-neutral-300 space-y-1 max-h-40 overflow-y-auto">
                    {batch.skipped.map(({ item, reason }) => (
                      <li key={item.key}>
                        <span className="font-medium">{nomAffiche(item)}</span>
                        {item.couleur ? ` · ${item.couleur}` : ''} — <span className="text-gray-400 dark:text-neutral-500">{raison(reason)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-9 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800">
            Fermer
          </button>
          <button type="button" onClick={download} disabled={busy || !batch?.ilvs.length}
            className="h-9 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {busy ? 'Génération…' : `Télécharger le PDF${batch?.ilvs.length ? ` (${batch.ilvs.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
