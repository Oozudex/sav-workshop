// Administration : magasins (rayons + équipes) et comptes (direction, acheteurs, directeurs de magasin)
import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import Navbar from '../components/Navbar'
import AccountsPanel from '../components/admin/AccountsPanel'
import StorePanel from '../components/admin/StorePanel'
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, INVALID, Modal, Notice, Section, Tag } from '../components/admin/ui'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import { GLOBAL_ROLES } from '../lib/constants'
import { accountError } from '../lib/accounts'

/* ── Nouveau magasin ───────────────────────────────────────────────────── */
function MagasinModal({ onClose, onCreate }) {
  const [nom, setNom] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setTried(true); setError('')
    if (!nom.trim()) return
    setBusy(true)
    try { await onCreate(nom.trim()); onClose() }
    catch (err) { setError(accountError(err)) }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Nouveau magasin" subtitle="Vous pourrez ensuite créer ses rayons et son équipe." onClose={onClose} size="max-w-sm"
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" form="magasin-form" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Création…' : 'Créer le magasin'}</button>
      </>}>
      <form id="magasin-form" onSubmit={submit} noValidate className="space-y-3">
        <Field label="Nom du magasin" error={tried && !nom.trim() ? 'Le nom est obligatoire.' : null}>
          <input className={`Input ${tried && !nom.trim() ? INVALID : ''}`} value={nom} onChange={e => setNom(e.target.value)}
            placeholder="Ex. Intersport Laval" autoFocus />
        </Field>
        {error && <Notice notice={{ tone: 'error', text: error }} />}
      </form>
    </Modal>
  )
}

