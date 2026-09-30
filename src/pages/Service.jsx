// Services partenaires : lien vers le service, procédure (Google Drive) et identifiants par magasin.
// Les administrateurs ajoutent, modifient et suppriment les services et leurs identifiants.
import { useEffect, useState } from 'react'
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import Navbar from '../components/Navbar'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, INVALID, Modal, Notice } from '../components/admin/ui'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { db } from '../lib/firebase'
import { GLOBAL_ROLES } from '../lib/constants'
import { safeUrl } from '../lib/security'
import {
  EMPTY_SERVICE, credentialWrites, hasCredential, serviceAccess, serviceFormErrors, servicePayload, sortServices,
} from '../lib/services'

const COLOR = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-500/10',   icon: 'text-indigo-600 dark:text-indigo-400',   ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30',   btn: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600' },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       icon: 'text-blue-600 dark:text-blue-400',       ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',       btn: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     icon: 'text-amber-600 dark:text-amber-400',     ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',     btn: 'bg-amber-500 hover:bg-amber-600' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-500/10',       icon: 'text-rose-600 dark:text-rose-400',       ring: 'hover:ring-rose-200 dark:hover:ring-rose-500/30',       btn: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600' },
  gray:    { bg: 'bg-gray-100 dark:bg-neutral-800',      icon: 'text-gray-600 dark:text-neutral-300',    ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700',       btn: 'bg-gray-800 hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600' },
}
const COLOR_LABELS = { emerald: 'Vert', indigo: 'Indigo', blue: 'Bleu', amber: 'Ambre', rose: 'Rose', gray: 'Gris' }

/* ── Icônes ─────────────────────────────────────────────────────────────── */
const PATHS = {
  service: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
  doc: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  external: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  lockOpen: 'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  edit: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  eyeOff: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
  copy: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75',
}
function Icon({ name, className = 'h-3.5 w-3.5', strokeWidth = 1.8 }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d={PATHS[name]} />
    </svg>
  )
}

function openLink(url) {
  const safe = safeUrl(url)
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer')
}

