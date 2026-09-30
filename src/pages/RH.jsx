import { useState, useRef, useEffect } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import {
  collection, query, where, getDocs, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'
import { ABSENCE_LABELS, parseTamigoExcel } from '../lib/parseTamigo'
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, EmptyState, LABEL, Notice, Section, Tag } from '../components/admin/ui'

const IMPORT_ROLES = ['directeurmag', ...GLOBAL_ROLES, ...RAYON_TYPES]
const TAMIGO_URL = 'https://signin.tamigo.com/login?signin=5d11b9f27e54d48168a008e9064e3a75'

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function fmtShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAYS_FR[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

// L'import est une photo du planning Tamigo au moment de l'import : rien ne se met à jour ensuite
function SnapshotWarning({ compact = false }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
      <svg className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
        <span className="font-semibold">Restez vigilant sur les horaires.</span>{' '}
        L’import reprend le planning tel qu’il est aujourd’hui dans Tamigo : les modifications faites dans Tamigo après l’import
        n’apparaîtront pas dans le calendrier.{!compact && ' Réimportez le planning après chaque changement (les créneaux des mêmes jours sont remplacés).'}
      </p>
    </div>
  )
}

/* ── Vérification avant import ───────────────────────────────────────────── */
function PreviewModal({ preview, rayonType, onConfirm, onClose, importing }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && !importing && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, importing])

  // Par employé : créneaux et absences, dans l'ordre des jours
  const byEmployee = {}
  const add = (name, entry) => { (byEmployee[name] ||= []).push(entry) }
  preview.shifts.forEach(s => add(s.employeeName, { ...s, kind: 'shift' }))
  ;(preview.absences || []).forEach(a => add(a.employeeName, { ...a, kind: 'absence' }))
  const employees = Object.keys(byEmployee).sort()
  employees.forEach(e => byEmployee[e].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '')))
  const absences = preview.absences?.length || 0
  const first = preview.dates[0]
  const last = preview.dates[preview.dates.length - 1]

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Vérifier le planning avant import"
        className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]">

        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Vérifier avant d’importer</p>
            {preview.title && <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5 break-words">{preview.title}</p>}
            <div className="flex flex-wrap gap-1 mt-2">
              <Tag dark>{RAYON_TYPE_LABELS[rayonType] || rayonType}</Tag>
              {first && <Tag>{fmtShortDate(first)} → {fmtShortDate(last)}</Tag>}
              <Tag>{employees.length} personne{employees.length > 1 ? 's' : ''}</Tag>
              <Tag>{preview.shifts.length} créneau{preview.shifts.length > 1 ? 'x' : ''}</Tag>
              {absences > 0 && <Tag>{absences} absence{absences > 1 ? 's' : ''}</Tag>}
            </div>
          </div>
          <button onClick={onClose} disabled={importing} aria-label="Fermer"
            className="h-8 w-8 -mr-1 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-neutral-800">
          {employees.length === 0 && (
            <EmptyState title="Aucun créneau trouvé" text="Vérifiez que le fichier est bien l’export Excel du planning Tamigo." />
          )}
          {employees.map(emp => (
            <div key={emp} className="px-4 sm:px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={emp} size="h-7 w-7 text-[10px]" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">{emp}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {byEmployee[emp].map((s, i) => s.kind === 'shift' ? (
                  <div key={i} className="rounded-lg border border-gray-200 dark:border-neutral-700 px-2.5 py-1.5">
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtShortDate(s.date)}{s.activityCode ? ` · ${s.activityCode}` : ''}</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{s.startTime} – {s.endTime}</p>
                  </div>
                ) : (
                  <div key={i} className="rounded-lg border border-dashed border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/40 px-2.5 py-1.5">
                    <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtShortDate(s.date)}</p>
                    <p className="text-xs font-medium text-gray-600 dark:text-neutral-300">{ABSENCE_LABELS[s.absenceCode] || s.absenceCode}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 sm:px-5 py-3 space-y-3 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <SnapshotWarning />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">Les créneaux déjà importés pour ces jours seront remplacés.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} disabled={importing} className={BTN_SECONDARY}>Annuler</button>
              <button onClick={onConfirm} disabled={importing || preview.shifts.length === 0} className={BTN_PRIMARY}>
                {importing ? 'Import en cours…' : `Importer ${preview.shifts.length + absences} ligne${preview.shifts.length + absences > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Import du planning Tamigo ───────────────────────────────────────────── */
function TamigoImportSection({ magasinId, userId, userRayonType }) {
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState(null)
  const [imported, setImported] = useState(false)
  const [rayonType, setRayonType] = useState(userRayonType || '')
  const inputRef = useRef()

  async function handleFile(file) {
    if (!file?.name.match(/\.xlsx?$/i)) { setNotice({ tone: 'error', text: 'Il faut un fichier Excel (.xlsx) exporté depuis Tamigo.' }); return }
    setNotice(null); setImported(false); setParsing(true)
    try {
      const result = await parseTamigoExcel(file)
      // Une même absence peut figurer sur plusieurs lignes de l'export : une seule par personne et par jour
      const seen = new Set()
      const absences = (result.absences || []).filter(a => {
        const key = `${a.employeeName}|${a.date}|${a.absenceCode}`
        return seen.has(key) ? false : seen.add(key)
      })
      setPreview({ ...result, absences })
    } catch (e) {
      setNotice({ tone: 'error', text: e.message })
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
        for (let i = 0; i < toDelete.length; i += 499) {
          const delBatch = writeBatch(db)
          toDelete.slice(i, i + 499).forEach(d => delBatch.delete(d.ref))
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
      for (let i = 0; i < allEntries.length; i += 499) {
        const batch = writeBatch(db)
        for (const entry of allEntries.slice(i, i + 499)) {
          batch.set(doc(collection(db, 'calendar_events')), {
            ...entry, rayonType, magasinId, createdBy: userId,
            source: 'tamigo_import', createdAt: serverTimestamp(),
          })
        }
        await batch.commit()
      }

      const first = preview.dates[0]
      const last = preview.dates[preview.dates.length - 1]
      setNotice({ tone: 'ok', text: `Planning importé : ${allEntries.length} ligne${allEntries.length > 1 ? 's' : ''}${first ? ` du ${fmtShortDate(first)} au ${fmtShortDate(last)}` : ''}, visibles dans le calendrier de l’accueil.` })
      setImported(true)
      setPreview(null)
    } catch (e) {
      setNotice({ tone: 'error', text: e.message })
    } finally {
      setImporting(false)
    }
  }

  const ready = !!rayonType

  return (
    <Section title="Importer le planning Tamigo" hint="Affiche les horaires de l’équipe dans le calendrier de l’accueil">
      <div className="p-4 sm:p-5 space-y-4">
        {!magasinId ? (
          <EmptyState title="Choisissez un magasin" text="Sélectionnez le magasin dans la barre du haut pour importer son planning." />
        ) : (
          <>
            {/* Rayon */}
            <div className="space-y-1.5">
              <span className={LABEL}>Rayon</span>
              {userRayonType ? (
                <div><Tag dark>{RAYON_TYPE_LABELS[userRayonType]}</Tag></div>
              ) : (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rayon du planning">
                  {RAYON_TYPES.map(r => (
                    <button key={r} type="button" role="radio" aria-checked={rayonType === r}
                      onClick={() => { setRayonType(r); setNotice(null); setImported(false) }}
                      className={['h-8 px-3 rounded-lg text-xs font-semibold border transition-colors',
                        rayonType === r ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-black'
                          : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800'].join(' ')}>
                      {RAYON_TYPE_LABELS[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fichier */}
            <div
              role="button" tabIndex={ready ? 0 : -1} aria-disabled={!ready}
              onKeyDown={e => { if (ready && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click() } }}
              onDragOver={e => { e.preventDefault(); if (ready) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { if (ready) onDrop(e); else e.preventDefault() }}
              onClick={() => { if (ready) inputRef.current?.click() }}
              className={['flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors',
                !ready ? 'border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50 cursor-not-allowed'
                  : dragging ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800/60 cursor-pointer'
                    : 'border-gray-300 hover:border-gray-500 dark:border-neutral-700 dark:hover:border-neutral-500 cursor-pointer'].join(' ')}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
              {parsing ? (
                <>
                  <svg className="h-7 w-7 text-gray-500 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-neutral-400">Lecture du fichier…</p>
                </>
              ) : (
                <>
                  <span className={`h-11 w-11 rounded-xl grid place-items-center ${ready ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-400 dark:bg-neutral-800'}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {ready ? 'Déposez l’export Excel de Tamigo ici' : 'Choisissez d’abord le rayon'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                      {ready ? 'ou cliquez pour choisir le fichier .xlsx' : 'Le planning sera rattaché à ce rayon'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <Notice notice={notice} onClose={() => { setNotice(null); setImported(false) }} />
            {imported && <SnapshotWarning compact />}
          </>
        )}
      </div>

      {preview && (
        <PreviewModal preview={preview} rayonType={rayonType} onClose={() => setPreview(null)}
          onConfirm={handleImport} importing={importing} />
      )}
    </Section>
  )
}

/* ── Page RH ──────────────────────────────────────────────────────────────── */
export default function RH() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  const selectedId = useMagasin(s => s.selectedId)

  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const isRayonRole = RAYON_TYPES.includes(profile?.role)
  const canImport = IMPORT_ROLES.includes(profile?.role)
  const magasinId = isGlobal ? selectedId : profile?.magasinId
  const userRayonType = isRayonRole ? profile?.role : null

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Ressources humaines</h1>
            <p className="text-xs sm:text-sm text-gray-400 dark:text-neutral-500 mt-0.5">Plannings de l’équipe et outils RH du Groupe Nivault</p>
          </div>

          <div className={`grid grid-cols-1 gap-4 items-start ${canImport ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}>
            {canImport && <TamigoImportSection magasinId={magasinId} userId={user?.uid} userRayonType={userRayonType} />}

            <div className="space-y-4">
              {/* Tamigo */}
              <Section title="Tamigo" hint="Plannings et temps de travail">
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
                    Consultez et modifiez les plannings, puis exportez-les en Excel pour les importer ici.
                  </p>
                  <a href={TAMIGO_URL} target="_blank" rel="noopener noreferrer"
                    className={`${BTN_PRIMARY} h-9 w-full inline-flex items-center justify-center gap-1.5`}>
                    Ouvrir Tamigo
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  </a>
                </div>
              </Section>

              {/* Mode d'emploi de l'import */}
              {canImport && (
                <Section title="Mettre à jour le calendrier">
                  <ol className="p-4 space-y-3">
                    {[
                      'Dans Tamigo, exportez le planning de la semaine au format Excel.',
                      'Choisissez le rayon, puis déposez le fichier ici.',
                      'Vérifiez les horaires et confirmez l’import.',
                      'Si le planning change dans Tamigo, refaites l’import.',
                    ].map((step, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-black text-[10px] font-bold">{i + 1}</span>
                        <span className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
