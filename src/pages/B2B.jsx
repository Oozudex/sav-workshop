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
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-500/10',   icon: 'text-indigo-600 dark:text-indigo-400',   ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-500/30',   btn: 'bg-indigo-600 hover:bg-indigo-700' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     icon: 'text-amber-600 dark:text-amber-400',     ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30',     btn: 'bg-amber-500 hover:bg-amber-600' },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       icon: 'text-blue-600 dark:text-blue-400',       ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30',       btn: 'bg-blue-600 hover:bg-blue-700' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-500/10',   icon: 'text-violet-600 dark:text-violet-400',   ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30',   btn: 'bg-violet-600 hover:bg-violet-700' },
  gray:    { bg: 'bg-gray-100 dark:bg-neutral-800',      icon: 'text-gray-600 dark:text-neutral-300',    ring: 'hover:ring-gray-200 dark:hover:ring-neutral-700',       btn: 'bg-gray-800 hover:bg-gray-700' },
}
const COLORS = Object.keys(COLOR)

const PLACEHOLDER_ICON = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
  </svg>
)

function ContactInfo({ phone, email }) {
  if (!phone && !email) return null
  return (
    <div className="w-full border-t border-gray-100 dark:border-neutral-800 pt-2.5 space-y-1.5">
      {phone && (
        <a href={`tel:${phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}
          className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={e => e.stopPropagation()}
          className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-neutral-400 hover:text-gray-800 dark:hover:text-neutral-200 transition-colors truncate">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          {email}
        </a>
      )}
    </div>
  )
}

function ToolCard({ t, featured, canEdit, onEdit }) {
  const c = COLOR[t.color] || COLOR.gray
  return (
    <div className="relative group">
      <button
        onClick={() => t.url && window.open(t.url, '_blank', 'noopener,noreferrer')}
        disabled={!t.url}
        className={[
          'w-full flex flex-col items-start gap-3 p-5 rounded-2xl border text-left transition-all',
          'bg-white dark:bg-neutral-900',
          'border-gray-200 dark:border-neutral-800',
          t.url ? `hover:shadow-lg hover:ring-4 ${c.ring}` : 'opacity-60 cursor-not-allowed',
        ].join(' ')}
      >
        {/* Logo ou placeholder */}
        {t.imageUrl ? (
          <img
            src={t.imageUrl}
            alt={t.label}
            className={`object-contain ${featured ? 'h-14' : 'h-10'}`}
          />
        ) : (
          <div className={`p-2.5 rounded-xl ${c.bg}`}>
            <span className={c.icon}>{PLACEHOLDER_ICON}</span>
          </div>
        )}

        <div className="flex-1">
          <p className={`font-semibold text-gray-900 dark:text-white leading-snug ${featured ? 'text-base' : 'text-sm'}`}>
            {t.label}
          </p>
          {t.description && (
            <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">{t.description}</p>
          )}
        </div>

        <ContactInfo phone={t.phone} email={t.email} />

        <span className={`w-full h-7 flex items-center justify-center rounded-lg text-xs font-semibold text-white transition-colors ${c.btn}`}>
          {t.url ? 'Accéder →' : 'Bientôt disponible'}
        </span>
      </button>

      {/* Bouton édition (admins uniquement) */}
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(t) }}
          className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-lg
                     bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700
                     text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200
                     opacity-0 group-hover:opacity-100 transition-all shadow-sm"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}
    </div>
  )
}

function EditModal({ tool, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    label:       tool?.label       || '',
    description: tool?.description || '',
    url:         tool?.url         || '',
    phone:       tool?.phone       || '',
    email:       tool?.email       || '',
    color:       tool?.color       || 'indigo',
    featured:    tool?.featured    ?? false,
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.label.trim()) return
    setSaving(true)
    try {
      await onSave({
        label:       form.label.trim(),
        description: form.description.trim() || null,
        url:         form.url.trim()   || null,
        phone:       form.phone.trim() || null,
        email:       form.email.trim() || null,
        color:       form.color,
        featured:    form.featured,
        imageUrl:    tool?.imageUrl || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {tool?.id ? 'Modifier l\'outil' : 'Nouvel outil'}
          </span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Nom *</span>
              <input className="Input" value={form.label} onChange={e => set('label', e.target.value)} />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Description</span>
              <input className="Input" value={form.description} onChange={e => set('description', e.target.value)} />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">URL</span>
              <input className="Input" type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://…" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Téléphone</span>
              <input className="Input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01 23 45 67 89" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Email</span>
              <input className="Input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur</span>
              <select className="Input" value={form.color} onChange={e => set('color', e.target.value)}>
                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={form.featured} onChange={e => set('featured', e.target.checked)} />
              <span className="text-xs font-medium text-gray-700 dark:text-neutral-300">Outil principal (grand format)</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
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

export default function B2B() {
  const { profile } = useAuth(s => ({ profile: s.profile }))
  const [tools,    setTools]    = useState([])
  const [editTool, setEditTool] = useState(null)
  const canEdit = GLOBAL_ROLES.includes(profile?.role)

  useEffect(() => {
    const q = query(collection(db, 'b2b_tools'), orderBy('order', 'asc'))
    return onSnapshot(q, snap => setTools(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const featured  = tools.filter(t => t.featured)
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6 space-y-6">

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

        {/* Principaux — 2 par ligne */}
        {featured.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Principaux</p>
            <div className="grid grid-cols-2 gap-4">
              {featured.map(t => (
                <ToolCard key={t.id} t={t} featured canEdit={canEdit} onEdit={setEditTool} />
              ))}
            </div>
          </div>
        )}

        {/* Autres — 5 par ligne */}
        {secondary.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-3">Autres</p>
            <div className="grid grid-cols-5 gap-4">
              {secondary.map(t => (
                <ToolCard key={t.id} t={t} featured={false} canEdit={canEdit} onEdit={setEditTool} />
              ))}
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
          onClose={() => setEditTool(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