/* ── Carte service ──────────────────────────────────────────────────────── */
function ServiceCard({ s, access, isAdmin, onEdit, onCreds }) {
  const c = COLOR[s.color] || COLOR.gray
  const hasUrl = !!safeUrl(s.url)
  const hasProc = !!safeUrl(s.procedureUrl)
  const lockOpen = access === 'mine' || access === 'all'

  return (
    <article className="group relative flex flex-col gap-4 p-4 sm:p-5 rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`p-2.5 rounded-xl ${c.bg}`}><span className={c.icon}><Icon name="service" className="h-6 w-6" strokeWidth={1.5} /></span></div>
        <div className="flex items-center gap-1.5">
          {access !== 'none' && (
            <button type="button" onClick={() => onCreds(s)}
              title={lockOpen ? (access === 'all' ? 'Identifiants des magasins' : 'Voir vos identifiants') : 'Pas d’identifiants pour votre magasin'}
              aria-label={lockOpen ? `Identifiants ${s.label}` : `Pas d’identifiants ${s.label}`}
              className={['h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded-lg border shadow-sm transition-colors',
                lockOpen
                  ? 'bg-white text-gray-600 border-gray-200 hover:text-gray-900 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:text-white'
                  : 'bg-gray-50 text-gray-300 border-dashed border-gray-300 hover:text-gray-500 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-700 dark:hover:text-neutral-400'].join(' ')}>
              <Icon name={lockOpen ? 'lockOpen' : 'lock'} strokeWidth={2} />
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => onEdit(s)} aria-label={`Modifier ${s.label}`} title="Modifier"
              className="h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded-lg border shadow-sm bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all">
              <Icon name="edit" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug break-words">{s.label}</h2>
        {s.description && <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">{s.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" onClick={() => openLink(s.url)} disabled={!hasUrl}
          className={['h-10 sm:h-9 w-full inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
            hasUrl ? `text-white ${c.btn}` : 'text-gray-400 dark:text-neutral-500 bg-gray-100 dark:bg-neutral-800 cursor-not-allowed'].join(' ')}>
          {hasUrl ? <>Accéder au service <Icon name="external" strokeWidth={2} /></> : 'Bientôt disponible'}
        </button>
        <button type="button" onClick={() => openLink(s.procedureUrl)} disabled={!hasProc}
          title={hasProc ? 'Ouvrir la procédure (Google Drive)' : 'Aucune procédure pour le moment'}
          className={['h-10 sm:h-9 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors',
            hasProc ? 'text-gray-700 border-gray-200 bg-white hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800'
              : 'text-gray-300 border-dashed border-gray-200 dark:text-neutral-600 dark:border-neutral-800 cursor-not-allowed'].join(' ')}>
          <Icon name="doc" /> {hasProc ? 'Procédure' : 'Procédure à venir'}
        </button>
      </div>
    </article>
  )
}

/* ── Création / modification (administrateurs) ─────────────────────────── */
function ServiceModal({ service, onClose, onSave, onDelete }) {
  const editing = !!service?.id
  const [form, setForm] = useState(() => ({
    ...EMPTY_SERVICE,
    ...(service?.id ? {
      label: service.label || '', description: service.description || '', url: service.url || '',
      procedureUrl: service.procedureUrl || '', color: service.color || 'emerald', usesCredentials: !!service.usesCredentials,
    } : {}),
  }))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const errors = tried ? serviceFormErrors(form) : {}
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setTried(true); setError('')
    if (Object.keys(serviceFormErrors(form)).length) return
    setBusy(true)
    try { await onSave(servicePayload(form)); onClose() }
    catch (err) { setError(err.message || 'Enregistrement impossible') }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setError('')
    try { await onDelete(service); onClose() }
    catch (err) { setError(err.message || 'Suppression impossible'); setBusy(false) }
  }

  return (
    <Modal title={editing ? 'Modifier le service' : 'Nouveau service'}
      subtitle={editing ? service.label : 'Il apparaîtra pour tous les magasins.'} onClose={onClose}
      footer={<>
        {editing && (confirmDelete ? (
          <span className="mr-auto flex items-center gap-2">
            <span className="text-[11px] text-red-600 dark:text-red-400">
              {service.credentialStoreIds?.length ? 'Supprimer le service et ses identifiants ?' : 'Supprimer ce service ?'}
            </span>
            <button type="button" onClick={remove} disabled={busy}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">Oui, supprimer</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-neutral-200">Non</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="mr-auto h-8 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">
            Supprimer
          </button>
        ))}
        {!confirmDelete && <>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
          <button type="submit" form="service-form" disabled={busy} className={BTN_PRIMARY}>
            {busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le service'}
          </button>
        </>}
      </>}>
      <form id="service-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nom *" error={errors.label}>
          <input className={`Input ${errors.label ? INVALID : ''}`} value={form.label} onChange={e => set('label', e.target.value)} placeholder="Ex. Upway" autoFocus />
        </Field>
        <Field label="Description">
          <input className="Input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex. Reprise et revente de vélos électriques" />
        </Field>
        <Field label="Lien du service" error={errors.url} hint="Vide = « Bientôt disponible ».">
          <input className={`Input ${errors.url ? INVALID : ''}`} type="url" inputMode="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Lien de la procédure (Google Drive)" error={errors.procedureUrl} hint="Pensez à partager le fichier avec les magasins dans Google Drive.">
          <input className={`Input ${errors.procedureUrl ? INVALID : ''}`} type="url" inputMode="url" value={form.procedureUrl} onChange={e => set('procedureUrl', e.target.value)} placeholder="https://drive.google.com/…" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="Couleur">
            <select className="Input" value={form.color} onChange={e => set('color', e.target.value)}>
              {Object.keys(COLOR).map(k => <option key={k} value={k}>{COLOR_LABELS[k]}</option>)}
            </select>
          </Field>
          <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 px-3 py-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gray-900 dark:accent-white" checked={form.usesCredentials} onChange={e => set('usesCredentials', e.target.checked)} />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800 dark:text-neutral-200">Identifiants par magasin</span>
              <span className="block text-[11px] text-gray-400 dark:text-neutral-500">Affiche le cadenas sur la carte.</span>
            </span>
          </label>
        </div>
        {editing && service.usesCredentials && !form.usesCredentials && service.credentialStoreIds?.length > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Le cadenas sera masqué ; les identifiants déjà saisis sont conservés et réapparaîtront si vous recochez la case.
          </p>
        )}
        {error && <Notice notice={{ tone: 'error', text: error }} />}
      </form>
    </Modal>
  )
}

/* ── Identifiants ──────────────────────────────────────────────────────── */
function CopyButton({ value, label }) {
  const [done, setDone] = useState(false)
  if (!value) return null
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* presse-papiers refusé */ }
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copier ${label}`} title={done ? 'Copié' : `Copier ${label}`}
      className={`h-8 w-8 grid place-items-center rounded-lg transition-colors ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800'}`}>
      {done ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <Icon name="copy" />}
    </button>
  )
}

