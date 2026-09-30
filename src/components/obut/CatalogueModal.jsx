// Catalogue OBUT : l'acheteur ajoute, modifie et supprime les boules et les services (marquages, livraison…).
// Les commandes déjà enregistrées gardent leurs prix.
import { useState } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatEuro, parseEuro } from '../../lib/orders'
import { DEFAULT_CATALOGUE, catalogueByKind, catalogueItemErrors } from '../../lib/obut'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, INVALID, IconButton, Modal, Notice, Tag } from '../admin/ui'

const TABS = [
  { key: 'boules', label: 'Boules', kinds: ['boule'], add: '+ Ajouter une boule', empty: 'Aucune boule au catalogue.' },
  { key: 'services', label: 'Services', kinds: ['marquage', 'option'], add: '+ Ajouter un service', empty: 'Aucun service au catalogue.' },
]
const SERVICE_KINDS = [
  { value: 'marquage', label: 'Marquage', hint: 'Un seul par commande, avec le texte à graver' },
  { value: 'option', label: 'Service', hint: 'Livraison, etc. : cochés à la commande' },
]

const moneyInput = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','))

function EditRow({ draft, setDraft, isService, onSave, onCancel, busy }) {
  const [tried, setTried] = useState(false)
  const errors = tried ? catalogueItemErrors(draft) : {}
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  function submit(e) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(catalogueItemErrors(draft)).length) return
    onSave()
  }
  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-gray-300 dark:border-neutral-600 bg-gray-50/60 dark:bg-neutral-800/40 p-3 space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <label className="space-y-1 min-w-0">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom</span>
          <input className={`Input text-sm ${errors.label ? INVALID : ''}`} value={draft.label} autoFocus
            onChange={e => set('label', e.target.value)} placeholder={isService ? 'Ex. Livraison' : 'Ex. ATX'} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Prix TTC</span>
          <div className="relative">
            <input className={`Input text-sm !pr-6 text-right tabular-nums ${errors.prix ? INVALID : ''}`} inputMode="decimal"
              value={draft.prix} onChange={e => set('prix', e.target.value)} placeholder="0,00" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
          </div>
        </label>
      </div>
      {(errors.label || errors.prix) && <p className="text-[11px] text-red-600 dark:text-red-400">{errors.label || errors.prix}</p>}

      {isService && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="grid grid-cols-2 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden divide-x divide-gray-200 dark:divide-neutral-700 sm:w-56 shrink-0">
            {SERVICE_KINDS.map(k => (
              <button key={k.value} type="button" onClick={() => set('kind', k.value)} title={k.hint}
                className={['h-8 px-2 text-xs font-semibold transition-colors', draft.kind === k.value
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'].join(' ')}>
                {k.label}
              </button>
            ))}
          </div>
          {draft.kind === 'option' ? (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-neutral-300">
              <input type="checkbox" className="h-4 w-4 accent-gray-900 dark:accent-white" checked={!!draft.parDefaut}
                onChange={e => set('parDefaut', e.target.checked)} />
              Coché par défaut sur les nouvelles commandes
            </label>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">Un seul marquage par commande, avec le texte à graver.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

export default function CatalogueModal({ items, onClose }) {
  // Tant que rien n'est enregistré, on affiche (et on enregistre au premier changement) le catalogue d'origine
  const seeded = items.length > 0
  const catalogue = seeded ? items : DEFAULT_CATALOGUE
  const byKind = catalogueByKind(catalogue)

  const [tab, setTab] = useState('boules')
  const [editing, setEditing] = useState(null) // id, ou 'new'
  const [draft, setDraft] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const current = TABS.find(t => t.key === tab)
  const isService = tab === 'services'
  const rows = current.kinds.flatMap(k => byKind[k])

  function switchTab(key) { setTab(key); setEditing(null); setConfirmId(null); setNotice(null) }

  function startEdit(item) {
    setConfirmId(null)
    setEditing(item?.id || 'new')
    setDraft(item
      ? { kind: item.kind, label: item.label, prix: moneyInput(item.prix), parDefaut: !!item.parDefaut }
      : { kind: isService ? 'option' : 'boule', label: '', prix: '', parDefaut: false })
  }

  async function write(apply, okText) {
    setBusy(true); setNotice(null)
    try {
      const batch = writeBatch(db)
      if (!seeded) {
        DEFAULT_CATALOGUE.forEach(({ id, ...data }) =>
          batch.set(doc(db, 'obut_catalogue', id), { ...data, createdAt: serverTimestamp() }))
      }
      apply(batch)
      await batch.commit()
      setEditing(null); setConfirmId(null)
      setNotice({ tone: 'ok', text: okText })
    } catch (e) {
      setNotice({ tone: 'error', text: e.code === 'permission-denied' ? 'Vous n’avez pas les droits pour modifier le catalogue.' : (e.message || 'Enregistrement impossible') })
    } finally { setBusy(false) }
  }

  function save() {
    const data = {
      kind: draft.kind, label: draft.label.trim(), prix: parseEuro(draft.prix),
      parDefaut: draft.kind === 'option' && !!draft.parDefaut, updatedAt: serverTimestamp(),
    }
    if (editing === 'new') {
      const order = Math.max(-1, ...byKind[draft.kind].map(i => i.order ?? -1)) + 1
      return write(b => b.set(doc(collection(db, 'obut_catalogue')), { ...data, order, createdAt: serverTimestamp() }),
        `« ${data.label} » ajouté au catalogue.`)
    }
    return write(b => b.set(doc(db, 'obut_catalogue', editing), data, { merge: true }), `« ${data.label} » mis à jour.`)
  }

  function remove(item) {
    return write(b => b.delete(doc(db, 'obut_catalogue', item.id)), `« ${item.label} » retiré du catalogue.`)
  }

  return (
    <Modal title="Catalogue OBUT" size="max-w-2xl" onClose={onClose}
      subtitle="Boules et services proposés à la commande, avec leur prix TTC"
      footer={<button type="button" onClick={onClose} className={BTN_PRIMARY}>Fermer</button>}>

      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800 -mt-1" role="tablist">
        {TABS.map(t => {
          const n = t.kinds.reduce((s, k) => s + byKind[k].length, 0)
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)}
              className={['h-9 px-3 -mb-px border-b-2 text-xs font-semibold transition-colors',
                tab === t.key ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-300'].join(' ')}>
              {t.label} <span className="ml-1 font-medium text-gray-400 dark:text-neutral-500">{n}</span>
            </button>
          )
        })}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="space-y-1.5">
        {rows.length === 0 && editing !== 'new' && <EmptyState title={current.empty} />}
        {rows.map(item => editing === item.id ? (
          <EditRow key={item.id} draft={draft} setDraft={setDraft} isService={isService} busy={busy}
            onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div key={item.id} className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-800 pl-3 pr-1.5 py-1.5 min-h-[2.75rem]">
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white break-words">{item.label}</span>
              {isService && <Tag>{item.kind === 'marquage' ? 'Marquage' : 'Service'}</Tag>}
              {item.parDefaut && <Tag dot="bg-emerald-500">Par défaut</Tag>}
            </div>
            {confirmId === item.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="hidden sm:inline text-[11px] text-red-600 dark:text-red-400">Retirer ?</span>
                <button type="button" onClick={() => remove(item)} disabled={busy}
                  className="h-8 sm:h-7 px-2.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">Oui</button>
                <button type="button" onClick={() => setConfirmId(null)}
                  className="h-8 sm:h-7 px-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800">Non</button>
              </div>
            ) : (
              <>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{formatEuro(item.prix)}</span>
                <IconButton icon="edit" label={`Modifier ${item.label}`} onClick={() => startEdit(item)} />
                <IconButton icon="delete" danger label={`Retirer ${item.label}`} onClick={() => { setEditing(null); setConfirmId(item.id) }} />
              </>
            )}
          </div>
        ))}
        {editing === 'new' ? (
          <EditRow draft={draft} setDraft={setDraft} isService={isService} busy={busy}
            onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <button type="button" onClick={() => startEdit(null)}
            className="w-full h-10 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:border-gray-400 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            {current.add}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
        Un changement de prix s’applique aux nouvelles commandes. Les commandes déjà enregistrées gardent leur prix.
      </p>
    </Modal>
  )
}
