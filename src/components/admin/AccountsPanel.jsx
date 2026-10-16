// Administration → Comptes : direction (administrateurs), acheteurs, directeurs de magasin
import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../lib/firebase'
import { ACHETEUR_SERVICES, DIRECTION_ROLES } from '../../lib/constants'
import { EMAIL_RE, accountError, afterCreateMessage, createAuthAccount } from '../../lib/accounts'
import { useBudgetUnivers, useBudgets } from '../../lib/budgetsStore'
import { segmentsAuChoix, segmentsCatalog, universLabel } from '../../lib/budgets'
import { UniversChoice } from '../UniversUI'
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
function AccountModal({ kind, account, me, magasins, admins, universList, segmentsParUnivers, acheteurs, onClose, onDone }) {
  const editing = !!account
  const isSelf = account?.id === me
  const [form, setForm] = useState({
    nom: account?.displayName || '',
    email: account?.email || '',
    role: account?.role || 'directeurgen',
    rayons: (account?.rayons || []).filter(r => ACHETEUR_SERVICES.some(s => s.rayon === r)),
    univers: account?.univers || [],
    universSegments: account?.universSegments || {},
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
      // Segments retenus seulement pour un univers coché et pas tous ses segments au choix (« Les deux » = rien)
      const universSegments = Object.fromEntries(Object.entries(form.universSegments).filter(([u, l]) =>
        form.univers.includes(u) && l.length && l.length < segmentsAuChoix(u, segmentsParUnivers.get(u) || []).length))
      const acheteur = { rayons: form.rayons, univers: form.univers, universSegments }
      const extra = kind === 'acheteur' ? acheteur
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
          ...(kind === 'acheteur' ? acheteur : {}),
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
      onClose={onClose} size={kind === 'acheteur' ? 'max-w-2xl' : undefined}
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

        {kind === 'acheteur' && <>
          <UniversPicker list={universList} value={form.univers} onChange={v => set('univers', v)}
            segmentsParUnivers={segmentsParUnivers} segments={form.universSegments} onSegments={v => set('universSegments', v)}
            autres={acheteurs.filter(a => a.id !== account?.id && a.isActive !== false)} />
          <ServicesPicker value={form.rayons} onChange={v => set('rayons', v)} />
        </>}

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

/* ── Acheteur : univers (budgets) et autres services ───────────────────── */
const ICONS_SERVICE = {
  velo: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437',
  chaussure: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
  caisse: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
}

function PickerHeader({ title, hint, count, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {count != null && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400 tabular-nums">{count}</span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5">{hint}</p>
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  )
}

// Univers attitrés : marques et saisie des budgets, « Mes univers » des pages B2B et Services. Un univers
// partagé entre deux acheteurs (TEXTILE, TRAINING) se limite à un segment ou garde les deux.
function UniversPicker({ list, value, onChange, segmentsParUnivers, segments, onSegments, autres }) {
  const all = list.length > 0 && list.every(u => value.includes(u.nom))
  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 dark:border-neutral-800 p-3 sm:p-4">
      <PickerHeader title="Univers" count={`${value.length}/${list.length}`}
        hint="Budgets : l’acheteur gère les marques de ses univers. B2B et Services : il voit d’abord ceux de ses univers."
        actions={list.length > 0 && (
          <button type="button" onClick={() => onChange(all ? [] : list.map(u => u.nom))} className={BTN_SECONDARY}>
            {all ? 'Tout décocher' : 'Tout cocher'}
          </button>
        )} />
      <UniversChoice names={list.map(u => u.nom)} value={value} onChange={onChange} label="Univers de l’acheteur" />
      <SegmentsChoice univers={value} segmentsParUnivers={segmentsParUnivers} value={segments} onChange={onSegments} autres={autres} />
    </section>
  )
}

// Pour chaque univers coché partagé par segment (TEXTILE : LOISIR / MULTISPORT, TRAINING : HABILLEMENT /
// CHAUSSURES) : l'un, l'autre ou les deux
function SegmentsChoice({ univers, segmentsParUnivers, value, onChange, autres }) {
  const rows = univers.map(u => ({ u, choix: segmentsAuChoix(u, segmentsParUnivers.get(u) || []) })).filter(r => r.choix.length)
  if (!rows.length) return null
  const pick = (u, l) => onChange({ ...value, [u]: l })
  return (
    <div className="space-y-2 rounded-xl bg-gray-50 dark:bg-neutral-800/40 p-3">
      <p className="text-[11px] text-gray-600 dark:text-neutral-300">
        Ces univers sont partagés par segment : choisis ce que gère cet acheteur.
      </p>
      {rows.map(({ u, choix }) => {
        const cur = (value[u] || []).filter(x => choix.includes(x))
        const deux = !cur.length || cur.length === choix.length
        const chez = autres.filter(a => (a.univers || []).includes(u)).map(a => `${a.displayName || a.email} (${a.universSegments?.[u]?.join(', ') || 'les deux'})`)
        const opts = [...choix.map(c => [c, [c], !deux && cur[0] === c]), ['Les deux', [], deux]]
        return (
          <div key={u} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-semibold text-gray-900 dark:text-white w-44">{u}</span>
            <div role="radiogroup" aria-label={`Segments de ${u}`} className="inline-flex gap-1">
              {opts.map(([label, l, on]) => (
                <button key={label} type="button" role="radio" aria-checked={on} onClick={() => pick(u, l)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold border ${on
                    ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                    : 'border-gray-200 text-gray-700 hover:bg-white dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                  {label === 'Les deux' ? label : label.charAt(0) + label.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {chez.length > 0 && <span className="text-[11px] text-gray-500 dark:text-neutral-400">Aussi chez : {chez.join(' · ')}</span>}
          </div>
        )
      })}
    </div>
  )
}

// Autres services : accès aux outils des rayons (Cycle, Flocage, Caisse)
function ServicesPicker({ value, onChange }) {
  const toggle = r => onChange(value.includes(r) ? value.filter(x => x !== r) : [...value, r])
  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 dark:border-neutral-800 p-3 sm:p-4">
      <PickerHeader title="Autres services" hint="Outils de l’accueil accessibles en plus des budgets." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ACHETEUR_SERVICES.map(s => {
          const on = value.includes(s.rayon)
          return (
            <label key={s.rayon} className={['flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors',
              on ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white'
                : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800'].join(' ')}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(s.rayon)} />
              <span className={`p-1.5 rounded-lg shrink-0 ${on ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS_SERVICE[s.rayon]} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">{s.label}</span>
                <span className="block text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">{s.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

/* ── Ligne d'un compte ─────────────────────────────────────────────────── */
function AccountRow({ account, dark, tags, isMe, onEdit, onDelete, onResetDoubleAuth }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={account.displayName} dark={dark} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{account.displayName || '—'}</p>
          {isMe && <span className="text-[10px] font-semibold text-gray-500 dark:text-neutral-400">· vous</span>}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400 break-all">{account.email}</p>
        {tags && <div className="flex flex-wrap gap-1 mt-1">{tags}</div>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ResendButton email={account.email} />
        {onResetDoubleAuth && (
          <IconButton icon="shield" label={`Réinitialiser la double authentification de ${account.displayName}`} onClick={onResetDoubleAuth} />
        )}
        <IconButton icon="edit" label={`Modifier ${account.displayName}`} onClick={onEdit} />
        {onDelete && <IconButton icon="delete" danger label={`Supprimer ${account.displayName}`} onClick={onDelete} />}
      </div>
    </li>
  )
}

const serviceLabel = r => ACHETEUR_SERVICES.find(s => s.rayon === r)?.label

// « 3 univers » (liste complète au survol), « Tous les univers » ou « Aucun univers »
function UniversTag({ acheteur, total }) {
  const univers = acheteur.univers || []
  if (!univers.length) return <Tag dot="bg-amber-400">Aucun univers</Tag>
  const labels = univers.map(u => universLabel(acheteur, u))
  const partiel = univers.some(u => acheteur.universSegments?.[u]?.length)
  const label = total && univers.length >= total && !partiel ? 'Tous les univers'
    : univers.length <= 2 ? labels.join(' · ') : `${univers.length} univers`
  return <span title={labels.join(', ')}><Tag dot="bg-violet-500">{label}</Tag></span>
}

/* ── Panneau ───────────────────────────────────────────────────────────── */
export default function AccountsPanel({ me, isAdmin, magasins }) {
  const direction = useUsers(DIRECTION_ROLES, isAdmin, false)
  const acheteurs = useUsers(['acheteur'], true)
  const directeurs = useUsers(['directeurmag'], true)
  const { list: universList } = useBudgetUnivers()
  const { list: budgets } = useBudgets()
  // Segments de chaque univers (tous budgets) : choix LOISIR / MULTISPORT des univers partagés
  const segmentsParUnivers = useMemo(() => {
    const m = new Map()
    for (const sg of segmentsCatalog(budgets)) m.set(sg.univers, [...(m.get(sg.univers) || []), sg.nom || ''])
    return m
  }, [budgets])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { kind, account? }
  const [notice, setNotice] = useState(null)

  const magasinNom = id => magasins.find(m => m.id === id)?.nom
  const match = a => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [a.displayName, a.email, magasinNom(a.magasinId), ...(a.rayons || []).map(serviceLabel), ...(a.univers || [])]
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

  // Téléphone perdu : l'application d'authentification est retirée (Cloud Function, administrateurs)
  async function resetDoubleAuth(account) {
    if (!confirm(`Réinitialiser la double authentification de ${account.displayName} ?\n\n`
      + 'Ses sessions sont fermées. À sa prochaine connexion, il configurera une nouvelle application d’authentification.')) return
    try {
      await httpsCallable(functions, 'reinitialiserDoubleAuth')({ uid: account.id })
      setNotice({ tone: 'ok', text: `Double authentification de ${account.displayName} réinitialisée.` })
    } catch (err) {
      setNotice({ tone: 'error', text: err?.message || 'Réinitialisation impossible. Réessaie.' })
    }
  }
  const resetPour = a => (isAdmin ? () => resetDoubleAuth(a) : null)

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
          onDelete={a.id === me ? null : () => remove(a, DIRECTION_LABELS[a.role])} onResetDoubleAuth={resetPour(a)} />
      ),
      empty: 'Aucun compte de direction.',
    },
    {
      kind: 'acheteur', title: 'Acheteurs', hint: 'Voient tous les magasins ; budgets sur leurs univers, outils de leurs autres services',
      items: acheteurs.filter(match),
      row: a => (
        <AccountRow key={a.id} account={a} isMe={a.id === me}
          tags={<>
            <UniversTag acheteur={a} total={universList.length} />
            {(a.rayons || []).filter(serviceLabel).map(r => <Tag key={r}>{serviceLabel(r)}</Tag>)}
          </>}
          onEdit={() => setModal({ kind: 'acheteur', account: a })}
          onDelete={() => remove(a, 'acheteur')} onResetDoubleAuth={resetPour(a)} />
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
          <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-neutral-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
          <input className="Input h-9 !pl-9 text-sm" placeholder="Rechercher un nom, un e-mail, un magasin…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher un compte" />
        </div>
        <p className="text-[11px] text-gray-500 dark:text-neutral-400 sm:ml-auto">
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
        <AccountModal kind={modal.kind} account={modal.account} me={me} magasins={magasins} admins={admins} universList={universList}
          segmentsParUnivers={segmentsParUnivers} acheteurs={acheteurs}
          onClose={() => setModal(null)} onDone={setNotice} />
      )}
    </div>
  )
}
