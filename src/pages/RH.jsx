import { useState, useRef } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import {
  collection, query, where, getDocs, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import { parseTamigoExcel, ABSENCE_LABELS } from '../lib/parseTamigo'

const IMPORT_ROLES = ['directeurmag', ...GLOBAL_ROLES, ...RAYON_TYPES]

const RH_TOOLS = [
  {
    label: 'Tamigo',
    description: 'Gestion des plannings et des temps de travail',
    url: null,
    roles: null,
    color: 'blue',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    label: 'Lucca',
    description: 'Gestion des congés, absences et notes de frais',
    url: null,
    roles: null,
    color: 'emerald',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
]

const COLOR = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400', ring: 'hover:ring-blue-200 dark:hover:ring-blue-500/30', btn: 'bg-blue-600 hover:bg-blue-700' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:ring-emerald-200 dark:hover:ring-emerald-500/30', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-400', ring: 'hover:ring-violet-200 dark:hover:ring-violet-500/30', btn: 'bg-violet-600 hover:bg-violet-700' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400', ring: 'hover:ring-amber-200 dark:hover:ring-amber-500/30', btn: 'bg-amber-500 hover:bg-amber-600' },
}

const DAYS_FR = { '1': 'Lun', '2': 'Mar', '3': 'Mer', '4': 'Jeu', '5': 'Ven', '6': 'Sam', '0': 'Dim' }

function fmtShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = DAYS_FR[String(d.getDay())] ?? ''
  return `${day} ${d.getDate()}/${d.getMonth() + 1}`
}