function PasswordInput({ value, onChange, readOnly }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className="Input text-xs !pr-9 font-mono" type={show ? 'text' : 'password'} value={value} readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)} placeholder={readOnly ? '—' : '••••••••'} autoComplete="new-password" />
      <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300">
        <Icon name={show ? 'eyeOff' : 'eye'} strokeWidth={2} />
      </button>
    </div>
  )
}

// Administrateur : saisie pour chaque magasin. Autres globaux : lecture seule.
function AllCredentialsModal({ service, magasins, canEdit, onClose }) {
  const [creds, setCreds] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getDocs(collection(db, 'services', service.id, 'credentials'))
      .then(snap => {
        const base = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))
        setCreds(Object.fromEntries(magasins.map(m => [m.id, { login: base[m.id]?.login ?? '', password: base[m.id]?.password ?? '' }])))
      })
      .catch(e => setError(e.message || 'Chargement impossible'))
    // Chargé une seule fois à l'ouverture pour ne pas écraser une saisie en cours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id])

  const update = (id, k, v) => setCreds(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const filled = creds ? Object.values(creds).filter(hasCredential).length : 0

  // Même compte pour tout le groupe : recopie le premier magasin rempli partout
  function copyToAll() {
    const first = magasins.map(m => creds[m.id]).find(hasCredential)
    if (first) setCreds(Object.fromEntries(magasins.map(m => [m.id, { ...first }])))
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const { set, remove, storeIds } = credentialWrites(creds)
      const batch = writeBatch(db)
      set.forEach(({ magasinId, data }) => batch.set(doc(db, 'services', service.id, 'credentials', magasinId), { ...data, updatedAt: serverTimestamp() }))
      remove.forEach(magasinId => batch.delete(doc(db, 'services', service.id, 'credentials', magasinId)))
      // Liste non sensible des magasins configurés (pour le cadenas)
      batch.update(doc(db, 'services', service.id), { credentialStoreIds: storeIds, updatedAt: serverTimestamp() })
      await batch.commit()
      onClose()
    } catch (e) { setError(e.message || 'Enregistrement impossible') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Identifiants — ${service.label}`}
      subtitle={creds ? `${filled} magasin${filled > 1 ? 's' : ''} sur ${magasins.length} avec des identifiants` : 'Chargement…'}
      onClose={onClose} size="max-w-2xl"
      footer={canEdit ? <>
        <button type="button" onClick={copyToAll} disabled={!creds || filled === 0}
          title="Même compte pour tous les magasins : recopie le premier magasin rempli"
          className="mr-auto h-8 px-2 rounded-lg text-xs font-medium text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-40">
          Recopier sur tous les magasins
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={save} disabled={!creds || busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </> : <button type="button" onClick={onClose} className={BTN_PRIMARY}>Fermer</button>}>
      {!canEdit && <p className="text-[11px] text-gray-400 dark:text-neutral-500">Lecture seule : les identifiants sont gérés par les administrateurs.</p>}
      {magasins.length === 0 && <EmptyState title="Aucun magasin" text="Créez d’abord les magasins dans l’administration." />}
      {creds && (
        <div className="divide-y divide-gray-100 dark:divide-neutral-800 -my-1">
          {magasins.map(m => (
            <div key={m.id} className="py-3 grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:items-center">
              <p className="text-xs font-semibold text-gray-800 dark:text-neutral-200 flex items-center gap-1.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasCredential(creds[m.id]) ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-neutral-600'}`} />
                <span className="truncate">{m.nom}</span>
              </p>
              <input className="Input text-xs" value={creds[m.id].login} readOnly={!canEdit} aria-label={`Identifiant ${m.nom}`}
                onChange={e => update(m.id, 'login', e.target.value)} placeholder={canEdit ? 'Identifiant ou e-mail' : '—'} autoComplete="off" />
              <PasswordInput value={creds[m.id].password} readOnly={!canEdit} onChange={v => update(m.id, 'password', v)} />
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 dark:text-neutral-500">
        Chaque magasin ne voit que ses propres identifiants. Laissez vide si le service n’a pas de mot de passe.
      </p>
      {error && <Notice notice={{ tone: 'error', text: error }} />}
    </Modal>
  )
}

