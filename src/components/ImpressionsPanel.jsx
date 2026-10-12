// Onglet « À imprimer » des OP : les ILV envoyées depuis le téléphone (même compte), imprimées d'un coup
// dans un seul PDF. Les ILV imprimées restent 7 jours pour pouvoir les réimprimer.
import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { enrichIlvSources } from '../lib/ilvSources'
import { ILV_TYPES, ilvChoisie } from '../lib/ilv'
import { IMPRESSION_COLLECTION, IMPRESSION_RETENTION_JOURS, impressionSources, impressionsExpirees, trierImpressions } from '../lib/ilvImpressions'
import { nomAffiche } from '../lib/opImport'
import { toMs } from '../lib/todos'

/** Envois du compte, en direct. → null (chargement) ou la liste. */
export function useImpressions(uid) {
  const [list, setList] = useState(null)
  useEffect(() => {
    if (!uid) { setList([]); return }
    return onSnapshot(query(collection(db, IMPRESSION_COLLECTION), where('uid', '==', uid)),
      s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setList([]))
  }, [uid])
  return list
}

const fmtQuand = v => {
  const ms = toMs(v)
  return ms ? new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
}

// Choix faits sur le téléphone, en clair
function detailChoix(i) {
  return [ILV_TYPES[i.type] || i.type, i.duree === 2 ? 'pack 2 ans' : 'pack 1 an', i.oney ? `Oney ${i.oney}x` : null].filter(Boolean).join(' · ')
}

function Ligne({ i, checked, onCheck, onRemove, quand }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)}
        aria-label={`Sélectionner l’ILV ${nomAffiche(i.source)}`} className="h-4 w-4 shrink-0 accent-gray-900 dark:accent-white" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {nomAffiche(i.source)}{i.source.marque && <span className="font-normal text-gray-500 dark:text-neutral-400"> · {i.source.marque}</span>}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400 truncate">
          {[i.source.couleur, i.source.chrono, detailChoix(i)].filter(Boolean).join(' · ')} — {quand}
        </p>
      </div>
      <button type="button" onClick={onRemove} aria-label={`Retirer l’ILV ${nomAffiche(i.source)}`} title="Retirer"
        className="h-7 w-7 shrink-0 grid place-items-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-neutral-400 dark:hover:text-red-400 dark:hover:bg-red-500/10">
        <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </li>
  )
}