export default function StoreSettings() {
  const { user, profile, refreshProfile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile, refreshProfile: s.refreshProfile })))
  const { selectedId, setSelectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const isDirecteurGen = profile?.role === 'directeurgen' // administrateurs compris
  const isDirecteurMag = profile?.role === 'directeurmag'
  const magasinId = isGlobal ? selectedId : profile?.magasinId

  const [tab, setTab] = useState('magasins')
  const [magasins, setMagasins] = useState([])
  const [magasin, setMagasin] = useState(null)
  const [directeurs, setDirecteurs] = useState([])
  const [showNewMagasin, setShowNewMagasin] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!isGlobal) return
    return onSnapshot(query(collection(db, 'magasins'), orderBy('nom', 'asc')), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMagasins(list)
      if (!selectedId && list.length) setSelectedId(list[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobal])

  useEffect(() => {
    if (!isDirecteurGen) { setDirecteurs([]); return }
    return onSnapshot(query(collection(db, 'users'), where('role', '==', 'directeurmag'), orderBy('createdAt', 'desc')),
      snap => setDirecteurs(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [isDirecteurGen])

  useEffect(() => {
    if (!magasinId) { setMagasin(null); return }
    return onSnapshot(doc(db, 'magasins', magasinId), snap => setMagasin(snap.exists() ? { id: snap.id, ...snap.data() } : null))
  }, [magasinId])

  async function createMagasin(nom) {
    const ref = await addDoc(collection(db, 'magasins'), { nom, createdAt: serverTimestamp(), createdBy: user.uid })
    if (isDirecteurMag) {
      await updateDoc(doc(db, 'users', user.uid), { magasinId: ref.id })
      await refreshProfile(user.uid)
    } else {
      setSelectedId(ref.id)
    }
    setNotice({ tone: 'ok', text: `Magasin « ${nom} » créé. Ajoutez maintenant ses rayons.` })
  }

  const title = isDirecteurGen ? 'Administration' : isDirecteurMag ? 'Mon magasin' : 'Magasins et équipes'
  const subtitle = isDirecteurGen
    ? 'Magasins, rayons, équipes et comptes de l’outil'
    : isDirecteurMag ? (magasin?.nom || 'Rayons et équipe de votre magasin') : 'Rayons et équipes des magasins'
  const directeurOf = id => directeurs.filter(d => d.magasinId === id).map(d => d.displayName).join(', ')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
              <p className="text-xs sm:text-sm text-gray-400 dark:text-neutral-500 mt-0.5">{subtitle}</p>
            </div>
            {isDirecteurGen && tab === 'magasins' && (
              <button onClick={() => setShowNewMagasin(true)} className={`${BTN_PRIMARY} h-9 sm:h-8`}>+ Nouveau magasin</button>
            )}
          </div>

          {/* Onglets (direction) */}
          {isDirecteurGen && (
            <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800" role="tablist">
              {[['magasins', 'Magasins', magasins.length], ['comptes', 'Comptes', null]].map(([key, label, n]) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={['h-9 px-3 sm:px-4 -mb-px border-b-2 text-xs font-semibold transition-colors whitespace-nowrap',
                    tab === key ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-300'].join(' ')}>
                  {label}
                  {n != null && <span className="ml-1.5 font-medium text-gray-400 dark:text-neutral-500">{n}</span>}
                </button>
              ))}
            </div>
          )}

          <Notice notice={notice} onClose={() => setNotice(null)} />

          {tab === 'comptes' && isDirecteurGen ? (
            <AccountsPanel me={user.uid} isAdmin={!!profile?.isAdmin} magasins={magasins} />
          ) : isGlobal ? (
            magasins.length === 0 ? (
              <Section title="Magasins" count={0}>
                <EmptyState title="Aucun magasin" text={isDirecteurGen ? 'Créez le premier magasin pour commencer.' : 'Aucun magasin n’a encore été créé.'}
                  action={isDirecteurGen && <button onClick={() => setShowNewMagasin(true)} className={BTN_PRIMARY}>+ Nouveau magasin</button>} />
              </Section>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-start">
                {/* Liste des magasins : menu déroulant sur téléphone, colonne sur ordinateur */}
                <div className="lg:hidden">
                  <label className="sr-only" htmlFor="admin-magasin">Magasin</label>
                  <select id="admin-magasin" className="Input h-10 text-sm" value={magasinId || ''} onChange={e => setSelectedId(e.target.value)}>
                    {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                </div>
                <Section title="Magasins" count={magasins.length} className="hidden lg:block lg:sticky lg:top-16">
                  <ul className="p-2 space-y-1 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {magasins.map(m => {
                      const active = m.id === magasinId
                      const dir = directeurOf(m.id)
                      return (
                        <li key={m.id}>
                          <button onClick={() => setSelectedId(m.id)} aria-current={active ? 'true' : undefined}
                            className={['w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                              active ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'hover:bg-gray-50 dark:hover:bg-neutral-800/60'].join(' ')}>
                            <span className={['h-8 w-8 rounded-lg grid place-items-center shrink-0 text-xs font-bold',
                              active ? 'bg-white/15 dark:bg-black/10' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'].join(' ')}>
                              {m.nom?.[0]?.toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{m.nom}</span>
                              {isDirecteurGen && (
                                <span className={`block text-[11px] truncate ${active ? 'opacity-70' : dir ? 'text-gray-400 dark:text-neutral-500' : 'text-amber-600 dark:text-amber-400'}`}>
                                  {dir || 'Aucun directeur'}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
                {magasinId && <StorePanel key={magasinId} magasinId={magasinId} magasin={magasin} me={user.uid}
                  directeurs={directeurs} showDirection={isDirecteurGen} />}
              </div>
            )
          ) : magasinId ? (
            <StorePanel magasinId={magasinId} magasin={magasin} me={user.uid} />
          ) : (
            <Section title="Votre magasin">
              <EmptyState title="Aucun magasin lié à votre compte"
                text={isDirecteurMag ? 'Créez votre magasin pour commencer à gérer ses rayons et son équipe.' : 'Demandez à la direction de vous rattacher à un magasin.'}
                action={isDirecteurMag && <button onClick={() => setShowNewMagasin(true)} className={BTN_PRIMARY}>Créer mon magasin</button>} />
            </Section>
          )}

          {isGlobal && !isDirecteurGen && (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500"><Tag>Acheteur</Tag> Vous gérez les rayons et les équipes ; les comptes de direction sont gérés par l’administration.</p>
          )}
        </div>
      </main>

      {showNewMagasin && <MagasinModal onClose={() => setShowNewMagasin(false)} onCreate={createMagasin} />}
    </div>
  )
}
