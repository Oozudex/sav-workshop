import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { GLOBAL_ROLES } from '../lib/constants'
import { safeUrl } from '../lib/security'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import {
  buildCredentialRows, credentialStores, exportFileName, exportTable, groupRows, moveItem, orderChanges, toCsv,
} from '../lib/b2bExport'
import { downloadText, downloadWorkbook } from '../lib/excel'

const COLOR = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10', icon: 'text-indigo-600 dark:text-indigo-400', ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30', btn: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400', ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30', btn: 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-600' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400', ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-400', ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30', btn: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600' },
  gray: { bg: 'bg-gray-100 dark:bg-neutral-800', icon: 'text-gray-600 dark:text-neutral-300', ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700', btn: 'bg-gray-800 hover:bg-gray-700 dark:bg-neutral-700 dark:hover:bg-neutral-600' },
}
const COLORS = Object.keys(COLOR)
const COLOR_LABELS = { indigo: 'Indigo', emerald: 'Vert', amber: 'Ambre', blue: 'Bleu', violet: 'Violet', gray: 'Gris' }

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

function LockOpenIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
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
          className="flex items-start gap-1.5 py-0.5 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors">
          <span className="mt-0.5"><PhoneIcon /></span>
          <span className="min-w-0 break-words">
            {p.label && <span className="font-medium text-gray-400 dark:text-neutral-500">{p.label} : </span>}
            <span className="whitespace-nowrap">{p.value}</span>
          </span>
        </a>
      ))}
      {emails.map((e, i) => (
        <a key={i} href={`mailto:${e.value}`} onClick={ev => ev.stopPropagation()}
          className="flex items-start gap-1.5 py-0.5 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors">
          <span className="mt-0.5"><MailIcon /></span>
          <span className="min-w-0 break-all">
            {e.label && <span className="font-medium text-gray-400 dark:text-neutral-500 break-normal">{e.label} : </span>}
            {e.value}
          </span>
        </a>
      ))}
    </div>
  )
}

