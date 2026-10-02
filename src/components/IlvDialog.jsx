import { useEffect, useMemo, useRef, useState } from 'react'
import { enrichIlvSources } from '../lib/ilvSources'
import { ILV_TYPES, PACKS, buildIlv, ilvTypesFor, oneyAllowed, packPrice, sansPack } from '../lib/ilv'
import { nomAffiche } from '../lib/opImport'

function fileName(ilv, source) {
  const clean = v => String(v || '').replace(/[\\/:*?"<>|]+/g, ' ').trim()
  return `ILV ${ILV_TYPES[ilv.type]} - ${clean(nomAffiche(source))} ${clean(source.reference)}.pdf`
}

const choice = active => ['h-8 px-3 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed',
  active
    ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
    : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800',
].join(' ')

/**
 * Téléchargement d'une ILV prête à imprimer (PDF A4 paysage).
 * sources : déclinaisons proposées ; initialKey : celle choisie au départ ;
 * preferredType : modèle proposé par défaut selon l'endroit d'où l'on vient.
 */
export default function IlvDialog({ sources, initialKey, preferredType, onClose }) {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [key, setKey] = useState(initialKey ?? sources[0]?.key)
  const [type, setType] = useState(preferredType)
  const [duree, setDuree] = useState(1)
  const [oney, setOney] = useState(null)
  const [packChoisi, setPackChoisi] = useState('')
  const [pdf, setPdf] = useState(null) // { url, name, bytes }
  const [rendering, setRendering] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    enrichIlvSources(sources).then(setItems).catch(() => setLoadError('Impossible de charger les données du produit.'))
  }, [sources])

  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const item = items?.find(i => i.key === key) || items?.[0]
  const types = item ? ilvTypesFor(item) : []
  const current = types.includes(type) ? type : types[0]
  const noPack = item ? sansPack(item.segment, item.famille) : false // accessoire ou jouet : ni pack ni durée à choisir
  const product = item && { ...item, type: current, pack: noPack ? null : item.pack || packChoisi || null }
  const packAjoute = noPack ? 0 : product?.pack ? packPrice(product.pack, duree) : null
  const total = product?.prixFort != null && packAjoute != null
    ? Math.round((product.prixFort + packAjoute) * 100) / 100 : null
  const ilv = useMemo(() => product && current
    ? buildIlv(product, { duree, oney: current === 'normal' ? oney : null }) : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [JSON.stringify(product), current, duree, oney])

  // Aperçu : le PDF est régénéré à chaque changement d'option
  useEffect(() => {
    if (!ilv || ilv.error) return
    let cancelled = false, url = null
    setRendering(true)
    import('../lib/ilvPdf').then(({ renderIlvPdf, fetchIlvAsset }) => renderIlvPdf(ilv, fetchIlvAsset))
      .then(bytes => {
        if (cancelled) return
        url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setPdf({ url, name: fileName(ilv, product), bytes })
      })
      .catch(() => !cancelled && setPdf({ error: 'La génération de l’ILV a échoué.' }))
      .finally(() => !cancelled && setRendering(false))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilv])

  // Aperçu en image (pdf.js) : identique sur ordinateur et téléphone
  useEffect(() => {
    const canvas = canvasRef.current
    if (!pdf?.bytes || !canvas) return
    let cancelled = false
    setPreviewError(false)
    import('../lib/pdfPreview')
      .then(({ renderPdfPreview }) => !cancelled && renderPdfPreview(pdf.bytes, canvas, canvas.parentElement.clientWidth))
      .catch(() => !cancelled && setPreviewError(true))
    return () => { cancelled = true }
  }, [pdf])

  function download() {
    if (!pdf?.url) return
    const a = document.createElement('a')
    a.href = pdf.url; a.download = pdf.name
    document.body.appendChild(a); a.click(); a.remove()
  }

  const label = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'
  const error = loadError || ilv?.error || pdf?.error

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ilv-title">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span id="ilv-title" className="text-sm font-semibold text-gray-900 dark:text-white">
            Télécharger l’ILV{item ? ` · ${nomAffiche(item)}` : ''}
          </span>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid gap-5 md:grid-cols-[260px_1fr]">
          {!items ? (
            <p className="text-sm text-gray-400 md:col-span-2">{loadError || 'Chargement…'}</p>
          ) : (
            <>
              <div className="space-y-4">
                {items.length > 1 && (
                  <label className="block space-y-1">
                    <span className={label}>Déclinaison</span>
                    <select className="Input" value={item.key} onChange={e => setKey(e.target.value)}>
                      {items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                    </select>
                  </label>
                )}

                <div className="space-y-1.5">
                  <span className={label}>Modèle</span>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map(t => <button key={t} onClick={() => setType(t)} className={choice(t === current)}>{ILV_TYPES[t]}</button>)}
                  </div>
                  {types.length === 1 && types[0] === 'engage' && (
                    <p className="text-[11px] text-gray-500 dark:text-neutral-400">Vélo en prix engagé : l’ILV sort toujours en prix engagé.</p>
                  )}
                  {!types.length && <p className="text-[11px] text-red-500">Aucun prix pour ce produit : l’acheteur doit renseigner son prix fort dans la base de données.</p>}
                </div>

                {!item.pack && !noPack && (
                  <label className="block space-y-1">
                    <span className={label}>Pack optionnel</span>
                    <select className="Input" value={packChoisi} onChange={e => setPackChoisi(e.target.value)}>
                      <option value="">Choisir…</option>
                      {Object.entries(PACKS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                    </select>
                    <span className="block text-[11px] text-amber-600 dark:text-amber-400">Pack non renseigné dans la base de données pour ce vélo.</span>
                  </label>
                )}

                {!noPack && <div className="space-y-1.5">
                  <span className={label}>Pack inclus dans le prix</span>
                  <div className="flex gap-1.5">
                    {[1, 2].map(d => (
                      <button key={d} onClick={() => setDuree(d)} className={choice(duree === d)}>
                        {d} an{d > 1 ? 's' : ''}{product?.pack ? ` · ${String(packPrice(product.pack, d)).replace('.', ',')} €` : ''}
                      </button>
                    ))}
                  </div>
                </div>}
                {noPack && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Pas de pack optionnel pour ce produit, l’ILV affiche le prix seul.</p>}

                {current === 'normal' && (
                  <div className="space-y-1.5">
                    <span className={label}>Paiement Oney</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setOney(null)} className={choice(!oney)}>Sans</button>
                      {[3, 4].map(n => (
                        <button key={n} onClick={() => setOney(n)} disabled={total == null || !oneyAllowed(n, total)} className={choice(oney === n)}>{n}x</button>
                      ))}
                    </div>
                    {total != null && !oneyAllowed(3, total) && <p className="text-[11px] text-gray-500">Oney : achats de 80 € à 6 000 € uniquement.</p>}
                  </div>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 overflow-hidden aspect-[297/210] relative">
                <canvas ref={canvasRef} aria-label="Aperçu de l’ILV" role="img"
                  className={`w-full h-full bg-white ${pdf?.bytes && !error && !previewError ? '' : 'invisible'}`} />
                {(!pdf?.bytes || error || previewError) && (
                  <div className="absolute inset-0 grid place-items-center text-xs text-gray-400">
                    {rendering ? 'Génération…' : previewError ? 'Aperçu indisponible : le PDF reste téléchargeable.' : 'Aperçu indisponible'}
                  </div>
                )}
                {rendering && pdf?.bytes && (
                  <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-white text-[11px]">Génération…</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button onClick={onClose} className="h-9 px-4 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Fermer</button>
          <button onClick={download} disabled={!pdf?.url || !!error || rendering}
            className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            Télécharger le PDF
          </button>
        </div>
      </div>
    </div>
  )
}
