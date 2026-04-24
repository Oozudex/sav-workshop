import { useState, useEffect } from 'react'
import { db } from '../lib/firebase'
import { collection, doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../store/useAuth'
import { RAYON_TYPES, RAYON_TYPE_LABELS, GLOBAL_ROLES } from '../lib/constants'

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const DAY_LABELS = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function emptyQuotas() {
  return Object.fromEntries(DAYS.map(d => [d, '']))
}

function quotasFromFirestore(data) {
  if (!data?.quotas) return emptyQuotas()
  return Object.fromEntries(
    DAYS.map(d => [d, data.quotas[d] != null ? String(data.quotas[d]) : ''])
  )
}

export default function CalendarSettings({ magasinId, isOpen, onClose }) {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const isRayonRole = RAYON_TYPES.includes(profile?.role)

  const managedRayons = (() => {
    if (profile?.role === 'directeurmag' || profile?.role === 'directeurgen') return RAYON_TYPES
    if (profile?.role === 'acheteur') return profile?.rayons?.length ? profile.rayons : RAYON_TYPES
    if (isRayonRole) return [profile.role]
    return RAYON_TYPES
  })()

  const [activeRayon, setActiveRayon] = useState(managedRayons[0] || 'velo')
  const [allSettings, setAllSettings] = useState({})
  const [saving, setSaving]     = useState(false)
  const [savedRayon, setSavedRayon] = useState(null)

  useEffect(() => {
    if (!isOpen || !magasinId) return
    const col = collection(db, 'magasins', magasinId, 'rayon_settings')
    return onSnapshot(col, snap => {
      setAllSettings(prev => {
        const next = { ...prev }
        snap.docs.forEach(d => { next[d.id] = quotasFromFirestore(d.data()) })
        return next
      })
    })
  }, [isOpen, magasinId])

  function setQuota(rayon, day, value) {
    setAllSettings(prev => ({
      ...prev,
      [rayon]: { ...(prev[rayon] || emptyQuotas()), [day]: value },
    }))
  }

  async function handleSave() {
    if (!magasinId) return
    setSaving(true)
    try {
      const rawQuotas = allSettings[activeRayon] || emptyQuotas()
      const cleanedQuotas = Object.fromEntries(
        DAYS.map(d => [d, rawQuotas[d] !== '' ? Number(rawQuotas[d]) : null])
      )
      await setDoc(
        doc(db, 'magasins', magasinId, 'rayon_settings', activeRayon),
        { quotas: cleanedQuotas, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true }
      )
      setSavedRayon(activeRayon)
      setTimeout(() => setSavedRayon(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const currentQuotas = allSettings[activeRayon] || emptyQuotas()
  const canWrite = profile?.role === 'directeurmag' || profile?.role === 'directeurgen'
    || GLOBAL_ROLES.includes(profile?.role)
    || (isRayonRole && profile.role === activeRayon)

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Paramètres calendrier</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Rayon tabs */}
          {managedRayons.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {managedRayons.map(r => (
                <button key={r} onClick={() => setActiveRayon(r)}
                  className={['h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors border',
                    activeRayon === r
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black border-transparent'
                      : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                  ].join(' ')}>
                  {RAYON_TYPE_LABELS[r]}
                </button>
              ))}
            </div>
          )}

          {/* Quota par jour */}
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-900 dark:text-white">
                Quota RDV Client — {RAYON_TYPE_LABELS[activeRayon]}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">
                Nombre max de RDV client par jour. Laissez vide pour aucune limite.
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map(day => (
                <div key={day} className="space-y-1.5">
                  <span className="block text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase text-center tracking-wide">
                    {DAY_LABELS[day]}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    placeholder="∞"
                    disabled={!canWrite}
                    value={currentQuotas[day] ?? ''}
                    onChange={e => setQuota(activeRayon, day, e.target.value)}
                    className="w-full text-center rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 disabled:opacity-50 text-xs text-gray-900 dark:text-white px-0 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-neutral-600"
                  />
                </div>
              ))}
            </div>
            {!canWrite && (
              <p className="text-[11px] text-gray-400 dark:text-neutral-600 italic">
                Vous pouvez consulter les paramètres mais pas les modifier.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
            Fermer
          </button>
          {canWrite && (
            <button onClick={handleSave} disabled={saving}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100 transition-colors">
              {savedRayon === activeRayon ? '✓ Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