// Magasin : ses identifiants en lecture, avec copie
function MyCredentialsModal({ service, magasinId, onClose }) {
  const [cred, setCred] = useState(undefined)
  useEffect(() => {
    getDoc(doc(db, 'services', service.id, 'credentials', magasinId))
      .then(snap => setCred(snap.exists() ? snap.data() : null))
      .catch(() => setCred(null))
  }, [service.id, magasinId])
  const [show, setShow] = useState(false)

  return (
    <Modal title={`Identifiants — ${service.label}`} subtitle="Identifiants de votre magasin" onClose={onClose} size="max-w-sm"
      footer={<button type="button" onClick={onClose} className={BTN_PRIMARY}>Fermer</button>}>
      {cred === undefined ? <p className="text-sm text-gray-400 text-center py-2">Chargement…</p>
        : !cred ? <p className="text-sm text-gray-500 dark:text-neutral-400 text-center py-2">Aucun identifiant configuré pour votre magasin.</p>
          : (
            <div className="space-y-3">
              {[['Identifiant', cred.login, false], ['Mot de passe', cred.password, true]].map(([label, value, secret]) => (
                <div key={label} className="rounded-xl border border-gray-200 dark:border-neutral-800 pl-3 pr-1 py-1.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                      {!value ? '—' : secret && !show ? '••••••••' : value}
                    </p>
                  </div>
                  {secret && value && (
                    <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-800">
                      <Icon name={show ? 'eyeOff' : 'eye'} strokeWidth={2} />
                    </button>
                  )}
                  <CopyButton value={value} label={label.toLowerCase()} />
                </div>
              ))}
            </div>
          )}
    </Modal>
  )
}

