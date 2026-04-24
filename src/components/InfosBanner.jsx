import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { db } from '../lib/firebase'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { GLOBAL_ROLES, RAYON_TYPES, RAYON_TYPE_LABELS } from '../lib/constants'

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ── Modal de gestion des infos ──────────────────────────────────────────── */
function InfoModal({ info, profile, userId, onClose }) {
  const isNew = !info?.id
  const assignedRayons = profile?.role === 'acheteur' ? (profile?.rayons || []) : []

  const initialRayonType = info?.rayonType
    || (profile?.role === 'directeurgen' ? '' : assignedRayons[0] || '')

  const [form, setForm] = useState({
    titre: info?.titre || '',
    description: info?.description || '',
    lien: info?.lien || '',
    rayonType: initialRayonType,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const rayonChoices = isNew
    ? (profile?.role === 'directeurgen' ? RAYON_TYPES : (assignedRayons.length > 1 ? assignedRayons : []))
    : []

  async function handleSave() {
    if (!form.titre.trim()) { setError('Le titre est requis'); return }
    if (!form.rayonType) { setError('Sélectionnez un rayon'); return }
    setSaving(true)
    setError(null)
    try {
      const data = {
        titre: form.titre.trim(),
        description: form.description.trim(),
        lien: form.lien.trim() || null,
        rayonType: form.rayonType,
        actif: true,
      }
      if (isNew) {
        await addDoc(collection(db, 'infos_importantes'), {
          ...data, createdBy: userId, createdAt: serverTimestamp(),
        })
      } else {
        await updateDoc(doc(db, 'infos_importantes', info.id), data)
      }
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nouvelle info importante' : "Modifier l'info"}
          </p>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Sélecteur de rayon */}
          {rayonChoices.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
                Rayon *
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rayonChoices.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, rayonType: r }))}
                    className={[
                      'h-7 px-3 rounded-lg text-[11px] font-semibold border transition-colors',
                      form.rayonType === r
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

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5 block">
              Titre *
            </label>
            <input
              type="text"
              value={form.titre}
              onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
              placeholder="Ex : Nouvelle collection printemps"
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5 block">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Détails à transmettre à l'équipe..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5 block">
              Lien (optionnel)
            </label>
            <input
              type="url"
              value={form.lien}
              onChange={e => setForm(f => ({ ...f, lien: e.target.value }))}
              placeholder="https://..."
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── InfosBanner ─────────────────────────────────────────────────────────── */
export default function InfosBanner({ magasinId }) {
  const navigate = useNavigate()
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))

  const [ops, setOps] = useState([])
  const [customInfos, setCustomInfos] = useState([])
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const isAcheteur = profile?.role === 'acheteur'
  const isRayonRole = RAYON_TYPES.includes(profile?.role)
  const canManage = isAcheteur || profile?.role === 'directeurgen'

  const today = useMemo(getTodayStr, [])

  // Fetch OPs pour alertes du jour (début ou fin exacte)
  useEffect(() => {
    if (!profile) return
    const q = query(collection(db, 'op_commerciales'), where('dateFin', '>=', today))
    return onSnapshot(q, snap => {
      const result = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(op => {
          if (op.dateDebut !== today && op.dateFin !== today) return false

          const rayons = op.rayonTypes?.length ? op.rayonTypes : (op.rayonType ? [op.rayonType] : [])
          if (isRayonRole) {
            if (rayons.length > 0 && !rayons.includes(profile.role)) return false
          } else if (isAcheteur) {
            const userRayons = profile.rayons || []
            if (rayons.length > 0 && !rayons.some(r => userRayons.includes(r))) return false
          }

          if (op.magasinIds?.length && magasinId && !op.magasinIds.includes(magasinId)) return false
          return true
        })
      setOps(result)
    })
  }, [profile, magasinId, today])

  // Fetch infos personnalisées
  useEffect(() => {
    if (!profile) return
    let q
    if (isRayonRole) {
      q = query(collection(db, 'infos_importantes'),
        where('rayonType', '==', profile.role), where('actif', '==', true))
    } else if (isAcheteur) {
      const userRayons = profile.rayons || []
      if (!userRayons.length) return
      q = query(collection(db, 'infos_importantes'),
        where('rayonType', 'in', userRayons), where('actif', '==', true))
    } else {
      q = query(collection(db, 'infos_importantes'), where('actif', '==', true))
    }
    return onSnapshot(q, snap => {
      setCustomInfos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [profile])

  const opAlerts = useMemo(() => {
    const alerts = []
    for (const op of ops) {
      if (op.dateDebut === today) alerts.push({ kind: 'start', op, date: op.dateDebut })
      if (op.dateFin === today) alerts.push({ kind: 'end', op, date: op.dateFin })
    }
    return alerts
  }, [ops, today])

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette info importante ?')) return
    setDeleting(id)
    try { await deleteDoc(doc(db, 'infos_importantes', id)) }
    finally { setDeleting(null) }
  }

  if (!opAlerts.length && !customInfos.length && !canManage) return null

  return (
    <div className="mb-4 space-y-2">
      {/* Alertes OP */}
      {opAlerts.map(alert => (
        <div
          key={`${alert.op.id}-${alert.kind}`}
          className={[
            'flex items-start gap-3 px-4 py-3 rounded-xl border',
            alert.kind === 'start'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30',
          ].join(' ')}
        >
          <div className={[
            'h-6 w-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            alert.kind === 'start'
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
          ].join(' ')}>
            {alert.kind === 'start'
              ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={[
                'text-xs font-semibold',
                alert.kind === 'start' ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300',
              ].join(' ')}>
                {alert.kind === 'start' ? "Début d'OP — Aujourd'hui" : "Fin d'OP — Aujourd'hui"}
              </span>
            </div>
            <p className="text-xs text-gray-700 dark:text-neutral-300 mt-0.5">
              {alert.kind === 'start'
                ? `Mettre en place l'OP « ${alert.op.nom} »`
                : `Fin de l'OP « ${alert.op.nom} » — Retirer toute la mise en avant`
              }
            </p>
          </div>

          <button
            onClick={() => navigate(`/operations/${alert.op.id}`)}
            className={[
              'h-7 px-3 rounded-lg text-[11px] font-semibold shrink-0 transition-colors',
              alert.kind === 'start'
                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30'
                : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-500/30',
            ].join(' ')}
          >
            Voir l'OP →
          </button>
        </div>
      ))}

      {/* Infos personnalisées */}
      {customInfos.map(info => (
        <div
          key={info.id}
          className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30"
        >
          <div className="h-6 w-6 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 text-blue-600 dark:text-blue-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">{info.titre}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300">
                {RAYON_TYPE_LABELS[info.rayonType]}
              </span>
            </div>
            {info.description && (
              <p className="text-xs text-gray-600 dark:text-neutral-400 mt-0.5 leading-relaxed">{info.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {info.lien && (
              <a
                href={info.lien}
                target="_blank"
                rel="noopener noreferrer"
                className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors flex items-center"
              >
                Voir →
              </a>
            )}
            {canManage && (
              <>
                <button
                  onClick={() => setModal(info)}
                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:bg-white dark:hover:bg-neutral-800 hover:text-gray-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(info.id)}
                  disabled={deleting === info.id}
                  className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Bouton ajout acheteur / directeurgen */}
      {canManage && (
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 h-8 px-3 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 text-xs text-gray-400 dark:text-neutral-500 hover:border-amber-400 dark:hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ajouter une info importante
        </button>
      )}

      {modal !== null && (
        <InfoModal
          info={modal !== 'new' ? modal : null}
          profile={profile}
          userId={user?.uid}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
