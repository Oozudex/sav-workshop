// Listes communes des budgets : univers et magasins (ajout, modification, ordre, suppression)
import { useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, IconButton, Modal, Notice, Section } from '../admin/ui'
import { normLabel } from '../../lib/budgets'
import { addListItem, removeListItem, seedList, swapListItems, updateListItem } from '../../lib/budgetsStore'

const INPUT = 'w-full h-9 px-3 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20'

const KINDS = {
  univers: {
    title: 'Univers',
    hint: 'Une ligne de la base dont le nom est un univers ouvre cet univers ; les lignes suivantes sont ses segments.',
    seedLabel: 'Créer les 41 univers par défaut',
    empty: { nom: '' },
  },
  magasins: {
    title: 'Magasins',
    hint: 'Le code base (ex. CHY 227/0) et les autres noms (ex. LA FERTE BERNARD) servent à reconnaître le magasin dans les fichiers.',
    seedLabel: 'Créer les 10 magasins par défaut',
    empty: { nom: '', code: '', alias: [] },
  },
}

function ItemForm({ kind, item, list, onClose }) {
  const [form, setForm] = useState({ ...item, alias: (item.alias || []).join(', ') })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    const nom = form.nom.trim().toUpperCase()
    if (!nom) return setError('Le nom est obligatoire.')
    if (list.some(x => x.id !== item.id && normLabel(x.nom) === normLabel(nom))) return setError(`« ${nom} » existe déjà.`)
    const data = kind === 'univers' ? { nom } : {
      nom,
      code: form.code.trim().toUpperCase(),
      alias: form.alias.split(',').map(a => a.trim().toUpperCase()).filter(Boolean),
    }
    setBusy(true)
    try {
      if (item.id) await updateListItem(kind, item.id, data)
      else await addListItem(kind, data, Math.max(0, ...list.map(x => x.ordre || 0)) + 1)
      onClose()
    } catch (err) {
      setError(`Enregistrement impossible : ${err.message}`)
      setBusy(false)
    }
  }

  const label = kind === 'univers' ? 'univers' : 'magasin'
  return (
    <Modal title={item.id ? `Modifier le ${label}` : `Ajouter un ${label}`} onClose={onClose}
      footer={<>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mr-auto">{error}</p>}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" form="budget-list-form" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}>
      <form id="budget-list-form" onSubmit={submit} className="space-y-4">
        <Field label="Nom">
          <input autoFocus value={form.nom} onChange={e => set('nom', e.target.value)} className={`${INPUT} uppercase`} />
        </Field>
        {kind === 'magasins' && <>
          <Field label="Code dans la base budget" hint="Tel qu'écrit dans la colonne Magasin, ex. CHY 227/0">
            <input value={form.code} onChange={e => set('code', e.target.value)} className={`${INPUT} uppercase`} />
          </Field>
          <Field label="Autres noms" hint="Séparés par des virgules, ex. LA FERTE BERNARD, 00458/000 - LA FERTE BERNARD">
            <input value={form.alias} onChange={e => set('alias', e.target.value)} className={`${INPUT} uppercase`} />
          </Field>
        </>}
      </form>
    </Modal>
  )
}

export default function ListEditor({ kind, list, loading }) {
  const meta = KINDS[kind]
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try { await fn() } catch (err) { setNotice({ tone: 'error', text: err.message }) }
    setBusy(false)
  }

  function remove(item) {
    if (!confirm(`Supprimer « ${item.nom} » ? Les budgets existants ne sont pas modifiés.`)) return
    run(() => removeListItem(kind, item.id))
  }

  return (
    <Section title={meta.title} count={list.length} hint={meta.hint}
      action={<button type="button" onClick={() => setEditing(meta.empty)} className={BTN_PRIMARY}>Ajouter</button>}>
      {notice && <div className="p-3"><Notice notice={notice} onClose={() => setNotice(null)} /></div>}
      {loading ? (
        <p className="px-4 py-6 text-xs text-gray-500 dark:text-neutral-400">Chargement…</p>
      ) : list.length === 0 ? (
        <EmptyState title={`Aucun ${kind === 'univers' ? 'univers' : 'magasin'}`} text="La liste est vide."
          action={<button type="button" disabled={busy} onClick={() => run(() => seedList(kind))} className={BTN_SECONDARY}>{meta.seedLabel}</button>} />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
          {list.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 px-4 py-2">
              <span className="w-6 text-[11px] text-gray-400 dark:text-neutral-500 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{item.nom}</p>
                {kind === 'magasins' && (
                  <p className="text-[11px] text-gray-500 dark:text-neutral-400 truncate">
                    {item.code || 'Sans code'}{item.alias?.length ? ` · ${item.alias.join(', ')}` : ''}
                  </p>
                )}
              </div>
              <IconButton icon="up" label={`Monter ${item.nom}`} disabled={busy || i === 0} onClick={() => run(() => swapListItems(kind, item, list[i - 1]))} />
              <IconButton icon="down" label={`Descendre ${item.nom}`} disabled={busy || i === list.length - 1} onClick={() => run(() => swapListItems(kind, item, list[i + 1]))} />
              <IconButton icon="edit" label={`Modifier ${item.nom}`} onClick={() => setEditing(item)} />
              <IconButton icon="delete" danger label={`Supprimer ${item.nom}`} onClick={() => remove(item)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <ItemForm kind={kind} item={editing} list={list} onClose={() => setEditing(null)} />}
    </Section>
  )
}