function MissingCredentialsModal({ service, magasins, onClose }) {
  const stores = magasins.filter(m => service.credentialStoreIds?.includes(m.id))
  return (
    <Modal title={`Identifiants — ${service.label}`} onClose={onClose} size="max-w-sm"
      footer={<button type="button" onClick={onClose} className={BTN_PRIMARY}>Compris</button>}>
      <p className="text-sm text-gray-700 dark:text-neutral-200">
        Votre magasin n’a pas d’identifiants pour <span className="font-semibold">{service.label}</span>.
      </p>
      {stores.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
            {stores.length > 1 ? 'Magasins qui ont les accès' : 'Magasin qui a les accès'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stores.map(m => (
              <span key={m.id} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-neutral-700 text-xs font-medium text-gray-700 dark:text-neutral-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{m.nom}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">Pour obtenir un accès, demandez à un administrateur d’ajouter vos identifiants.</p>
    </Modal>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function Service() {
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const isAdmin = !!profile?.isAdmin
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const userMagasinId = isGlobal ? null : profile?.magasinId

  const [services, setServices] = useState(null)
  const [magasins, setMagasins] = useState([])
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null) // null | {} (nouveau) | service
  const [credsFor, setCredsFor] = useState(null)

  useEffect(() => onSnapshot(collection(db, 'services'),
    snap => setServices(sortServices(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
    () => { setServices([]); setLoadError('Impossible de charger les services. Réessayez dans un instant.') }), [])

  useEffect(() => onSnapshot(query(collection(db, 'magasins'), orderBy('nom', 'asc')),
    snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setMagasins([])), [])

  async function saveService(data) {
    if (editing?.id) {
      await updateDoc(doc(db, 'services', editing.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      const order = services.reduce((max, s) => Math.max(max, s.order ?? -1), -1) + 1
      await addDoc(collection(db, 'services'), { ...data, order, credentialStoreIds: [], createdAt: serverTimestamp() })
    }
  }

  async function deleteService(service) {
    const creds = await getDocs(collection(db, 'services', service.id, 'credentials'))
    const batch = writeBatch(db)
    creds.docs.forEach(d => batch.delete(d.ref))
    batch.delete(doc(db, 'services', service.id))
    await batch.commit()
  }

  const access = s => serviceAccess(s, { isGlobal, magasinId: userMagasinId })
  const credsAccess = credsFor ? access(credsFor) : null

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Services</h1>
              <p className="text-xs sm:text-sm text-gray-400 dark:text-neutral-500 mt-0.5">
                Plateformes de services partenaires du Groupe Nivault, avec leur procédure
              </p>
            </div>
            {isAdmin && (
              <button onClick={() => setEditing({})} className={`${BTN_PRIMARY} h-9 sm:h-8 px-4`}>+ Nouveau service</button>
            )}
          </div>

          {loadError && <Notice notice={{ tone: 'error', text: loadError }} />}

          {services === null ? (
            <p className="text-sm text-gray-400 dark:text-neutral-500 py-10 text-center">Chargement…</p>
          ) : services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <EmptyState title="Aucun service pour le moment"
                text={isAdmin ? 'Ajoutez le premier service : son lien, sa procédure et, si besoin, les identifiants des magasins.' : 'Les services ajoutés par l’administration apparaîtront ici.'}
                action={isAdmin && <button onClick={() => setEditing({})} className={BTN_PRIMARY}>+ Nouveau service</button>} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {services.map(s => (
                <ServiceCard key={s.id} s={s} access={access(s)} isAdmin={isAdmin} onEdit={setEditing} onCreds={setCredsFor} />
              ))}
            </div>
          )}
        </div>
      </main>

      {editing && (
        <ServiceModal service={editing} onClose={() => setEditing(null)} onSave={saveService} onDelete={deleteService} />
      )}

      {credsFor && credsAccess === 'all' && (
        <AllCredentialsModal service={credsFor} magasins={magasins} canEdit={isAdmin} onClose={() => setCredsFor(null)} />
      )}
      {credsFor && credsAccess === 'mine' && (
        <MyCredentialsModal service={credsFor} magasinId={userMagasinId} onClose={() => setCredsFor(null)} />
      )}
      {credsFor && credsAccess === 'missing' && (
        <MissingCredentialsModal service={credsFor} magasins={magasins} onClose={() => setCredsFor(null)} />
      )}
    </div>
  )
}
