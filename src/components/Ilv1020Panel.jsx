// Onglet « ILV 10×20 » des OP : chevalets 20 × 10 cm (promo, soldes, carte cadeau, prix promo,
// vélos presque parfaits). Le vendeur choisit un modèle, tape le montant s'il y en a un, voit l'aperçu,
// ajoute à la liste et imprime tout d'un coup : un seul PDF, une feuille A4 par chevalet.
import { useEffect, useId, useMemo, useState } from 'react'
import { MODELES_1020, QUANTITE_MAX, erreurMontant, libelle1020, lireMontant, modele1020, pages1020 } from '../lib/ilv1020'

// Liste gardée le temps de la session (on peut passer sur un autre onglet et revenir)
const CLE_LISTE = 'ilv1020-liste'
const lireListe = () => { try { return JSON.parse(sessionStorage.getItem(CLE_LISTE)) || [] } catch { return [] } }
const garderListe = l => { try { sessionStorage.setItem(CLE_LISTE, JSON.stringify(l)) } catch { /* stockage indisponible */ } }

async function genererPdf(pages, title) {
  const [{ renderIlv1020Pages }, { fetchIlvAsset }] = await Promise.all([import('../lib/ilv1020Pdf'), import('../lib/ilvPdf')])
  const bytes = await renderIlv1020Pages(pages, fetchIlvAsset, title)
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

// Aperçu du chevalet choisi : le vrai PDF (ce qui sera imprimé), régénéré après la frappe
function useApercu(page) {
  const [url, setUrl] = useState(null)
  const cle = page ? `${page.modele}-${page.montant ?? ''}` : ''
  useEffect(() => {
    if (!page) return
    let annule = false, cree = null
    const t = setTimeout(() => {
      genererPdf([page], 'Aperçu ILV 10×20').then(u => {
        cree = u
        if (annule) URL.revokeObjectURL(u)
        else setUrl(u)
      }).catch(() => {})
    }, 250)
    return () => { annule = true; clearTimeout(t); if (cree) setTimeout(() => URL.revokeObjectURL(cree), 1000) }
  }, [cle]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

export default function Ilv1020Panel() {
  const [choix, setChoix] = useState('promo')
  const [montant, setMontant] = useState('')
  const [quantite, setQuantite] = useState(1)
  const [montrerErreur, setMontrerErreur] = useState(false)
  const [liste, setListe] = useState(lireListe)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const idMontant = useId(), idQuantite = useId()

  const modele = modele1020(choix)
  const erreur = modele.montant ? erreurMontant(montant) : null
  // Aperçu : le montant tapé, ou celui du modèle tant que le champ est vide ou incorrect
  const apercu = useMemo(() => ({ modele: choix, montant: modele.montant ? (lireMontant(montant) ?? modele.exemple) : null }),
    [choix, montant, modele])
  const urlApercu = useApercu(apercu)
  const pages = useMemo(() => pages1020(liste), [liste])

  const majListe = l => { setListe(l); garderListe(l) }

  function choisir(id) {
    setChoix(id); setMontant(''); setQuantite(1); setMontrerErreur(false)
  }

  function ajouter(e) {
    e.preventDefault()
    if (erreur) { setMontrerErreur(true); return }
    const m = modele.montant ? lireMontant(montant) : null
    const n = Math.min(QUANTITE_MAX, Math.max(1, Math.floor(Number(quantite) || 1)))
    // Même chevalet déjà dans la liste : on ajoute les exemplaires
    const i = liste.findIndex(l => l.modele === choix && (l.montant ?? null) === m)
    majListe(i >= 0
      ? liste.map((l, k) => (k === i ? { ...l, quantite: Math.min(QUANTITE_MAX, l.quantite + n) } : l))
      : [...liste, { id: `${Date.now()}`, modele: choix, montant: m, quantite: n }])
    setMontant(''); setQuantite(1); setMontrerErreur(false); setMessage(null)
  }

  const changerQuantite = (id, n) => majListe(liste.map(l => (l.id === id ? { ...l, quantite: Math.min(QUANTITE_MAX, Math.max(1, n)) } : l)))
  const retirer = id => majListe(liste.filter(l => l.id !== id))

  async function imprimer() {
    if (!pages.length) return
    setBusy(true); setMessage(null)
    // Onglet ouvert tout de suite (au clic, sinon le navigateur le bloque) : le PDF s'y affiche, prêt à imprimer
    const onglet = window.open('', '_blank')
    onglet?.document.write('<p style="font:14px system-ui;padding:2rem">Préparation des ILV 10×20…</p>')
    try {
      const url = await genererPdf(pages, 'ILV 10×20')
      const dansOnglet = !!onglet && !onglet.closed
      if (dansOnglet) onglet.location.href = url
      else {
        const a = document.createElement('a')
        a.href = url
        a.download = `ILV 10x20 - ${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000)
      setMessage({ ok: pages.length, dansOnglet })
    } catch {
      onglet?.close()
      setMessage({ error: 'La génération du PDF a échoué. Réessaie.' })
    } finally { setBusy(false) }
  }

  const champ = 'h-10 rounded-lg border bg-white px-3 text-sm text-gray-900 dark:bg-neutral-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-white/20'

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">ILV 10×20</h2>
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
            Chevalets de 20 × 10 cm : une feuille A4 par chevalet, à découper le long du trait gris et à plier au milieu.
          </p>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold text-gray-700 dark:text-neutral-300 mb-2">Modèle</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {MODELES_1020.map(m => {
              const actif = m.id === choix
              return (
                <label key={m.id}
                  className={['group cursor-pointer rounded-xl border p-1.5 transition-colors focus-within:ring-2 focus-within:ring-gray-900/30 dark:focus-within:ring-white/30',
                    actif ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800' : 'border-gray-200 hover:border-gray-400 dark:border-neutral-700 dark:hover:border-neutral-500'].join(' ')}>
                  <input type="radio" name="modele1020" value={m.id} checked={actif} onChange={() => choisir(m.id)} className="sr-only" />
                  <img src={`/ilv/1020/apercus/${m.id}.jpg`} alt="" loading="lazy"
                    className="w-full aspect-[2/1] object-cover rounded-lg border border-gray-100 dark:border-neutral-700 bg-white" />
                  <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{m.label}</span>
                    {m.montant && <span className="shrink-0 text-[10px] font-medium text-gray-500 dark:text-neutral-400">montant</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <form onSubmit={ajouter} noValidate className="space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{modele.label}</p>
            {modele.montant && (
              <div>
                <label htmlFor={idMontant} className="block text-xs font-semibold text-gray-700 dark:text-neutral-300 mb-1">
                  Montant {choix === 'carte_cadeau' ? 'offert' : 'de la remise'} <span className="font-normal text-gray-500 dark:text-neutral-400">(en euros)</span>
                </label>
                <div className="relative w-40">
                  <input id={idMontant} inputMode="numeric" autoComplete="off" value={montant} placeholder={String(modele.exemple)}
                    onChange={e => { setMontant(e.target.value); setMessage(null) }} onBlur={() => montant && setMontrerErreur(true)}
                    aria-invalid={montrerErreur && !!erreur} aria-describedby={montrerErreur && erreur ? `${idMontant}-err` : undefined}
                    className={`${champ} w-full pr-8 ${montrerErreur && erreur ? 'border-red-500' : 'border-gray-300 dark:border-neutral-700'}`} />
                  <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-neutral-400">€</span>
                </div>
                {montrerErreur && erreur && <p id={`${idMontant}-err`} className="mt-1 text-xs text-red-600 dark:text-red-400">{erreur}</p>}
              </div>
            )}
            <div>
              <label htmlFor={idQuantite} className="block text-xs font-semibold text-gray-700 dark:text-neutral-300 mb-1">Exemplaires</label>
              <input id={idQuantite} type="number" min={1} max={QUANTITE_MAX} value={quantite}
                onChange={e => setQuantite(e.target.value)}
                className={`${champ} w-24 border-gray-300 dark:border-neutral-700`} />
            </div>
            <button type="submit"
              className="h-10 px-4 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              + Ajouter à la liste
            </button>
          </form>

          <figure className="space-y-1">
            <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 overflow-hidden">
              {urlApercu
                ? <iframe key={urlApercu} src={`${urlApercu}#toolbar=0&navpanes=0&view=Fit`} title={`Aperçu : ${libelle1020(apercu)}`} className="w-full h-[420px] bg-white" />
                : <div className="h-[420px] grid place-items-center text-xs text-gray-500 dark:text-neutral-400">Préparation de l’aperçu…</div>}
            </div>
            <figcaption className="text-[11px] text-gray-500 dark:text-neutral-400">
              Aperçu de la feuille : {libelle1020(apercu)}{modele.montant && lireMontant(montant) === null ? ' (exemple)' : ''}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">À imprimer{pages.length ? ` (${pages.length} feuille${pages.length > 1 ? 's' : ''})` : ''}</h2>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">Un seul PDF, une feuille A4 par chevalet.</p>
          </div>
          <button type="button" onClick={imprimer} disabled={busy || !pages.length}
            className="h-9 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {busy ? 'Génération…' : `🖨️ Imprimer${pages.length ? ` (${pages.length})` : ''}`}
          </button>
        </div>

        <div role="status" className="empty:hidden text-xs">
          {message?.ok > 0 && <p className="font-semibold text-emerald-700 dark:text-emerald-400">✓ {message.ok} chevalet{message.ok > 1 ? 's' : ''} prêt{message.ok > 1 ? 's' : ''} : {message.dansOnglet ? 'le PDF s’est ouvert dans un nouvel onglet, lance l’impression (Ctrl+P).' : 'ouvre le PDF téléchargé pour l’imprimer.'}</p>}
          {message?.error && <p className="text-red-600 dark:text-red-400">{message.error}</p>}
        </div>

        {liste.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 py-6 text-center">
            Liste vide. Choisis un modèle, tape le montant s’il y en a un, puis « Ajouter à la liste ».
          </p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
              {liste.map(l => (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <img src={`/ilv/1020/apercus/${l.modele}.jpg`} alt="" className="h-8 w-16 object-cover rounded border border-gray-100 dark:border-neutral-700 bg-white" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">{libelle1020(l)}</span>
                  <span className="inline-flex items-center rounded-lg border border-gray-200 dark:border-neutral-700">
                    <button type="button" onClick={() => changerQuantite(l.id, l.quantite - 1)} disabled={l.quantite <= 1}
                      aria-label={`Un exemplaire de moins : ${libelle1020(l)}`}
                      className="h-8 w-8 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800 rounded-l-lg">−</button>
                    <span className="min-w-[2rem] text-center text-sm tabular-nums text-gray-900 dark:text-white" aria-label={`${l.quantite} exemplaire${l.quantite > 1 ? 's' : ''}`}>{l.quantite}</span>
                    <button type="button" onClick={() => changerQuantite(l.id, l.quantite + 1)} disabled={l.quantite >= QUANTITE_MAX}
                      aria-label={`Un exemplaire de plus : ${libelle1020(l)}`}
                      className="h-8 w-8 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800 rounded-r-lg">+</button>
                  </span>
                  <button type="button" onClick={() => retirer(l.id)} aria-label={`Retirer de la liste : ${libelle1020(l)}`}
                    className="h-8 w-8 grid place-items-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-neutral-400 dark:hover:text-red-400 dark:hover:bg-red-500/10">
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => { majListe([]); setMessage(null) }} className="text-[11px] font-medium text-gray-600 hover:underline dark:text-neutral-300">
              Vider la liste
            </button>
          </>
        )}
      </section>
    </div>
  )
}
