// Fiche d'une OP : ajout de vélos cherchés dans la base de données (catalogue_produits).
// On cherche, on coche un ou plusieurs vélos (toutes les couleurs d'un modèle d'un clic), on tape un
// prix OP commun et tout est ajouté d'un coup. Un produit hors base se saisit encore à la main.
import { useEffect, useId, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import Dialog from './Dialog'
import { formatEuro } from '../lib/orders'
import { parsePrice, remisePct } from '../lib/opImport'
import { GROUPES_MAX, RECHERCHE_MIN, clesOp, dejaDansOp, produitsDepuisBase, rechercherBase } from '../lib/opAjoutBase'

const etiquette = 'text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide'
const detailVelo = v => [v.couleur, v.chrono, v.reference && v.reference !== v.chrono ? v.reference : null].filter(Boolean).join(' · ')

export default function AjoutBaseModal({ produitsOp, onClose, onAdd, onManuel }) {
  const [catalogue, setCatalogue] = useState(null) // null : chargement
  const [erreurBase, setErreurBase] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState(() => new Map()) // id → vélo de la base
  const [prixOp, setPrixOp] = useState('')
  const [prixForts, setPrixForts] = useState({}) // id → prix fort saisi (vélo sans prix fort dans la base)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState('')
  const idRecherche = useId(), idPrixOp = useId()

  useEffect(() => {
    getDocs(collection(db, 'catalogue_produits'))
      .then(s => setCatalogue(s.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => { setCatalogue([]); setErreurBase(true) })
  }, [])

  const cles = useMemo(() => clesOp(produitsOp), [produitsOp])
  const { groupes, total } = useMemo(() => rechercherBase(catalogue || [], recherche), [catalogue, recherche])
  const choisis = [...selection.values()]

  const basculer = (v, on) => setSelection(s => {
    const n = new Map(s)
    if (on) n.set(v.id, v); else n.delete(v.id)
    return n
  })
  const basculerGroupe = (libres, on) => setSelection(s => {
    const n = new Map(s)
    libres.forEach(v => (on ? n.set(v.id, v) : n.delete(v.id)))
    return n
  })

  const prix = parsePrice(prixOp)
  const prixFortDe = v => (v.prixFort > 0 ? v.prixFort : parsePrice(prixForts[v.id] ?? ''))
  const erreurPrix = prixOp.trim() && !(prix > 0) ? 'Prix invalide.' : ''
  const pret = choisis.length > 0 && prix > 0 && !saving

  async function ajouter(e) {
    e.preventDefault()
    if (!pret) return
    setSaving(true); setErreur('')
    try {
      const saisis = Object.fromEntries(choisis.filter(v => !(v.prixFort > 0)).map(v => [v.id, parsePrice(prixForts[v.id] ?? '')]))
      await onAdd(produitsDepuisBase(choisis, { prixOp: prix, prixForts: saisis }))
      onClose()
    } catch {
      setErreur('L’ajout a échoué. Réessaie.')
      setSaving(false)
    }
  }

  return (
    <Dialog onClose={onClose} label="Ajouter des vélos depuis la base" className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <form onSubmit={ajouter} className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ajouter des vélos depuis la base</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label htmlFor={idRecherche} className={etiquette}>Chercher un vélo</label>
            <div className="relative">
              <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-neutral-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
              <input id={idRecherche} type="search" className="Input !pl-9" value={recherche} onChange={e => setRecherche(e.target.value)} autoFocus autoComplete="off"
                placeholder="Nom, marque, chrono, référence, couleur…" />
            </div>
          </div>

          <div role="status" className="text-xs text-gray-500 dark:text-neutral-400 empty:hidden">
            {catalogue === null ? 'Chargement de la base…'
              : erreurBase ? <span className="text-red-600 dark:text-red-400">La base de données n’a pas pu être chargée.</span>
              : recherche.trim().length < RECHERCHE_MIN ? `${catalogue.length} vélos dans la base. Tape au moins ${RECHERCHE_MIN} caractères.`
              : total === 0 ? 'Aucun vélo trouvé.'
              : total > GROUPES_MAX ? `${total} modèles trouvés : les ${GROUPES_MAX} premiers sont affichés, précise la recherche.`
              : `${total} modèle${total > 1 ? 's' : ''} trouvé${total > 1 ? 's' : ''}.`}
          </div>

          {groupes.length > 0 && (
            <ul className="space-y-2">
              {groupes.map(g => {
                const libres = g.variantes.filter(v => !dejaDansOp(v, cles))
                const tousCoches = libres.length > 0 && libres.every(v => selection.has(v.id))
                return (
                  <li key={g.key} className="rounded-xl border border-gray-200 dark:border-neutral-700">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-neutral-800/60 rounded-t-xl">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white min-w-0 truncate">
                        {g.nom} {g.marque && <span className="font-normal text-gray-500 dark:text-neutral-400">· {g.marque}</span>}
                      </p>
                      {libres.length > 1 && (
                        <button type="button" onClick={() => basculerGroupe(libres, !tousCoches)}
                          className="shrink-0 text-[11px] font-semibold text-gray-700 hover:underline dark:text-neutral-200">
                          {tousCoches ? 'Tout décocher' : `Tout cocher (${libres.length})`}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                      {g.variantes.map(v => {
                        const deja = dejaDansOp(v, cles)
                        return (
                          <li key={v.id}>
                            <label className={['flex items-center gap-3 px-3 py-2 text-sm', deja ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/40'].join(' ')}>
                              <input type="checkbox" disabled={deja} checked={selection.has(v.id)} onChange={e => basculer(v, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 dark:border-neutral-600" />
                              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-neutral-200">{detailVelo(v) || v.nom}</span>
                              {deja
                                ? <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">Déjà dans l’OP</span>
                                : <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-neutral-400">{v.prixFort > 0 ? formatEuro(v.prixFort) : 'sans prix fort'}</span>}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}

          {erreur && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{erreur}</p>}
        </div>

        {choisis.length > 0 && (
          <section className="px-5 py-3 border-t border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 space-y-3">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white">Sélection ({choisis.length} vélo{choisis.length > 1 ? 's' : ''})</h3>
            <ul className="space-y-1.5 max-h-36 overflow-y-auto">
              {choisis.map(v => {
                const pf = prixFortDe(v)
                const rem = prix > 0 && pf > 0 ? remisePct({ prixFort: pf, prixOp: prix }) : null
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="flex-1 min-w-[12rem] text-gray-900 dark:text-white truncate">
                      {v.nom} <span className="text-gray-500 dark:text-neutral-400">{detailVelo(v)}</span>
                    </span>
                    {v.prixFort > 0
                      ? <span className="text-xs tabular-nums text-gray-500 dark:text-neutral-400">{formatEuro(v.prixFort)}</span>
                      : <input className="Input !h-8 !w-28 text-xs" inputMode="decimal" value={prixForts[v.id] ?? ''} placeholder="Prix fort €"
                          aria-label={`Prix fort de ${v.nom} ${detailVelo(v)}`} onChange={e => setPrixForts(p => ({ ...p, [v.id]: e.target.value }))} />}
                    <span className={['w-12 text-right text-xs font-bold tabular-nums', rem != null && rem > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-neutral-400'].join(' ')}>
                      {rem != null ? `-${rem}%` : '—'}
                    </span>
                    <button type="button" onClick={() => basculer(v, false)} aria-label={`Retirer ${v.nom} ${detailVelo(v)} de la sélection`}
                      className="h-7 w-7 grid place-items-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-neutral-400 dark:hover:text-red-400 dark:hover:bg-red-500/10">
                      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="space-y-1">
              <label htmlFor={idPrixOp} className={etiquette}>Prix OP (€) *</label>
              <input id={idPrixOp} className={`Input !w-40 ${erreurPrix ? '!border-red-500' : ''}`} inputMode="decimal" value={prixOp}
                onChange={e => setPrixOp(e.target.value)} placeholder="ex. 549,99" aria-invalid={!!erreurPrix}
                aria-describedby={`${idPrixOp}-aide`} />
              <p id={`${idPrixOp}-aide`} className={`text-[11px] ${erreurPrix ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-neutral-400'}`}>
                {erreurPrix || 'Le même prix pour tous les vélos sélectionnés. Tu pourras le modifier vélo par vélo ensuite.'}
              </p>
            </div>
          </section>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 dark:border-neutral-800">
          <button type="button" onClick={onManuel} className="text-xs text-gray-600 hover:underline dark:text-neutral-300">
            Produit hors base ? Le saisir à la main
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
              Annuler
            </button>
            <button type="submit" disabled={!pret}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Ajout…' : choisis.length > 1 ? `Ajouter ${choisis.length} vélos` : 'Ajouter le vélo'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