export default function ImpressionsPanel({ impressions }) {
  const { aImprimer, imprimees } = useMemo(() => trierImpressions(impressions || []), [impressions])
  // Sélection : tout ce qui reste à imprimer est coché par défaut
  const [exclues, setExclues] = useState(() => new Set())
  const [reimprimer, setReimprimer] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { ok?, error?, skipped? }

  // Nettoyage : ILV imprimées depuis plus de 7 jours
  useEffect(() => {
    impressionsExpirees(impressions || []).forEach(i => deleteDoc(doc(db, IMPRESSION_COLLECTION, i.id)).catch(() => {}))
  }, [impressions])

  const selection = [...aImprimer.filter(i => !exclues.has(i.id)), ...imprimees.filter(i => reimprimer.has(i.id))]

  async function imprimer() {
    if (!selection.length) return
    setBusy(true); setMessage(null)
    // Onglet ouvert tout de suite (au clic, sinon le navigateur le bloque) : le PDF s'y affiche, prêt à imprimer
    const onglet = window.open('', '_blank')
    onglet?.document.write('<p style="font:14px system-ui;padding:2rem">Préparation des ILV…</p>')
    try {
      const items = await enrichIlvSources(impressionSources(selection))
      const ilvs = [], skipped = []
      let dansOnglet = false
      for (const item of items) {
        const envoi = selection.find(i => i.id === item.key)
        const ilv = ilvChoisie(item, envoi)
        if (ilv.error) skipped.push({ nom: nomAffiche(item), raison: ilv.error })
        else ilvs.push({ envoi, ilv })
      }
      if (ilvs.length) {
        const { renderIlvPages, fetchIlvAsset } = await import('../lib/ilvPdf')
        const bytes = await renderIlvPages(ilvs.map(x => x.ilv), fetchIlvAsset, 'ILV à imprimer')
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        dansOnglet = !!onglet && !onglet.closed
        if (dansOnglet) onglet.location.href = url
        else {
          // Onglet bloqué : téléchargement du PDF
          const a = document.createElement('a')
          a.href = url
          a.download = `ILV à imprimer - ${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`
          document.body.appendChild(a); a.click(); a.remove()
        }
        setTimeout(() => URL.revokeObjectURL(url), 120000)
        // Marquées imprimées (les réimpressions reprennent la date du jour)
        const batch = writeBatch(db)
        ilvs.forEach(({ envoi }) => batch.update(doc(db, IMPRESSION_COLLECTION, envoi.id), { imprimeAt: serverTimestamp() }))
        await batch.commit()
      } else onglet?.close()
      setExclues(new Set()); setReimprimer(new Set())
      setMessage({ ok: ilvs.length, dansOnglet, skipped })
    } catch {
      onglet?.close()
      setMessage({ error: 'La génération du PDF a échoué. Réessaie.' })
    } finally { setBusy(false) }
  }

  const retirer = i => deleteDoc(doc(db, IMPRESSION_COLLECTION, i.id)).catch(() => setMessage({ error: 'La suppression a échoué.' }))
  const toggle = (setter, id, on) => setter(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  if (impressions === null) return <p className="text-sm text-gray-500 dark:text-neutral-400 py-10 text-center">Chargement…</p>

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">À imprimer{aImprimer.length ? ` (${aImprimer.length})` : ''}</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
              Les ILV envoyées depuis ton téléphone avec « Envoyer à l’impression ». Un seul PDF, une ILV par page.
            </p>
          </div>
          <button type="button" onClick={imprimer} disabled={busy || !selection.length}
            className="h-9 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {busy ? 'Génération…' : `🖨️ Imprimer${selection.length ? ` (${selection.length})` : ''}`}
          </button>
        </div>

        <div role="status" className="empty:hidden text-xs space-y-1">
          {message?.ok > 0 && <p className="font-semibold text-emerald-700 dark:text-emerald-400">✓ {message.ok} ILV prête{message.ok > 1 ? 's' : ''} : {message.dansOnglet ? 'le PDF s’est ouvert dans un nouvel onglet, lance l’impression (Ctrl+P).' : 'ouvre le PDF téléchargé pour l’imprimer.'}</p>}
          {message?.skipped?.length > 0 && (
            <div className="text-amber-700 dark:text-amber-400">
              <p className="font-semibold">{message.skipped.length} ILV non imprimée{message.skipped.length > 1 ? 's' : ''} (restée{message.skipped.length > 1 ? 's' : ''} dans la liste) :</p>
              <ul className="list-disc pl-4">{message.skipped.map((s, k) => <li key={k}>{s.nom} — {s.raison}</li>)}</ul>
            </div>
          )}
          {message?.error && <p className="text-red-600 dark:text-red-400">{message.error}</p>}
        </div>

        {aImprimer.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 py-6 text-center">
            Rien à imprimer. Sur ton téléphone, ouvre l’ILV d’un vélo et appuie sur « Envoyer à l’impression ».
          </p>
        ) : (
          <>
            <div className="flex gap-3 text-[11px] font-medium">
              <button type="button" onClick={() => setExclues(new Set())} className="text-gray-600 hover:underline dark:text-neutral-300">Tout cocher</button>
              <button type="button" onClick={() => setExclues(new Set(aImprimer.map(i => i.id)))} className="text-gray-600 hover:underline dark:text-neutral-300">Tout décocher</button>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
              {aImprimer.map(i => (
                <Ligne key={i.id} i={i} checked={!exclues.has(i.id)} onCheck={on => toggle(setExclues, i.id, !on)}
                  onRemove={() => retirer(i)} quand={`envoyée ${fmtQuand(i.envoyeAt)}`} />
              ))}
            </ul>
          </>
        )}
      </section>

      {imprimees.length > 0 && (
        <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Déjà imprimées</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
              Gardées {IMPRESSION_RETENTION_JOURS} jours : coche celles à réimprimer.
            </p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {imprimees.map(i => (
              <Ligne key={i.id} i={i} checked={reimprimer.has(i.id)} onCheck={on => toggle(setReimprimer, i.id, on)}
                onRemove={() => retirer(i)} quand={`imprimée ${fmtQuand(i.imprimeAt)}`} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
