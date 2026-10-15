// Balises de diagnostic des vélos : où elles sont (grille types × magasins), demandes de transfert
// entre magasins (demande → réponse → envoi → réception). Les balises appartiennent au groupe :
// la dernière qui l'a reçue la garde jusqu'à la prochaine demande. Logique : lib/balises.js
import { useEffect, useId, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { useShallow } from 'zustand/react/shallow'
import Navbar from '../components/Navbar'
import Dialog from '../components/Dialog'
import RequiredHint from '../components/RequiredHint'
import { BTN_PRIMARY, BTN_SECONDARY } from '../components/admin/ui'
import { db } from '../lib/firebase'
import { useAuth } from '../store/useAuth'
import { toDate } from '../lib/ticketStats'
import {
  BALISE_COLLECTION, BALISE_TRANSFERT_COLLECTION, DEMANDE_ACTIVES, DEMANDE_STATUTS, ETAPES_DEMANDE,
  TYPES_SUGGERES, baliseFormErrors, baliseFormInitial, balisePayload, balisesACreer, demandesActivesParBalise, enTransfert,
  estCompteMagasin, estGlobal, etapeDemande, etapesFranchies, grilleBalises, nomBalise, peutGererBalises,
  raisonPasDemande, typesBalises,
} from '../lib/balises'

const RECENTES_JOURS = 14
const sansAccents = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const fmtDate = v => { const d = toDate(v); return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '' }

function useCollection(nom) {
  const [list, setList] = useState(null)
  useEffect(() => onSnapshot(collection(db, nom), s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setList([])), [nom])
  return list
}

function Pill({ className, children }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>
}

// Frise des 4 étapes d'une demande
function Frise({ d }) {
  const n = etapesFranchies(d), ko = ['refused', 'cancelled'].includes(d.status)
  return (
    <ol className="flex items-center gap-1" aria-label={`Étape ${n} sur 4`}>
      {ETAPES_DEMANDE.map((e, i) => (
        <li key={e} className="flex items-center gap-1">
          <span className={['h-1.5 w-8 rounded-full', i < n ? (ko && i === n - 1 ? 'bg-red-500' : 'bg-gray-900 dark:bg-white') : 'bg-gray-200 dark:bg-neutral-700'].join(' ')} />
          <span className="sr-only">{e}{i < n ? ' (faite)' : ''}</span>
        </li>
      ))}
    </ol>
  )
}

function DemandeCarte({ d, magasinId, global, onAction }) {
  const step = etapeDemande(d, magasinId)
  const statut = DEMANDE_STATUTS[d.status] || DEMANDE_STATUTS.pending
  return (
    <li className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{d.baliseNom}</p>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            {d.fromMagasinNom || '—'} → <span className="font-semibold text-gray-700 dark:text-neutral-200">{d.toMagasinNom || '—'}</span>
            {d.createdByName ? ` · demandée par ${d.createdByName}` : ''}{d.createdAt ? ` le ${fmtDate(d.createdAt)}` : ''}
          </p>
        </div>
        <Pill className={statut.pill}>{statut.label}</Pill>
      </div>
      {d.message && <p className="text-xs text-gray-700 dark:text-neutral-300 bg-gray-50 dark:bg-neutral-800/60 rounded-lg px-2.5 py-1.5">« {d.message} »</p>}
      <Frise d={d} />
      <p className={`text-xs ${step.mine ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-neutral-400'}`}>{step.texte}</p>
      <div className="flex flex-wrap gap-2 empty:hidden">
        {step.action === 'respond' && <>
          <button type="button" className={BTN_PRIMARY} onClick={() => onAction('accept', d)}>Accepter</button>
          <button type="button" className={BTN_SECONDARY} onClick={() => onAction('refuse', d)}>Refuser</button>
        </>}
        {step.action === 'ship' && <button type="button" className={BTN_PRIMARY} onClick={() => onAction('ship', d)}>📦 Marquer envoyée</button>}
        {step.action === 'receive' && <button type="button" className={BTN_PRIMARY} onClick={() => onAction('receive', d)}>✓ Balise reçue</button>}
        {(step.action === 'cancel' || (global && DEMANDE_ACTIVES.includes(d.status))) && (
          <button type="button" className={BTN_SECONDARY} onClick={() => onAction('cancel', d)}>Annuler la demande</button>
        )}
      </div>
    </li>
  )
}

// Fiche d'une balise : où elle est, demande, historique, modification (admin, acheteur de l'univers CYCLE)
function BaliseFiche({ b, demande, historique, profile, gestion, onClose, onDemander, onModifier }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const chezMoi = estCompteMagasin(profile) && b.magasinId === profile.magasinId
  const raison = raisonPasDemande(b, demande, profile)
  const idMsg = useId()
  const run = async fn => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  return (
    <Dialog onClose={onClose} label={nomBalise(b)} className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">{b.type}</p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{b.nom}</h2>
          </div>
          <div className="flex items-center gap-1">
            {gestion && <button type="button" className={BTN_SECONDARY} onClick={() => onModifier(b)}>Modifier</button>}
            <button type="button" aria-label="Fermer" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">Où elle est</dt><dd className="font-semibold text-gray-900 dark:text-white">{b.magasinNom || '—'}</dd></div>
            {enTransfert(demande) && <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">En route vers</dt><dd className="font-semibold text-violet-700 dark:text-violet-300">{demande.toMagasinNom || '—'}</dd></div>}
            {b.numeroSerie && <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">N° de série</dt><dd className="font-mono text-gray-900 dark:text-white">{b.numeroSerie}</dd></div>}
            {b.note && <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">Note</dt><dd className="text-gray-700 dark:text-neutral-300">{b.note}</dd></div>}
          </dl>

          {!chezMoi && estCompteMagasin(profile) && (
            raison ? <p className="text-xs text-gray-500 dark:text-neutral-400">{raison}</p> : (
              <form className="space-y-2" onSubmit={ev => { ev.preventDefault(); run(() => onDemander(b, message)) }}>
                <label htmlFor={idMsg} className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                  Message <span className="font-normal normal-case">(facultatif)</span>
                </label>
                <input id={idMsg} className="Input" maxLength={200} value={message} onChange={ev => setMessage(ev.target.value)} placeholder="Ex. diagnostic d’un Bosch Performance CX, dès que possible" />
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>Demander cette balise à {b.magasinNom || 'ce magasin'}</button>
              </form>
            )
          )}

          {historique.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">Derniers déplacements</p>
              <ul className="text-xs text-gray-700 dark:text-neutral-300 space-y-0.5">
                {historique.slice(0, 5).map(h => <li key={h.id}>{fmtDate(h.receivedAt)} · {h.fromMagasinNom} → {h.toMagasinNom}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// Création et modification d'une fiche (admin, acheteur de l'univers CYCLE). À la création, on coche
// un ou plusieurs magasins : une balise du même nom est créée dans chacun.
function BaliseForm({ balise, magasins, types, onClose, onSave, onDelete }) {
  const creation = !balise
  const [f, setF] = useState(() => baliseFormInitial(balise))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [echec, setEchec] = useState(false)
  const errors = baliseFormErrors(f, { creation })
  const err = k => (tried ? errors[k] : null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const listId = useId()
  const suggestions = [...new Set([...types, ...TYPES_SUGGERES])]
  const plusieurs = f.magasinIds.length > 1
  const tous = magasins.length > 0 && magasins.every(m => f.magasinIds.includes(m.id))
  async function submit(e) {
    e.preventDefault(); setTried(true)
    if (Object.keys(errors).length) return
    setBusy(true); setEchec(false)
    try { await onSave(creation ? balisesACreer(f, magasins) : balisePayload(f, magasins)); onClose() } catch { setEchec(true) } finally { setBusy(false) }
  }
  const champ = (k, label, input, required) => (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">{label}{required && ' *'}</span>
      {input}
      {err(k) && <span className="block text-xs text-red-600 dark:text-red-400">{err(k)}</span>}
    </label>
  )
  const bad = k => (err(k) ? '!border-red-400' : '')
  return (
    <Dialog onClose={onClose} label={balise ? 'Modifier la balise' : 'Nouvelle balise'} className="fixed inset-0 z-[410] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <form onSubmit={submit} noValidate className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{balise ? 'Modifier la balise' : 'Nouvelle balise'}</h2>
        </div>
        <div className="p-5 space-y-3">
          <RequiredHint />
          <div className="grid grid-cols-2 gap-3">
            {champ('type', 'Type', <>
              <input className={`Input ${bad('type')}`} list={listId} value={f.type} onChange={e => set('type', e.target.value)} placeholder="Bosch, Shimano…" autoFocus />
              <datalist id={listId}>{suggestions.map(t => <option key={t} value={t} />)}</datalist>
            </>, true)}
            {champ('nom', 'Nom', <input className={`Input ${bad('nom')}`} value={f.nom} onChange={e => set('nom', e.target.value)} placeholder="Bosch n° 2" />, true)}
            {creation && plusieurs ? (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">N° de série</span>
                <p className="text-xs text-gray-500 dark:text-neutral-400 pt-1.5">Propre à chaque balise : à saisir ensuite sur chacune.</p>
              </div>
            ) : champ('numeroSerie', 'N° de série', <input className="Input font-mono" value={f.numeroSerie} onChange={e => set('numeroSerie', e.target.value)} />)}
            {!creation && champ('magasinId', 'Magasin où elle est', (
              <select className={`Input ${bad('magasinId')}`} value={f.magasinId} onChange={e => set('magasinId', e.target.value)}>
                <option value="">— Choisir</option>
                {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            ), true)}
          </div>
          {creation && (
            <fieldset className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                  Magasins * <span className="normal-case font-normal">· une balise par magasin coché</span>
                </legend>
                <button type="button" onClick={() => set('magasinIds', tous ? [] : magasins.map(m => m.id))}
                  className="text-[11px] font-semibold text-gray-700 hover:underline dark:text-neutral-200 shrink-0">
                  {tous ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {magasins.map(m => {
                  const on = f.magasinIds.includes(m.id)
                  return (
                    <label key={m.id} className={['flex items-center gap-2 h-9 px-2.5 rounded-lg border cursor-pointer transition-colors',
                      on ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800' : 'border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800',
                      err('magasinId') ? '!border-red-400' : ''].join(' ')}>
                      <input type="checkbox" className="h-3.5 w-3.5 shrink-0" checked={on}
                        onChange={() => set('magasinIds', on ? f.magasinIds.filter(x => x !== m.id) : [...f.magasinIds, m.id])} />
                      <span className="text-xs text-gray-700 dark:text-neutral-200 truncate">{m.nom}</span>
                    </label>
                  )
                })}
              </div>
              {err('magasinId') && <p className="text-xs text-red-600 dark:text-red-400">{err('magasinId')}</p>}
            </fieldset>
          )}
          {echec && <p role="alert" className="text-xs text-red-600 dark:text-red-400">L’enregistrement a échoué. Vérifie ta connexion et réessaie.</p>}
          {champ('note', 'Note', <textarea rows={2} className={`Input ${bad('note')}`} value={f.note} onChange={e => set('note', e.target.value)} placeholder="Câbles fournis, logiciel…" />)}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 dark:border-neutral-800">
          {balise ? (
            <button type="button" onClick={() => { if (confirm(`Supprimer la balise « ${nomBalise(balise)} » ?`)) onDelete(balise).then(onClose) }}
              className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">Supprimer</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>Annuler</button>
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>
              {busy ? 'Enregistrement…' : creation && plusieurs ? `Créer ${f.magasinIds.length} balises` : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

export default function Balises() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const balises = useCollection(BALISE_COLLECTION)
  const demandes = useCollection(BALISE_TRANSFERT_COLLECTION)
  const magasinsDocs = useCollection('magasins')
  const [filtreType, setFiltreType] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [ouverte, setOuverte] = useState(null) // id de la balise affichée
  const [form, setForm] = useState(null) // null | {} (nouvelle) | balise
  const [erreur, setErreur] = useState('')

  const gestion = peutGererBalises(profile)
  const global = estGlobal(profile)
  const monMagasin = estCompteMagasin(profile) ? profile.magasinId : null
  const magasins = useMemo(() => (magasinsDocs || []).map(m => ({ id: m.id, nom: m.nom || m.id })), [magasinsDocs])
  const nomMagasin = id => magasins.find(m => m.id === id)?.nom || ''
  const actives = useMemo(() => demandesActivesParBalise(demandes), [demandes])
  // Recherche sur le type, le nom, le n° de série et le magasin (sans accents ni majuscules)
  const trouvees = useMemo(() => {
    const q = sansAccents(recherche.trim())
    if (!q) return balises || []
    return (balises || []).filter(b => sansAccents([b.type, b.nom, b.numeroSerie, b.magasinNom, actives.get(b.id)?.toMagasinNom].join(' ')).includes(q))
  }, [balises, recherche, actives])
  const { types } = useMemo(() => grilleBalises(trouvees, magasins, { filtreType }), [trouvees, magasins, filtreType])
  // Une tuile par magasin (le mien d'abord) ; avec une recherche ou un type choisi, seules les balises
  // correspondantes restent affichées dans les tuiles
  const filtreActif = !!recherche.trim() || !!filtreType
  const correspondantes = useMemo(() => new Set(types.flatMap(l => Object.values(l.cellules).flat().map(b => b.id))), [types])
  const tuiles = useMemo(() => magasins
    .map(m => ({ ...m, balises: (balises || []).filter(b => b.magasinId === m.id && correspondantes.has(b.id))
      .sort((a, b) => (a.type || '').localeCompare(b.type || '', 'fr') || (a.nom || '').localeCompare(b.nom || '', 'fr')) }))
    .sort((a, b) => (b.id === monMagasin) - (a.id === monMagasin) || a.nom.localeCompare(b.nom, 'fr')),
  [magasins, balises, correspondantes, monMagasin])
  const tousTypes = useMemo(() => typesBalises(balises), [balises])
  const enCours = (demandes || []).filter(d => DEMANDE_ACTIVES.includes(d.status))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
  const aFaire = enCours.filter(d => etapeDemande(d, monMagasin).mine)
  const autres = enCours.filter(d => !etapeDemande(d, monMagasin).mine)
  const limite = Date.now() - RECENTES_JOURS * 86400000
  const recentes = (demandes || []).filter(d => !DEMANDE_ACTIVES.includes(d.status) && (toDate(d.updatedAt)?.getTime() || 0) > limite)
  const balise = (balises || []).find(b => b.id === ouverte) || null
  const qui = profile?.displayName || user?.email || null

  const garde = fn => async (...args) => {
    setErreur('')
    try { await fn(...args) } catch { setErreur('L’enregistrement a échoué. Réessaie.') }
  }

  const demander = garde(async (b, message) => {
    await addDoc(collection(db, BALISE_TRANSFERT_COLLECTION), {
      baliseId: b.id, baliseNom: nomBalise(b), baliseType: b.type || null,
      fromMagasinId: b.magasinId, fromMagasinNom: b.magasinNom || nomMagasin(b.magasinId) || null,
      toMagasinId: monMagasin, toMagasinNom: nomMagasin(monMagasin) || null,
      message: message.trim() || null, status: 'pending',
      createdBy: user.uid, createdByName: qui, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    setOuverte(null)
  })

  const agir = garde(async (action, d) => {
    const ref = doc(db, BALISE_TRANSFERT_COLLECTION, d.id)
    const par = { updatedAt: serverTimestamp(), updatedByName: qui }
    if (action === 'accept') return updateDoc(ref, { status: 'accepted', respondedAt: serverTimestamp(), ...par })
    if (action === 'refuse') {
      const motif = prompt('Pourquoi ? (facultatif, visible par le magasin qui la demande)')
      if (motif === null) return
      return updateDoc(ref, { status: 'refused', motif: motif.trim() || null, respondedAt: serverTimestamp(), ...par })
    }
    if (action === 'ship') return updateDoc(ref, { status: 'shipped', shippedAt: serverTimestamp(), ...par })
    if (action === 'cancel') {
      if (!confirm(`Annuler la demande de « ${d.baliseNom} » ?`)) return
      return updateDoc(ref, { status: 'cancelled', ...par })
    }
    if (action === 'receive') {
      // La balise passe chez le magasin qui la reçoit ; la demande est terminée
      const batch = writeBatch(db)
      batch.update(doc(db, BALISE_COLLECTION, d.baliseId), {
        magasinId: d.toMagasinId, magasinNom: d.toMagasinNom || nomMagasin(d.toMagasinId) || null,
        dernierTransfertId: d.id, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByName: qui,
      })
      batch.update(ref, { status: 'completed', receivedAt: serverTimestamp(), ...par })
      return batch.commit()
    }
  })

  // Modification : une fiche ; création : une balise par magasin coché, en une écriture groupée
  const enregistrer = async data => {
    if (form?.id) return updateDoc(doc(db, BALISE_COLLECTION, form.id), { ...data, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByName: qui })
    const batch = writeBatch(db)
    for (const b of data) batch.set(doc(collection(db, BALISE_COLLECTION)), { ...b, createdAt: serverTimestamp(), createdBy: user.uid, updatedAt: serverTimestamp() })
    return batch.commit()
  }
  const supprimer = async b => { await deleteDoc(doc(db, BALISE_COLLECTION, b.id)); setOuverte(null) }

  const chargement = balises === null || demandes === null || magasinsDocs === null

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main id="contenu" tabIndex={-1} className="focus:outline-none flex-1 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Balises de diagnostic</h1>
              <p className="text-sm text-gray-500 dark:text-neutral-400">Les balises du groupe, magasin par magasin. Demande celle dont tu as besoin au magasin qui l’a.</p>
            </div>
            {gestion && <button type="button" className={BTN_PRIMARY} onClick={() => setForm({})}>+ Nouvelle balise</button>}
          </div>
          {erreur && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{erreur}</p>}

          {aFaire.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">À faire ({aFaire.length})</h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {aFaire.map(d => <DemandeCarte key={d.id} d={d} magasinId={monMagasin} global={global} onAction={agir} />)}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Où sont les balises ?</h2>
              <div className="relative w-full sm:w-72">
                <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-neutral-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
                <input type="search" className="Input !pl-9" value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="Balise, n° de série ou magasin…" aria-label="Chercher une balise ou un magasin" />
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-neutral-400">Clique sur une balise pour la demander. Bordure violette : en route vers le magasin indiqué.</p>
            {tousTypes.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par type">
                {[null, ...tousTypes].map(t => (
                  <button key={t || 'tous'} type="button" onClick={() => setFiltreType(t)} aria-pressed={filtreType === t}
                    className={`h-7 px-2.5 rounded-full text-xs font-semibold border ${filtreType === t ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                    {t || 'Toutes'}
                  </button>
                ))}
              </div>
            )}

            {chargement ? <p className="text-sm text-gray-500 dark:text-neutral-400 py-8 text-center">Chargement…</p>
              : !(balises || []).length ? (
                <p className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700 text-sm text-gray-500 dark:text-neutral-400 py-10 text-center">
                  Aucune balise enregistrée.{gestion ? ' Ajoute la première avec « + Nouvelle balise ».' : ' L’acheteur cycle ou l’administrateur les ajoutera ici.'}
                </p>
              ) : !types.length ? (
                <p className="text-sm text-gray-500 dark:text-neutral-400 py-8 text-center">Aucune balise ne correspond à « {recherche.trim()} ».</p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {tuiles.map(m => {
                    const moi = m.id === monMagasin
                    return (
                      <li key={m.id} className={`min-h-[7.5rem] rounded-lg border bg-white dark:bg-neutral-900 p-3 flex flex-col gap-2 ${moi
                        ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-neutral-800'}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.nom}</h3>
                          {moi && <span className="shrink-0 text-[11px] text-gray-500 dark:text-neutral-400">toi</span>}
                        </div>
                        {m.balises.length ? (
                          <div className="flex flex-wrap gap-1">
                            {m.balises.map(b => {
                              const d = actives.get(b.id), part = enTransfert(d)
                              const label = sansAccents(b.nom).includes(sansAccents(b.type)) ? b.nom : `${b.type} ${b.nom}`
                              return (
                                <button key={b.id} type="button" onClick={() => setOuverte(b.id)} title={nomBalise(b)}
                                  className={`max-w-full truncate px-1.5 py-0.5 rounded border text-xs text-gray-800 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800 ${part
                                    ? 'border-violet-400 dark:border-violet-400/70' : filtreActif ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-neutral-600'}`}>
                                  {label}{part && <span className="text-violet-700 dark:text-violet-300"> → {d.toMagasinNom}</span>}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-neutral-500">{filtreActif ? '—' : 'Aucune balise'}</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
          </section>

          {autres.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Demandes en cours ({autres.length})</h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {autres.map(d => <DemandeCarte key={d.id} d={d} magasinId={monMagasin} global={global} onAction={agir} />)}
              </ul>
            </section>
          )}
          {recentes.length > 0 && (
            <details className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-neutral-200">Terminées ces {RECENTES_JOURS} derniers jours ({recentes.length})</summary>
              <ul className="mt-2 divide-y divide-gray-100 dark:divide-neutral-800 text-xs">
                {recentes.map(d => (
                  <li key={d.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-gray-700 dark:text-neutral-300">{d.baliseNom} · {d.fromMagasinNom} → {d.toMagasinNom}</span>
                    <Pill className={(DEMANDE_STATUTS[d.status] || DEMANDE_STATUTS.completed).pill}>{(DEMANDE_STATUTS[d.status] || DEMANDE_STATUTS.completed).label}</Pill>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </main>

      {balise && (
        <BaliseFiche b={balise} demande={actives.get(balise.id)} profile={profile} gestion={gestion}
          historique={(demandes || []).filter(d => d.baliseId === balise.id && d.status === 'completed')
            .sort((a, b) => (toDate(b.receivedAt)?.getTime() || 0) - (toDate(a.receivedAt)?.getTime() || 0))}
          onClose={() => setOuverte(null)} onDemander={demander}
          onModifier={b => setForm(b)} />
      )}
      {form && (
        <BaliseForm balise={form.id ? form : null} magasins={magasins} types={tousTypes}
          onClose={() => setForm(null)} onSave={enregistrer} onDelete={supprimer} />
      )}
    </div>
  )
}