// ── CredentialsModal ─────────────────────────────────────────────────────────
function CredentialsModal({ tool, magasins, userMagasinId, isGlobal, onClose, onExport }) {
  // N'afficher que les magasins sélectionnés sur le B2B (si vide = tous)
  const filteredMagasins = tool.storeIds?.length
    ? magasins.filter(m => tool.storeIds.includes(m.id))
    : magasins

  // Identifiants stockés dans b2b_tools/{id}/credentials/{magasinId} :
  // les règles Firestore ne laissent un magasin lire que son propre document.
  const [creds, setCreds] = useState({})
  const [loadingCreds, setLoadingCreds] = useState(true)
  const [showPwd, setShowPwd] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const credsCol = collection(db, 'b2b_tools', tool.id, 'credentials')
    const load = isGlobal
      ? getDocs(credsCol).then(snap => {
          const base = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))
          const obj = {}
          filteredMagasins.forEach(m => {
            obj[m.id] = { email: base[m.id]?.email ?? '', password: base[m.id]?.password ?? '' }
          })
          return obj
        })
      : getDoc(doc(credsCol, userMagasinId)).then(snap => (snap.exists() ? { [userMagasinId]: snap.data() } : {}))
    load.then(setCreds).catch(() => setCreds({})).finally(() => setLoadingCreds(false))
    // Chargé une seule fois à l'ouverture pour ne pas écraser une saisie en cours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id, isGlobal, userMagasinId])

  function togglePwd(id) { setShowPwd(p => ({ ...p, [id]: !p[id] })) }

  async function handleSave() {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      const withCreds = []
      Object.entries(creds).forEach(([magId, v]) => {
        const ref = doc(db, 'b2b_tools', tool.id, 'credentials', magId)
        if (v.email || v.password) {
          batch.set(ref, { email: v.email || '', password: v.password || '', updatedAt: serverTimestamp() })
          withCreds.push(magId)
        } else {
          batch.delete(ref)
        }
      })
      // Liste non sensible des magasins configurés (pour afficher le cadenas)
      batch.update(doc(db, 'b2b_tools', tool.id), { credentialStoreIds: withCreds, updatedAt: serverTimestamp() })
      await batch.commit()
      onClose()
    } finally { setSaving(false) }
  }

  if (isGlobal) {
    return (
      <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400"><LockIcon /></span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">Identifiants — {tool.label}</span>
            </div>
            <CloseBtn onClick={onClose} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {filteredMagasins.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Aucun magasin sélectionné pour ce B2B</p>
            )}
            {loadingCreds && <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>}
            {!loadingCreds && filteredMagasins.map(m => (
              <div key={m.id} className="space-y-2 pt-4 first:pt-0 border-t first:border-t-0 border-gray-100 dark:border-neutral-800">
                <p className="text-xs font-semibold text-gray-700 dark:text-neutral-300 uppercase tracking-wide">{m.nom}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          <div className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
            {onExport && (
              <button onClick={() => { onClose(); onExport(tool.id) }}
                className="mr-auto h-8 px-2 sm:px-3 rounded-lg text-xs font-medium whitespace-nowrap text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors">
                Exporter<span className="hidden sm:inline"> ce B2B</span>
              </button>
            )}
            <button onClick={onClose} className="ml-auto h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || loadingCreds}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Store view — read-only
  const sc = creds[userMagasinId]
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
          {loadingCreds ? (
            <p className="text-sm text-gray-400 dark:text-neutral-500 text-center py-2">Chargement…</p>
          ) : !sc ? (
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
function ToolCard({ t, featured, canEdit, onEdit, onExport, userMagasinId, isGlobal, magasins }) {
  const c = COLOR[t.color] || COLOR.gray
  const [showCreds, setShowCreds] = useState(false)

  const hasAccess    = isGlobal || !t.storeIds?.length || (userMagasinId && t.storeIds.includes(userMagasinId))
  // Le cadenas est toujours affiché : ouvert = identifiants du magasin, fermé = qui a les accès
  const hasCreds     = isGlobal || !!(userMagasinId && t.credentialStoreIds?.includes(userMagasinId))
  const toolUrl      = safeUrl(t.url)
  const accessStores = !hasAccess ? magasins.filter(m => t.storeIds?.includes(m.id)) : []

  // Tailles adaptées selon le type de carte pour correspondre à la DA du site
  const pad = featured ? 'p-6' : 'p-4'
  const iconPad = featured ? 'p-3' : 'p-2'
  const iconSz = featured ? 'h-8 w-8' : 'h-5 w-5'
  const imgH = featured ? 'h-14' : 'h-8'
  const titleSz = featured ? 'text-sm' : 'text-xs'
  const btnH = featured ? 'h-10 sm:h-8' : 'h-9 sm:h-7'

  return (
    <div className="relative group">
      <button
        onClick={() => hasAccess && toolUrl && window.open(toolUrl, '_blank', 'noopener,noreferrer')}
        disabled={!hasAccess || !toolUrl}
        className={[
          `w-full flex flex-col items-start gap-4 ${pad} rounded-2xl border text-left transition-all`,
          'bg-white dark:bg-neutral-900',
          'border-gray-200 dark:border-neutral-800',
          hasAccess && toolUrl ? `hover:shadow-lg hover:ring-4 ${c.ring}` : 'cursor-default',
          !hasAccess ? 'opacity-50' : '',
        ].join(' ')}
      >
        {t.imageUrl ? (
          <img src={safeUrl(t.imageUrl)} alt={t.label} className={`object-contain max-w-[calc(100%-5.5rem)] ${imgH}`} />
        ) : (
          <div className={`${iconPad} rounded-xl ${c.bg}`}>
            <span className={c.icon}><PlaceholderIcon className={iconSz} /></span>
          </div>
        )}

        <div className="flex-1 min-w-0 w-full">
          <p className={`font-semibold text-gray-900 dark:text-white leading-snug break-words ${titleSz}`}>
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

      {/* Cadenas : identifiants du magasin, ou magasins qui ont les accès */}
      <button
        onClick={e => { e.stopPropagation(); setShowCreds(true) }}
        title={hasCreds ? (isGlobal ? 'Identifiants des magasins' : 'Voir vos identifiants') : 'Pas d’identifiants pour votre magasin : voir qui a les accès'}
        aria-label={hasCreds ? 'Identifiants' : 'Accès non disponible'}
        className={[
          'absolute top-3 h-7 w-7 grid place-items-center rounded-lg border shadow-sm transition-colors',
          hasCreds
            ? 'bg-white text-gray-600 border-gray-200 hover:text-gray-900 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:text-white'
            : 'bg-gray-50 text-gray-300 border-dashed border-gray-300 hover:text-gray-500 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-700 dark:hover:text-neutral-400',
          canEdit ? 'right-12' : 'right-3',
        ].join(' ')}
      >
        {hasCreds ? <LockOpenIcon /> : <LockIcon />}
      </button>

      {/* Edit button */}
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(t) }}
          aria-label={`Modifier ${t.label}`}
          className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-lg bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-all shadow-sm"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {showCreds && (hasCreds ? (
        <CredentialsModal
          tool={t}
          magasins={magasins}
          userMagasinId={userMagasinId}
          isGlobal={isGlobal}
          onExport={isGlobal ? onExport : null}
          onClose={() => setShowCreds(false)}
        />
      ) : (
        <AccessInfoModal tool={t} magasins={magasins} onClose={() => setShowCreds(false)} />
      ))}
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
        <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 pb-2 sm:pb-0 border-b sm:border-0 border-gray-100 dark:border-neutral-800">
          <input className="Input text-xs basis-full sm:basis-auto sm:flex-[2]" value={item.label}
            onChange={e => update(i, 'label', e.target.value)} placeholder={labelPlaceholder} aria-label="Libellé" />
          <input className="Input text-xs flex-1 min-w-0 sm:flex-[3]" type={type === 'phone' ? 'tel' : 'email'}
            value={item.value}
            onChange={e => update(i, 'value', e.target.value)} placeholder={valuePlaceholder} />
          <button type="button" onClick={() => remove(i)} aria-label="Retirer"
            className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 grid place-items-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
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
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {tool?.id ? "Modifier l'outil" : 'Nouvel outil'}
          </span>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
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
                {COLORS.map(c => <option key={c} value={c}>{COLOR_LABELS[c] || c}</option>)}
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

        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          {tool?.id ? (
            <button onClick={() => onDelete(tool)} className="h-8 px-2.5 sm:px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10 transition-colors">
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

// ── Magasin sans identifiants : qui a les accès ──────────────────────────────
function AccessInfoModal({ tool, magasins, onClose }) {
  const stores = credentialStores(tool, magasins)
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-400"><LockIcon /></span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">Identifiants — {tool.label}</span>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700 dark:text-neutral-200">
            Votre magasin n’a pas d’identifiants pour <span className="font-semibold">{tool.label}</span>.
          </p>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
              {stores.length > 1 ? 'Magasins qui ont les accès' : 'Magasin qui a les accès'}
            </p>
            {stores.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stores.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-neutral-700 text-xs font-medium text-gray-700 dark:text-neutral-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{m.nom}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-neutral-500">Aucun magasin pour le moment.</p>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-neutral-400">
            {stores.length > 0 ? 'Vous pouvez leur demander de passer la commande, ou ' : 'Pour obtenir un accès, '}
            demandez à l’acheteur d’ajouter vos identifiants.
          </p>
        </div>
        <div className="flex justify-end px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
            Compris
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Export des identifiants (acheteur) ───────────────────────────────────────
function PickList({ title, items, selected, onChange }) {
  const all = selected.length === items.length
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/60 dark:bg-neutral-800/30">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide">
          {title} <span className="font-medium normal-case text-gray-400">· {selected.length}/{items.length}</span>
        </span>
        <button type="button" onClick={() => onChange(all ? [] : items.map(i => i.id))}
          className="text-[11px] font-semibold text-gray-600 hover:text-gray-900 dark:text-neutral-300 dark:hover:text-white">
          {all ? 'Aucun' : 'Tous'}
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {items.map(it => (
          <div key={it.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800">
            <label className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 accent-gray-900 dark:accent-white" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} />
              <span className="text-xs text-gray-800 dark:text-neutral-200 truncate">{it.label}</span>
              {it.sub && <span className="text-[10px] text-gray-400 dark:text-neutral-500 shrink-0">{it.sub}</span>}
            </label>
            <button type="button" onClick={() => onChange([it.id])}
              className="text-[10px] font-semibold text-gray-400 hover:text-gray-800 dark:hover:text-neutral-200 sm:opacity-0 sm:group-hover:opacity-100">
              Seulement
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportModal({ tools, magasins, initialToolIds, onClose }) {
  const allTools = tools.map(t => t.id)
  const allStores = magasins.map(m => m.id)
  const [toolIds, setToolIds] = useState(initialToolIds || allTools)
  const [storeIds, setStoreIds] = useState(allStores)
  const [groupBy, setGroupBy] = useState('aucun')
  const [format, setFormat] = useState('xlsx')
  const [includeMissing, setIncludeMissing] = useState(false)
  const [creds, setCreds] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all(tools.map(t => getDocs(collection(db, 'b2b_tools', t.id, 'credentials'))
      .then(snap => [t.id, Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))])))
      .then(entries => setCreds(Object.fromEntries(entries)))
      .catch(e => setError(e.message || 'Chargement impossible'))
    // Chargé une fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = creds ? buildCredentialRows({ tools, magasins, creds, toolIds, storeIds, includeMissing }) : []
  const withCreds = rows.filter(r => !r.statut).length
  const storeCount = id => creds ? tools.filter(t => creds[t.id]?.[id]?.email || creds[t.id]?.[id]?.password).length : null

  function preset(kind, id) {
    if (kind === 'all') { setToolIds(allTools); setStoreIds(allStores) }
    if (kind === 'tool') { setToolIds([id]); setStoreIds(allStores); setGroupBy('aucun') }
    if (kind === 'store') { setStoreIds([id]); setToolIds(allTools); setGroupBy('aucun') }
  }

  async function download() {
    setBusy(true); setError('')
    try {
      const name = exportFileName({ tools, magasins, toolIds, storeIds })
      if (format === 'csv') downloadText(toCsv(exportTable(rows)), `${name}.csv`, 'text/csv;charset=utf-8')
      else await downloadWorkbook(groupRows(rows, groupBy).map(g => ({ name: g.name, table: exportTable(g.rows) })), name)
    } catch (e) { setError(e.message || 'Export impossible') }
    finally { setBusy(false) }
  }

  const seg = (value, current, set, label) => (
    <button type="button" onClick={() => set(value)}
      className={['h-9 sm:h-8 px-2 sm:px-3 text-xs font-semibold whitespace-nowrap transition-colors', current === value
        ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
        : 'text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800'].join(' ')}>
      {label}
    </button>
  )
  const LABEL = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'

  return (
    <div className="fixed inset-0 z-[400] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Exporter les identifiants</span>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          {/* Raccourcis */}
          <div className="space-y-2">
            <p className={LABEL}>Que voulez-vous exporter ?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button type="button" onClick={() => preset('all')}
                className={['h-10 px-3 rounded-xl border text-xs font-semibold text-left transition-colors',
                  toolIds.length === allTools.length && storeIds.length === allStores.length
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800'].join(' ')}>
                Tous les identifiants
              </button>
              <select className="Input h-10 text-xs" value={toolIds.length === 1 && storeIds.length === allStores.length ? toolIds[0] : ''}
                onChange={e => e.target.value && preset('tool', e.target.value)}>
                <option value="">Tout un B2B…</option>
                {tools.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select className="Input h-10 text-xs" value={storeIds.length === 1 && toolIds.length === allTools.length ? storeIds[0] : ''}
                onChange={e => e.target.value && preset('store', e.target.value)}>
                <option value="">Tout un magasin…</option>
                {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </div>
          </div>

          {/* Sélection fine */}
          <div className="space-y-2">
            <p className={LABEL}>Ou une sélection précise</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PickList title="B2B" selected={toolIds} onChange={setToolIds}
                items={tools.map(t => ({ id: t.id, label: t.label, sub: `${t.credentialStoreIds?.length || 0} mag.` }))} />
              <PickList title="Magasins" selected={storeIds} onChange={setStoreIds}
                items={magasins.map(m => ({ id: m.id, label: m.nom, sub: storeCount(m.id) != null ? `${storeCount(m.id)} B2B` : null }))} />
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-x-5 gap-y-3">
            <div className="space-y-1.5">
              <p className={LABEL}>Format</p>
              <div className="grid grid-cols-2 sm:inline-flex rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden divide-x divide-gray-200 dark:divide-neutral-700">
                {seg('xlsx', format, setFormat, 'Excel')}
                {seg('csv', format, setFormat, 'CSV')}
              </div>
            </div>
            {format === 'xlsx' && (
              <div className="space-y-1.5">
                <p className={LABEL}>Onglets du fichier</p>
                <div className="grid grid-cols-3 sm:inline-flex rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden divide-x divide-gray-200 dark:divide-neutral-700">
                  {seg('aucun', groupBy, setGroupBy, 'Un seul')}
                  {seg('b2b', groupBy, setGroupBy, 'Par B2B')}
                  {seg('magasin', groupBy, setGroupBy, 'Par magasin')}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer h-8">
              <input type="checkbox" className="h-3.5 w-3.5 accent-gray-900 dark:accent-white" checked={includeMissing} onChange={e => setIncludeMissing(e.target.checked)} />
              <span className="text-xs text-gray-700 dark:text-neutral-300">Lister aussi les accès manquants</span>
            </label>
          </div>

          {/* Aperçu */}
          <div className="rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/60 dark:bg-neutral-800/30 text-xs text-gray-600 dark:text-neutral-300">
              {!creds ? 'Chargement des identifiants…' : (
                <><span className="font-semibold text-gray-900 dark:text-white">{withCreds} identifiant{withCreds > 1 ? 's' : ''}</span>
                  {rows.length > withCreds && <> · {rows.length - withCreds} accès manquant{rows.length - withCreds > 1 ? 's' : ''}</>}
                  {' '}· {toolIds.length} B2B · {storeIds.length} magasin{storeIds.length > 1 ? 's' : ''}</>
              )}
            </div>
            {rows.length > 0 && (
              <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                {rows.slice(0, 5).map((r, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.6fr_auto] gap-x-3 gap-y-0.5">
                    <span className="font-medium text-gray-800 dark:text-neutral-200 truncate">{r.b2b}</span>
                    <span className="text-gray-600 dark:text-neutral-300 truncate text-right sm:text-left">{r.magasin}</span>
                    <span className="col-span-2 sm:col-span-1 font-mono text-gray-600 dark:text-neutral-300 truncate">{r.identifiant || '—'}</span>
                    <span className={`col-span-2 sm:col-span-1 font-mono text-gray-400 whitespace-nowrap ${r.statut ? '' : 'hidden sm:block'}`}>{r.statut || (r.motDePasse ? '••••••' : '—')}</span>
                  </div>
                ))}
                {rows.length > 5 && <p className="px-3 py-1.5 text-[11px] text-gray-400">+ {rows.length - 5} autre{rows.length - 5 > 1 ? 's' : ''} ligne{rows.length - 5 > 1 ? 's' : ''}</p>}
              </div>
            )}
          </div>

          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Le fichier contient les mots de passe en clair : ne l’envoyez pas par mail et supprimez-le après usage.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
            Fermer
          </button>
          <button onClick={download} disabled={!creds || busy || rows.length === 0}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
            {busy ? 'Préparation…' : `Télécharger ${format === 'csv' ? 'le CSV' : 'le fichier Excel'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ordre d'affichage (acheteur) ─────────────────────────────────────────────
function OrderModal({ tools, onClose }) {
  const [lists, setLists] = useState({
    featured: tools.filter(t => t.featured),
    others: tools.filter(t => !t.featured),
  })
  const [saving, setSaving] = useState(false)

  function move(listKey, from, to) {
    setLists(l => ({ ...l, [listKey]: moveItem(l[listKey], from, to) }))
  }

  function onDragEnd({ source, destination }) {
    if (!destination) return
    if (source.droppableId === destination.droppableId) { move(source.droppableId, source.index, destination.index); return }
    // Glisser d'une section à l'autre : le B2B devient principal (ou non)
    setLists(l => {
      const from = [...l[source.droppableId]]
      const to = [...l[destination.droppableId]]
      const [item] = from.splice(source.index, 1)
      to.splice(destination.index, 0, item)
      return { ...l, [source.droppableId]: from, [destination.droppableId]: to }
    })
  }

  // Passe un B2B dans l'autre section (en dernier)
  function switchSection(key, index) {
    const other = key === 'featured' ? 'others' : 'featured'
    setLists(l => {
      const from = [...l[key]]
      const [item] = from.splice(index, 1)
      return { ...l, [key]: from, [other]: [...l[other], item] }
    })
  }

  async function save() {
    setSaving(true)
    try {
      const batch = writeBatch(db)
      const orders = new Map(orderChanges(lists.featured, lists.others).map(c => [c.id, c.order]))
      ;[...lists.featured.map(t => [t, true]), ...lists.others.map(t => [t, false])].forEach(([t, featured]) => {
        const data = {}
        if (orders.has(t.id)) data.order = orders.get(t.id)
        if (!!t.featured !== featured) data.featured = featured
        if (Object.keys(data).length) batch.update(doc(db, 'b2b_tools', t.id), { ...data, updatedAt: serverTimestamp() })
      })
      await batch.commit()
      onClose()
    } finally { setSaving(false) }
  }

  const section = (key, title, hint) => (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">{title}</p>
        <p className="text-[11px] text-gray-400 dark:text-neutral-500">{hint}</p>
      </div>
      <Droppable droppableId={key}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps}
            className={['min-h-[3rem] rounded-xl border border-dashed p-1.5 space-y-1.5 transition-colors',
              snapshot.isDraggingOver ? 'border-gray-400 bg-gray-50 dark:border-neutral-500 dark:bg-neutral-800/40' : 'border-gray-200 dark:border-neutral-700'].join(' ')}>
            {lists[key].map((t, i) => (
              <Draggable key={t.id} draggableId={t.id} index={i}>
                {(p, s) => (
                  <div ref={p.innerRef} {...p.draggableProps}
                    className={['flex items-center gap-1 sm:gap-2 rounded-lg border bg-white dark:bg-neutral-900 px-1 sm:px-2 py-1.5',
                      s.isDragging ? 'shadow-lg border-gray-300 dark:border-neutral-600' : 'border-gray-200 dark:border-neutral-800'].join(' ')}>
                    <span {...p.dragHandleProps} aria-label={`Déplacer ${t.label}`}
                      className="h-7 w-5 sm:w-6 shrink-0 grid place-items-center text-gray-300 hover:text-gray-500 dark:text-neutral-600 cursor-grab">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
                    </span>
                    <span className="w-4 sm:w-5 shrink-0 text-[11px] font-semibold text-gray-400 tabular-nums text-right">{i + 1}</span>
                    {t.imageUrl
                      ? <img src={safeUrl(t.imageUrl)} alt="" className="hidden sm:block h-6 w-10 object-contain shrink-0" />
                      : <span className={`hidden sm:block h-6 w-6 rounded-md shrink-0 ${(COLOR[t.color] || COLOR.gray).bg}`} />}
                    <span className="flex-1 min-w-0 pl-1 sm:pl-0 text-sm font-medium leading-tight text-gray-800 dark:text-neutral-100 line-clamp-2 break-words">{t.label}</span>
                    <button type="button" onClick={() => switchSection(key, i)}
                      title={key === 'featured' ? 'Retirer des principaux' : 'Mettre dans les principaux'}
                      aria-label={key === 'featured' ? `Retirer ${t.label} des principaux` : `Mettre ${t.label} dans les principaux`}
                      className={`h-8 w-7 sm:h-7 shrink-0 grid place-items-center rounded-md hover:bg-gray-100 dark:hover:bg-neutral-800 ${key === 'featured' ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500 dark:text-neutral-600'}`}>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill={key === 'featured' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinejoin="round" d="M11.48 3.5a.56.56 0 011.04 0l2.12 5.11 5.52.44c.5.04.7.66.32.99l-4.2 3.6 1.28 5.38a.56.56 0 01-.84.61L12 16.73l-4.72 2.9a.56.56 0 01-.84-.61l1.28-5.38-4.2-3.6a.56.56 0 01.32-.99l5.52-.44 2.12-5.11z" />
                      </svg>
                    </button>
                    <button type="button" onClick={() => move(key, i, i - 1)} disabled={i === 0} aria-label="Monter"
                      className="h-8 w-7 sm:h-7 shrink-0 grid place-items-center rounded-md text-gray-400 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-30">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button type="button" onClick={() => move(key, i, i + 1)} disabled={i === lists[key].length - 1} aria-label="Descendre"
                      className="h-8 w-7 sm:h-7 shrink-0 grid place-items-center rounded-md text-gray-400 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-neutral-800 disabled:opacity-30">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {lists[key].length === 0 && <p className="text-[11px] text-center text-gray-400 py-2">Glissez un B2B ici</p>}
          </div>
        )}
      </Droppable>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[400] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Ordre d’affichage des B2B</span>
          <CloseBtn onClick={onClose} />
        </div>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="p-3 sm:p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {section('featured', 'Principaux', 'Grandes cartes en haut de la page.')}
            {section('others', 'Autres', 'Petites cartes en dessous.')}
          </div>
        </DragDropContext>
        <div className="flex items-center justify-end sm:justify-between gap-2 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <p className="hidden sm:block text-[11px] text-gray-400 dark:text-neutral-500">Glissez, ou utilisez les flèches et l’étoile.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
              Annuler
            </button>
            <button onClick={save} disabled={saving}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : 'Enregistrer l’ordre'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── B2B ──────────────────────────────────────────────────────────────────────
export default function B2B() {
  const { profile } = useAuth(useShallow(s => ({ profile: s.profile })))
  const [tools, setTools] = useState([])
  const [magasins, setMagasins] = useState([])
  const [editTool, setEditTool] = useState(null)
  const [exportFor, setExportFor] = useState(null) // null | { toolIds? }
  const [showOrder, setShowOrder] = useState(false)

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

  const cardProps = { canEdit, onEdit: setEditTool, onExport: id => setExportFor({ toolIds: [id] }), userMagasinId, isGlobal, magasins }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Espace B2B</h1>
            <p className="text-xs sm:text-sm text-gray-400 dark:text-neutral-500 mt-1">
              Accédez aux outils et plateformes partenaires du Groupe Nivault
            </p>
          </div>
          {canEdit && (
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
              <button onClick={() => setShowOrder(true)} disabled={tools.length < 2}
                className="h-9 sm:h-8 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 text-gray-700 border-gray-200 bg-white hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800">
                <span className="sm:hidden">Ordre</span><span className="hidden sm:inline">Ordre d’affichage</span>
              </button>
              <button onClick={() => setExportFor({})} disabled={tools.length === 0}
                className="h-9 sm:h-8 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 text-gray-700 border-gray-200 bg-white hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800">
                <span className="sm:hidden">Exporter</span><span className="hidden sm:inline">Exporter les identifiants</span>
              </button>
              <button onClick={() => setEditTool({})}
                className="col-span-2 order-first sm:order-none h-9 sm:h-8 px-4 rounded-lg text-xs font-semibold whitespace-nowrap bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
                + Ajouter un outil
              </button>
            </div>
          )}
        </div>

        {featured.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Principaux</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {featured.map(t => <ToolCard key={t.id} t={t} featured {...cardProps} />)}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Autres</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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

      {exportFor && (
        <ExportModal tools={tools} magasins={magasins} initialToolIds={exportFor.toolIds} onClose={() => setExportFor(null)} />
      )}

      {showOrder && <OrderModal tools={tools} onClose={() => setShowOrder(false)} />}

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
