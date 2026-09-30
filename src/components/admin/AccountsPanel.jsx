// Administration → Comptes : direction (administrateurs), acheteurs, directeurs de magasin
import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { DIRECTION_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../../lib/constants'
import { EMAIL_RE, accountError, afterCreateMessage, createAuthAccount } from '../../lib/accounts'
import {
  Avatar, BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, IconButton, INVALID, LABEL, Modal, Notice, ResendButton, Section, Tag,
} from './ui'

const DIRECTION_LABELS = { admin: 'Administrateur', directeurgen: 'Directeur général' }
const DIRECTION_HINTS = {
  admin: 'Tous les droits, dont la création des comptes de direction.',
  directeurgen: 'Voit tous les magasins ; gère magasins, acheteurs et directeurs de magasin.',
}
const KIND_LABELS = { direction: 'Compte de direction', acheteur: 'Acheteur', directeurmag: 'Directeur de magasin' }

function useUsers(roles, enabled, order = true) {
  const [list, setList] = useState([])
  const key = roles.join(',')
  useEffect(() => {
    if (!enabled) { setList([]); return }
    const base = collection(db, 'users')
    const q = roles.length > 1 ? query(base, where('role', 'in', roles))
      : order ? query(base, where('role', '==', roles[0]), orderBy('createdAt', 'desc')) : query(base, where('role', '==', roles[0]))
    return onSnapshot(q, snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    // roles est une liste constante (clé = key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, order])
  return list
}

/* ── Fenêtre de création / modification d'un compte ─────────────────────── */
function AccountModal({ kind, account, me, magasins, admins, onClose, onDone }) {
  const editing = !!account
  const isSelf = account?.id === me
  const [form, setForm] = useState({
    nom: account?.displayName || '',
    email: account?.email || '',
    role: account?.role || 'directeurgen',
    rayons: account?.rayons || [],
    magasinId: account?.magasinId || '',
  })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const errors = {}
  if (!form.nom.trim()) errors.nom = 'Le nom est obligatoire.'
  if (!editing && !EMAIL_RE.test(form.email.trim())) errors.email = 'Adresse e-mail invalide.'
  if (kind === 'directeurmag' && !form.magasinId) errors.magasinId = 'Choisis le magasin.'
  const shown = tried ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTried(true); setError('')
    if (Object.keys(errors).length) return
    if (kind === 'direction' && editing && account.role === 'admin' && form.role !== 'admin'
      && !admins.some(a => a.id !== account.id && a.isActive !== false)) {
      return setError('Il doit rester au moins un administrateur.')
    }
    setBusy(true)
    try {
      const nom = form.nom.trim()
      const extra = kind === 'acheteur' ? { rayons: form.rayons }
        : kind === 'directeurmag' ? { magasinId: form.magasinId }
          : { role: isSelf ? account.role : form.role }
      if (editing) {
        await updateDoc(doc(db, 'users', account.id), { displayName: nom, ...extra, updatedAt: serverTimestamp() })
        onDone({ tone: 'ok', text: `${nom} mis à jour.` })
      } else {
        const email = form.email.trim()
        const uid = await createAuthAccount(email, nom)
        await setDoc(doc(db, 'users', uid), {
          displayName: nom, email,
          role: kind === 'direction' ? form.role : kind,
          magasinId: kind === 'directeurmag' ? form.magasinId : null,
          ...(kind === 'acheteur' ? { rayons: form.rayons } : {}),
          isActive: true, createdAt: serverTimestamp(), createdBy: me,
        })
        onDone(await afterCreateMessage(kind === 'direction' ? DIRECTION_LABELS[form.role] : KIND_LABELS[kind], email))
      }
      onClose()
    } catch (err) {
      setError(accountError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Modifier ${account.displayName || 'le compte'}` : `Nouveau · ${KIND_LABELS[kind]}`}
      subtitle={editing ? account.email : 'La personne reçoit un e-mail pour choisir son mot de passe.'}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" form="account-form" disabled={busy} className={BTN_PRIMARY}>
          {busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le compte'}
        </button>
      </>}>
      <form id="account-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom" error={shown.nom}>
            <input className={`Input ${shown.nom ? INVALID : ''}`} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Prénom Nom" autoFocus />
          </Field>
          <Field label="E-mail de connexion" error={shown.email} hint={editing ? 'Non modifiable' : null}>
            <input type="email" className={`Input ${shown.email ? INVALID : ''}`} value={form.email} disabled={editing}
              onChange={e => set('email', e.target.value)} placeholder="prenom.nom@exemple.com" autoComplete="off" />
          </Field>
        </div>

        {kind === 'direction' && !isSelf && (
          <div className="space-y-1.5">
            <span className={LABEL}>Rôle</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {['directeurgen', 'admin'].map(r => (
                <label key={r} className={['flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors',
                  form.role === r ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800'].join(' ')}>
                  <input type="radio" name="account-role" className="mt-0.5 accent-gray-900 dark:accent-white" checked={form.role === r} onChange={() => set('role', r)} />
                  <span>
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">{DIRECTION_LABELS[r]}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">{DIRECTION_HINTS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {kind === 'acheteur' && (
          <div className="space-y-1.5">
            <span className={LABEL}>Rayons attitrés</span>
            <div className="flex flex-wrap gap-1.5">
              {RAYON_TYPES.map(r => {
                const on = form.rayons.includes(r)
                return (
                  <button key={r} type="button" onClick={() => set('rayons', on ? form.rayons.filter(x => x !== r) : [...form.rayons, r])}
                    aria-pressed={on}
                    className={['h-8 px-3 rounded-lg border text-xs font-semibold transition-colors',
                      on ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800'].join(' ')}>
                    {RAYON_TYPE_LABELS[r]}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">Sans rayon coché, l’acheteur n’a accès à aucun outil de rayon.</p>
          </div>
        )}

        {kind === 'directeurmag' && (
          <Field label="Magasin" error={shown.magasinId}>
            <select className={`Input ${shown.magasinId ? INVALID : ''}`} value={form.magasinId} onChange={e => set('magasinId', e.target.value)}>
              <option value="">— Choisir le magasin</option>
              {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </Field>
        )}

        {error && <Notice notice={{ tone: 'error', text: error }} />}
      </form>
    </Modal>
  )
}

/* ── Ligne d'un compte ─────────────────────────────────────────────────── */
function AccountRow({ account, dark, tags, isMe, onEdit, onDelete }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={account.displayName} dark={dark} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{account.displayName || '—'}</p>
          {isMe && <span className="text-[10px] font-semibold text-gray-400">· vous</span>}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-neutral-500 break-all">{account.email}</p>
        {tags && <div className="flex flex-wrap gap-1 mt-1">{tags}</div>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ResendButton email={account.email} />
        <IconButton icon="edit" label={`Modifier ${account.displayName}`} onClick={onEdit} />
        {onDelete && <IconButton icon="delete" danger label={`Supprimer ${account.displayName}`} onClick={onDelete} />}
      </div>
    </li>
  )
}

/* ── Panneau ───────────────────────────────────────────────────────────── */
export default function AccountsPanel({ me, isAdmin, magasins }) {
  const direction = useUsers(DIRECTION_ROLES, isAdmin, false)
  const acheteurs = useUsers(['acheteur'], true)
  const directeurs = useUsers(['directeurmag'], true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { kind, account? }
  const [notice, setNotice] = useState(null)

  const magasinNom = id => magasins.find(m => m.id === id)?.nom
  const match = a => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [a.displayName, a.email, magasinNom(a.magasinId), ...(a.rayons || []).map(r => RAYON_TYPE_LABELS[r])]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)
  }
  const sortedDirection = useMemo(() => [...direction].sort((a, b) =>
    a.role === b.role ? (a.displayName || '').localeCompare(b.displayName || '') : a.role === 'admin' ? -1 : 1), [direction])
  const admins = direction.filter(a => a.role === 'admin')

  async function remove(account, label) {
    if (!confirm(`Supprimer le compte de ${account.displayName} (${label}) ? Il n’aura plus accès à l’outil.`)) return
    try {
      await deleteDoc(doc(db, 'users', account.id))
      setNotice({ tone: 'ok', text: `Compte de ${account.displayName} supprimé.` })
    } catch (err) { setNotice({ tone: 'error', text: accountError(err) }) }
  }

  const add = kind => (
    <button onClick={() => { setNotice(null); setModal({ kind }) }} className={BTN_PRIMARY}>+ Ajouter</button>
  )
  const lists = [
    isAdmin && {
      kind: 'direction', title: 'Direction', hint: 'Administrateurs et directeurs généraux · visible des administrateurs uniquement',
      items: sortedDirection.filter(match),
      row: a => (
        <AccountRow key={a.id} account={a} dark={a.role === 'admin'} isMe={a.id === me}
          tags={<Tag dark={a.role === 'admin'}>{DIRECTION_LABELS[a.role]}</Tag>}
          onEdit={() => setModal({ kind: 'direction', account: a })}
          onDelete={a.id === me ? null : () => remove(a, DIRECTION_LABELS[a.role])} />
      ),
      empty: 'Aucun compte de direction.',
    },
    {
      kind: 'acheteur', title: 'Acheteurs', hint: 'Voient tous les magasins, sur leurs rayons attitrés',
      items: acheteurs.filter(match),
      row: a => (
        <AccountRow key={a.id} account={a} isMe={a.id === me}
          tags={a.rayons?.length ? a.rayons.map(r => <Tag key={r}>{RAYON_TYPE_LABELS[r] || r}</Tag>) : <Tag dot="bg-amber-400">Aucun rayon</Tag>}
          onEdit={() => setModal({ kind: 'acheteur', account: a })}
          onDelete={() => remove(a, 'acheteur')} />
      ),
      empty: 'Aucun acheteur.',
    },
    {
      kind: 'directeurmag', title: 'Directeurs de magasin', hint: 'Gèrent les rayons et l’équipe de leur magasin',
      items: directeurs.filter(match),
      row: a => (
        <AccountRow key={a.id} account={a} isMe={a.id === me}
          tags={magasinNom(a.magasinId) ? <Tag>{magasinNom(a.magasinId)}</Tag> : <Tag dot="bg-amber-400">Aucun magasin</Tag>}
          onEdit={() => setModal({ kind: 'directeurmag', account: a })}
          onDelete={() => remove(a, 'directeur de magasin')} />
      ),
      empty: 'Aucun directeur de magasin.',
    },
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
          <input className="Input h-9 !pl-9 text-sm" placeholder="Rechercher un nom, un e-mail, un magasin…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher un compte" />
        </div>
        <p className="text-[11px] text-gray-400 dark:text-neutral-500 sm:ml-auto">
          Les comptes des rayons se gèrent dans l’onglet Magasins.
        </p>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {lists.map(l => (
          <Section key={l.kind} title={l.title} count={l.items.length} hint={l.hint} action={add(l.kind)}
            className={l.kind === 'direction' ? 'xl:col-span-2' : ''}>
            {l.items.length
              ? <ul className="divide-y divide-gray-100 dark:divide-neutral-800">{l.items.map(l.row)}</ul>
              : <EmptyState title={q ? 'Aucun résultat' : l.empty} />}
          </Section>
        ))}
      </div>

      {modal && (
        <AccountModal kind={modal.kind} account={modal.account} me={me} magasins={magasins} admins={admins}
          onClose={() => setModal(null)} onDone={setNotice} />
      )}
    </div>
  )
}