/* ── Modal de prévisualisation de l'import ────────────────────────────────── */
function PreviewModal({ preview, rayonType, onConfirm, onClose, importing }) {
  const byEmployee = {}
  for (const s of preview.shifts) {
    if (!byEmployee[s.employeeName]) byEmployee[s.employeeName] = []
    byEmployee[s.employeeName].push(s)
  }
  const employees = Object.keys(byEmployee).sort()

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Prévisualisation du planning</p>
              {rayonType && (
                <span className="h-5 px-2 rounded-full bg-teal-100 dark:bg-teal-500/20 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                  {RAYON_TYPE_LABELS[rayonType]}
                </span>
              )}
            </div>
            {preview.title && (
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">{preview.title}</p>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 px-5 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
            </span>
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              <span className="font-semibold text-gray-900 dark:text-white">{preview.shifts.length}</span> créneaux détectés
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              <span className="font-semibold text-gray-900 dark:text-white">{employees.length}</span> employés
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              <span className="font-semibold text-gray-900 dark:text-white">{preview.dates.length}</span> jours
              {preview.dates[0] && ` · ${fmtShortDate(preview.dates[0])} – ${fmtShortDate(preview.dates[preview.dates.length - 1])}`}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {employees.map(emp => (
            <div key={emp} className="mb-4">
              <p className="text-xs font-semibold text-gray-700 dark:text-neutral-300 mb-1.5">{emp}</p>
              <div className="grid grid-cols-2 gap-1">
                {byEmployee[emp].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-500/10 text-xs">
                    <span className="font-medium text-teal-700 dark:text-teal-300 shrink-0">
                      {s.startTime} – {s.endTime}
                    </span>
                    <span className="text-gray-400 dark:text-neutral-500 truncate">{fmtShortDate(s.date)}</span>
                    {s.activityCode && (
                      <span className="ml-auto text-[10px] text-gray-400 dark:text-neutral-500 shrink-0">{s.activityCode}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {preview.shifts.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-neutral-500 text-center py-6">
              Aucun créneau horaire détecté dans ce fichier.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400 dark:text-neutral-500">
            Les créneaux existants pour ces dates seront remplacés.
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={importing}
              className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50">
              Annuler
            </button>
            <button onClick={onConfirm} disabled={importing || preview.shifts.length === 0}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50">
              {importing ? 'Import en cours…' : `Importer ${preview.shifts.length} créneaux`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Section import Tamigo ────────────────────────────────────────────────── */
function TamigoImportSection({ magasinId, userId, userRayonType }) {
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [rayonType, setRayonType] = useState(userRayonType || '')
  const inputRef = useRef()

  async function handleFile(file) {
    if (!file?.name.match(/\.xlsx?$/i)) { setError('Fichier Excel (.xlsx) requis'); return }
    setError(null); setSuccess(null); setParsing(true)
    try {
      const result = await parseTamigoExcel(file)
      setPreview(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setParsing(false)
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    if (!preview || !magasinId || !rayonType) return
    setImporting(true)
    try {
      // Supprimer les créneaux planning existants pour ce rayon + ces dates
      if (preview.dates.length > 0) {
        const q = query(
          collection(db, 'calendar_events'),
          where('magasinId', '==', magasinId),
          where('type', '==', 'planning_shift'),
          where('rayonType', '==', rayonType),
        )
        const snap = await getDocs(q)
        const toDelete = snap.docs.filter(d => preview.dates.includes(d.data().date))
        if (toDelete.length > 0) {
          const delBatch = writeBatch(db)
          toDelete.forEach(d => delBatch.delete(d.ref))
          await delBatch.commit()
        }
      }

      // Insérer créneaux + absences par lots de 499
      const allEntries = [
        ...preview.shifts.map(s => ({
          type: 'planning_shift', title: s.employeeName,
          date: s.date, startTime: s.startTime, endTime: s.endTime,
          activityCode: s.activityCode || null, employeeName: s.employeeName,
        })),
        ...(preview.absences || []).map(a => ({
          type: 'planning_shift', title: a.employeeName,
          date: a.date, startTime: null, endTime: null,
          activityCode: a.absenceCode, employeeName: a.employeeName,
        })),
      ]
      const chunks = []
      for (let i = 0; i < allEntries.length; i += 499) chunks.push(allEntries.slice(i, i + 499))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const entry of chunk) {
          batch.set(doc(collection(db, 'calendar_events')), {
            ...entry, rayonType, magasinId, createdBy: userId,
            source: 'tamigo_import', createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
      }

      setSuccess(allEntries.length)
      setPreview(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  if (!magasinId) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-4">Import planning</h2>
        <p className="text-xs text-gray-400 dark:text-neutral-500">
          Sélectionnez un magasin pour importer un planning.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-300 mb-1">Import planning Tamigo</h2>
      <p className="text-xs text-gray-400 dark:text-neutral-500 mb-4">
        Importez un export Excel Tamigo pour afficher les horaires de l'équipe dans le calendrier.
      </p>

      {/* Sélecteur de rayon — masqué si le rôle fixe le rayon */}
      {userRayonType ? (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-neutral-500">Rayon :</span>
          <span className="h-6 px-2.5 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-black text-[11px] font-semibold flex items-center">
            {RAYON_TYPE_LABELS[userRayonType]}
          </span>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Rayon concerné *
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RAYON_TYPES.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => { setRayonType(r); setSuccess(null) }}
                className={['h-7 px-3 rounded-lg text-[11px] font-semibold border transition-colors',
                  rayonType === r
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent'
                    : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                {RAYON_TYPE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Zone de dépôt */}
      <div
        onDragOver={e => { e.preventDefault(); if (rayonType) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { if (rayonType) onDrop(e) }}
        onClick={() => { if (rayonType) inputRef.current?.click() }}
        className={[
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors p-10',
          !rayonType
            ? 'border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50 opacity-50 cursor-not-allowed'
            : dragging
              ? 'border-teal-400 bg-teal-50 dark:bg-teal-500/10 cursor-pointer'
              : 'border-gray-200 dark:border-neutral-700 hover:border-teal-300 dark:hover:border-teal-600 bg-white dark:bg-neutral-900 cursor-pointer',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        {parsing ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="h-8 w-8 text-teal-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-neutral-400">Lecture du fichier…</p>
          </div>
        ) : (
          <>
            <div className="h-12 w-12 rounded-2xl bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center">
              <svg className="h-6 w-6 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                Déposez votre export Tamigo ici
              </p>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">ou cliquez pour sélectionner un fichier .xlsx</p>
            </div>
          </>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
          <svg className="h-4 w-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Message de succès */}
      {success && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20">
          <svg className="h-4 w-4 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-teal-700 dark:text-teal-300 font-medium">
            {success} créneaux importés avec succès dans le calendrier.
          </p>
        </div>
      )}

      {/* Modal de prévisualisation */}
      {preview && (
        <PreviewModal
          preview={preview}
          rayonType={rayonType}
          onClose={() => setPreview(null)}
          onConfirm={handleImport}
          importing={importing}
        />
      )}
    </div>
  )
}

/* ── Page RH ──────────────────────────────────────────────────────────────── */
export default function RH() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const selectedId = useMagasin(s => s.selectedId)

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const isRayonRole = RAYON_TYPES.includes(profile?.role)
  const canImport = IMPORT_ROLES.includes(profile?.role)
  const magasinId = isGlobal ? selectedId : profile?.magasinId
  const userRayonType = isRayonRole ? profile?.role : null

  const visibleTools = RH_TOOLS.filter(t => t.roles === null || t.roles.includes(profile?.role))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Ressources Humaines</h1>
          <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
            Accédez aux outils RH du Groupe Nivault
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {visibleTools.map((t, i) => {
            const c = COLOR[t.color] || COLOR.blue
            return (
              <button
                key={i}
                onClick={() => t.url && window.open(t.url, '_blank', 'noopener,noreferrer')}
                disabled={!t.url}
                className={[
                  'flex flex-col items-start gap-3 p-5 rounded-2xl border text-left transition-all',
                  'bg-white dark:bg-neutral-900',
                  'border-gray-200 dark:border-neutral-800',
                  t.url ? `hover:shadow-lg hover:ring-4 ${c.ring}` : 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                <div className={`p-2.5 rounded-xl ${c.bg}`}>
                  <span className={c.icon}>{t.icon}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.label}</p>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1 leading-relaxed">{t.description}</p>
                </div>
                <span className={`w-full h-7 flex items-center justify-center rounded-lg text-xs font-semibold text-white transition-colors ${c.btn}`}>
                  {t.url ? 'Accéder →' : 'Bientôt disponible'}
                </span>
              </button>
            )
          })}
        </div>

        {canImport && (
          <TamigoImportSection magasinId={magasinId} userId={user?.uid} userRayonType={userRayonType} />
        )}
      </main>
    </div>
  )
}
