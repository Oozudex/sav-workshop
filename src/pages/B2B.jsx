import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { GLOBAL_ROLES } from '../lib/constants'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, serverTimestamp,
} from 'firebase/firestore'

const COLOR = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10', icon: 'text-indigo-600 dark:text-indigo-400', ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30', btn: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400', ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30', btn: 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400', ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-400', ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30', btn: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600' },
  gray: { bg: 'bg-gray-100 dark:bg-neutral-800', icon: 'text-gray-600 dark:text-neutral-300', ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700', btn: 'bg-gray-800 hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600' },
}
const COLORS = Object.keys(COLOR)

function PlaceholderIcon({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  )
}

// Normalize legacy data (old format had phone/email as strings)
function normTool(data) {
  const phones = Array.isArray(data.phones) ? data.phones
    : data.phone ? [{ label: '', value: data.phone }] : []
  const emails = Array.isArray(data.emails) ? data.emails
    : data.email ? [{ label: '', value: data.email }] : []
  return { ...data, phones, emails }
}

// ── Icons ────────────────────────────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function EyeIcon({ open }) {
  if (open) return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CloseBtn({ onClick }) {
  return (
    <button onClick={onClick} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
      <XIcon />
    </button>
  )
}

// ── ContactInfo ───────────────────────────────────────────────────────────────
function ContactInfo({ phones, emails }) {
  if (!phones?.length && !emails?.length) return null
  return (
    <div className="w-full border-t border-gray-100 dark:border-neutral-800 pt-2.5 space-y-1.5">
      {phones.map((p, i) => (
        <a key={i} href={`tel:${p.value.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors">
          <PhoneIcon />
          {p.label && <span className="font-medium shrink-0 text-gray-400 dark:text-neutral-500">{p.label} :</span>}
          <span className="truncate">{p.value}</span>
        </a>
      ))}
      {emails.map((e, i) => (
        <a key={i} href={`mailto:${e.value}`} onClick={ev => ev.stopPropagation()}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors">
          <MailIcon />
          {e.label && <span className="font-medium shrink-0 text-gray-400 dark:text-neutral-500">{e.label} :</span>}
          <span className="truncate">{e.value}</span>
        </a>
      ))}
    </div>
  )
}

// ── CredentialsModal ─────────────────────────────────────────────────────────
function CredentialsModal({ tool, magasins, userMagasinId, isGlobal, onClose }) {
  // N'afficher que les magasins sélectionnés sur le B2B (si vide = tous)
  const filteredMagasins = tool.storeIds?.length
    ? magasins.filter(m => tool.storeIds.includes(m.id))
    : magasins

  const [creds, setCreds] = useState(() => {
    const base = tool.credentials ?? {}
    if (!isGlobal) return base
    const obj = {}
    filteredMagasins.forEach(m => {
      obj[m.id] = { email: base[m.id]?.email ?? '', password: base[m.id]?.password ?? '' }
    })
    return obj
  })
  const [showPwd, setShowPwd] = useState({})
  const [saving, setSaving] = useState(false)

  function togglePwd(id) { setShowPwd(p => ({ ...p, [id]: !p[id] })) }

  async function handleSave() {
    setSaving(true)
    try {
      const cleaned = {}
      Object.entries(creds).forEach(([k, v]) => {
        if (v.email || v.password) cleaned[k] = v
      })
      await updateDoc(doc(db, 'b2b_tools', tool.id), { credentials: cleaned, updatedAt: serverTimestamp() })
      onClose()
    } finally { setSaving(false) }
  }

  if (isGlobal) {
    return (
      <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400"><LockIcon /></span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">Identifiants — {tool.label}</span>
            </div>
            <CloseBtn onClick={onClose} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {filteredMagasins.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Aucun magasin sélectionné pour ce B2B</p>
            )}
            {filteredMagasins.map(m => (
              <div key={m.id} className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide">{m.nom}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                    <input className="Input text-xs" type="email"
                      value={creds[m.id]?.email ?? ''}
                      onChange={e => setCreds(p => ({ ...p, [m.id]: { ...p[m.id], email: e.target.value } }))}
                      placeholder="email@exemple.com" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Mot de passe</span>
                    <div className="relative">
                      <input className="Input text-xs pr-8"
                        type={showPwd[m.id] ? 'text' : 'password'}
                        value={creds[m.id]?.password ?? ''}
                        onChange={e => setCreds(p => ({ ...p, [m.id]: { ...p[m.id], password: e.target.value } }))}
                        placeholder="••••••••" />
                      <button type="button" onClick={() => togglePwd(m.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300">
                        <EyeIcon open={showPwd[m.id]} />
                      </button>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
            <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Store view — read-only
  const sc = tool.credentials?.[userMagasinId]
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-400"><LockIcon /></span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">Identifiants — {tool.label}</span>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="p-5 space-y-4">
          {!sc ? (
            <p className="text-sm text-gray-400 dark:text-neutral-500 text-center py-2">
              Aucun identifiant configuré pour votre magasin.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
                <p className="text-sm font-mono text-gray-900 dark:text-white">{sc.email || '—'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Mot de passe</span>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-gray-900 dark:text-white">
                    {showPwd[userMagasinId] ? (sc.password || '—') : (sc.password ? '••••••••' : '—')}
                  </p>
                  {sc.password && (
                    <button type="button" onClick={() => togglePwd(userMagasinId)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 transition-colors">
                      <EyeIcon open={showPwd[userMagasinId]} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ToolCard ─────────────────────────────────────────────────────────────────
function ToolCard({ t, featured, canEdit, onEdit, userMagasinId, isGlobal, magasins }) {
  const c = COLOR[t.color] || COLOR.gray
  const [showCreds, setShowCreds] = useState(false)

  const hasAccess    = isGlobal || !t.storeIds?.length || (userMagasinId && t.storeIds.includes(userMagasinId))
  const showLock     = isGlobal || (!isGlobal && userMagasinId && t.credentials?.[userMagasinId])
  const accessStores = !hasAccess ? magasins.filter(m => t.storeIds?.includes(m.id)) : []

  // Tailles adaptées selon le type de carte pour correspondre à la DA du site
  const pad = featured ? 'p-6' : 'p-4'
  const iconPad = featured ? 'p-3' : 'p-2'
  const iconSz = featured ? 'h-8 w-8' : 'h-5 w-5'
  const imgH = featured ? 'h-14' : 'h-8'
  const titleSz = featured ? 'text-sm' : 'text-xs'
  const btnH = featured ? 'h-8' : 'h-7'

  return (
    <div className="relative group">
      <button
        onClick={() => hasAccess && t.url && window.open(t.url, '_blank', 'noopener,noreferrer')}
        disabled={!hasAccess || !t.url}
        className={[
          `w-full flex flex-col items-start gap-4 ${pad} rounded-2xl border text-left transition-all`,
          'bg-white dark:bg-neutral-900',
          'border-gray-200 dark:border-neutral-800',
          hasAccess && t.url ? `hover:shadow-lg hover:ring-4 ${c.ring}` : 'cursor-default',
          !hasAccess ? 'opacity-50' : '',
        ].join(' ')}
      >
        {t.imageUrl ? (
          <img src={t.imageUrl} alt={t.label} className={`object-contain ${imgH}`} />
        ) : (
          <div className={`${iconPad} rounded-xl ${c.bg}`}>
            <span className={c.icon}><PlaceholderIcon className={iconSz} /></span>
          </div>
        )}

        <div className="flex-1">
          <p className={`font-semibold text-gray-900 dark:text-white leading-snug ${titleSz}`}>
            {t.label}
          </p>
          {t.description && (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">{t.description}</p>
          )}
        </div>

        <ContactInfo phones={t.phones} emails={t.emails} />

        {!hasAccess ? (
          <div className="w-full rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 px-3 py-2">
            <p className="text-[10px] text-gray-400 dark:text-neutral-500 mb-1">Disponible chez :</p>
            <p className="text-[10px] font-semibold text-gray-600 dark:text-neutral-300 leading-snug">
              {accessStores.length > 0 ? accessStores.map(m => m.nom).join(', ') : '—'}
            </p>
          </div>
        ) : (
          <span className={`w-full ${btnH} flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${t.url ? `text-white ${c.btn}` : 'text-gray-400 dark:text-neutral-500 bg-gray-100 dark:bg-neutral-800'}`}>
            {t.url ? 'Accéder →' : 'Bientôt disponible'}
          </span>
        )}
      </button>

      {/* Lock button */}
      {showLock && (
        <button
          onClick={e => { e.stopPropagation(); setShowCreds(true) }}
          className={[
            'absolute top-3 h-7 w-7 grid place-items-center rounded-lg',
            'bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700',
            'text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200',
            'opacity-0 group-hover:opacity-100 transition-all shadow-sm',
            canEdit ? 'right-12' : 'right-3',
          ].join(' ')}
        >
          <LockIcon />
        </button>
      )}

      {/* Edit button */}
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(t) }}
          className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-lg bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {showCreds && (
        <CredentialsModal
          tool={t}
          magasins={magasins}
          userMagasinId={userMagasinId}
          isGlobal={isGlobal}
          onClose={() => setShowCreds(false)}
        />
      )}
    </div>
  )
}

// ── ContactListEditor ─────────────────────────────────────────────────────────
function ContactListEditor({ items, onChange, type }) {
  function add() { onChange([...items, { label: '', value: '' }]) }
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)) }
  function update(i, k, val) { onChange(items.map((item, idx) => idx === i ? { ...item, [k]: val } : item)) }

  const valuePlaceholder = type === 'phone' ? '01 23 45 67 89' : 'contact@exemple.com'
  const labelPlaceholder = type === 'phone' ? 'ex : Commercial' : 'ex : Standard'
  const addLabel = type === 'phone' ? '+ Ajouter un numéro' : '+ Ajouter un email'

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input className="Input text-xs flex-[2]" value={item.label}
            onChange={e => update(i, 'label', e.target.value)} placeholder={labelPlaceholder} />
          <input className="Input text-xs flex-[3]" type={type === 'phone' ? 'tel' : 'email'}
            value={item.value}
            onChange={e => update(i, 'value', e.target.value)} placeholder={valuePlaceholder} />
          <button type="button" onClick={() => remove(i)}
            className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <XIcon />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="text-[11px] font-medium text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
        {addLabel}
      </button>
    </div>
  )
}

// ── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ tool, magasins, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    label: tool?.label ?? '',
    description: tool?.description ?? '',
    url: tool?.url ?? '',
    phones: tool?.phones ?? [],
    emails: tool?.emails ?? [],
    color: tool?.color ?? 'indigo',
    featured: tool?.featured ?? false,
    storeIds: tool?.storeIds ?? [],
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleStore(id) {
    setForm(f => ({
      ...f,
      storeIds: f.storeIds.includes(id) ? f.storeIds.filter(s => s !== id) : [...f.storeIds, id],
    }))
  }

  async function handleSave() {
    if (!form.label.trim()) return
    setSaving(true)
    try {
      await onSave({
        label: form.label.trim(),
        description: form.description.trim() || null,
        url: form.url.trim() || null,
        phones: form.phones.filter(p => p.value.trim()),
        emails: form.emails.filter(e => e.value.trim()),
        color: form.color,
        featured: form.featured,
        imageUrl: tool?.imageUrl || null,
        storeIds: form.storeIds,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {tool?.id ? "Modifier l'outil" : 'Nouvel outil'}
          </span>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom *</span>
            <input className="Input" value={form.label} onChange={e => set('label', e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Description</span>
            <input className="Input" value={form.description} onChange={e => set('description', e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">URL</span>
            <input className="Input" type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://…" />
          </label>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Téléphones</span>
            <ContactListEditor items={form.phones} type="phone" onChange={v => set('phones', v)} />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Emails</span>
            <ContactListEditor items={form.emails} type="email" onChange={v => set('emails', v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur</span>
              <select className="Input" value={form.color} onChange={e => set('color', e.target.value)}>
                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={form.featured} onChange={e => set('featured', e.target.checked)} />
              <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Outil principal</span>
            </label>
          </div>

          {magasins.length > 0 && (
            <div className="space-y-2">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Accès magasins</span>
                <p className="text-[10px] text-gray-400 dark:text-neutral-600 mt-0.5">Laisser vide = visible pour tous</p>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {magasins.map(m => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" className="h-3.5 w-3.5"
                      checked={form.storeIds.includes(m.id)}
                      onChange={() => toggleStore(m.id)} />
                    <span className="text-xs text-gray-700 dark:text-neutral-300 truncate">{m.nom}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          {tool?.id ? (
            <button onClick={() => onDelete(tool)} className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10 transition-colors">
              Supprimer
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !form.label.trim()}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── B2B ──────────────────────────────────────────────────────────────────────
export default function B2B() {
  const { profile } = useAuth(s => ({ profile: s.profile }))
  const [tools, setTools] = useState([])
  const [magasins, setMagasins] = useState([])
  const [editTool, setEditTool] = useState(null)

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const canEdit = GLOBAL_ROLES.includes(profile?.role)
  const userMagasinId = !isGlobal ? profile?.magasinId : null

  useEffect(() => {
    const q = query(collection(db, 'b2b_tools'), orderBy('order', 'asc'))
    return onSnapshot(q, snap => setTools(snap.docs.map(d => ({ id: d.id, ...normTool(d.data()) }))))
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'magasins'), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setMagasins(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const featured = tools.filter(t => t.featured)
  const secondary = tools.filter(t => !t.featured)

  async function handleSave(data) {
    if (editTool?.id) {
      await updateDoc(doc(db, 'b2b_tools', editTool.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'b2b_tools'), { ...data, order: tools.length, createdAt: serverTimestamp() })
    }
  }

  async function handleDelete(tool) {
    if (!confirm(`Supprimer "${tool.label}" ?`)) return
    await deleteDoc(doc(db, 'b2b_tools', tool.id))
    setEditTool(null)
  }

  const cardProps = { canEdit, onEdit: setEditTool, userMagasinId, isGlobal, magasins }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Espace B2B</h1>
            <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
              Accédez aux outils et plateformes partenaires du Groupe Nivault
            </p>
          </div>
          {canEdit && (
            <button onClick={() => setEditTool({})}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
              + Ajouter un outil
            </button>
          )}
        </div>

        {featured.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Principaux</p>
            <div className="grid grid-cols-2 gap-4">
              {featured.map(t => <ToolCard key={t.id} t={t} featured {...cardProps} />)}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Autres</p>
            <div className="grid grid-cols-3 gap-4">
              {secondary.map(t => <ToolCard key={t.id} t={t} featured={false} {...cardProps} />)}
            </div>
          </div>
        )}

        {tools.length === 0 && (
          <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
            Aucun outil B2B configuré.{canEdit && ' Cliquez sur "+ Ajouter un outil" pour commencer.'}
          </div>
        )}
      </main>

      {editTool !== null && (
        <EditModal
          tool={editTool?.id ? editTool : null}
          magasins={magasins}
          onClose={() => setEditTool(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
