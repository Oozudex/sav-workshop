// Administration → un magasin : ses rayons (un compte de connexion chacun) et l'équipe de chaque rayon
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { RAYON_TYPES, RAYON_TYPE_LABELS, STAFF_POSTES, STAFF_POSTE_LABELS } from '../../lib/constants'
import { EMAIL_RE, accountError, afterCreateMessage, createAuthAccount } from '../../lib/accounts'
import {
  Avatar, BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, IconButton, INVALID, Modal, Notice, ResendButton, Section, Tag,
} from './ui'

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
}

/* ── Rayon : création / modification ───────────────────────────────────── */
function RayonModal({ magasinId, rayon, me, onClose, onDone }) {
  const editing = !!rayon
  const [form, setForm] = useState({ nom: rayon?.nom || '', type: rayon?.type || RAYON_TYPES[0], email: rayon?.email || '' })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const errors = {}
  if (!form.nom.trim()) errors.nom = 'Le nom est obligatoire.'
  if (!editing && !EMAIL_RE.test(form.email.trim())) errors.email = 'Adresse e-mail invalide.'
  const shown = tried ? errors : {}

  async function submit(e) {
    e.preventDefault()
    setTried(true); setError('')
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      const nom = form.nom.trim()
      if (editing) {
        await updateDoc(doc(db, 'magasins', magasinId, 'rayons', rayon.id), { nom, type: form.type, updatedAt: serverTimestamp() })
        if (rayon.uid) await updateDoc(doc(db, 'users', rayon.uid), { displayName: nom, role: form.type, updatedAt: serverTimestamp() })
        onDone({ tone: 'ok', text: `Rayon « ${nom} » mis à jour.` }, rayon.id)
      } else {
        const email = form.email.trim()
        const uid = await createAuthAccount(email, nom)
        const ref = await addDoc(collection(db, 'magasins', magasinId, 'rayons'), {
          nom, type: form.type, email, uid, createdAt: serverTimestamp(), createdBy: me,
        })
        await setDoc(doc(db, 'users', uid), {
          displayName: nom, email, role: form.type, magasinId, rayonId: ref.id,
          isActive: true, createdAt: serverTimestamp(), createdBy: me,
        })
        onDone(await afterCreateMessage('Rayon', email), ref.id)
      }
      onClose()
    } catch (err) {
      setError(accountError(err))
    } finally { setBusy(false) }
  }

  return (
    <Modal title={editing ? `Modifier le rayon ${rayon.nom}` : 'Nouveau rayon'}
      subtitle={editing ? rayon.email : 'Chaque rayon a son compte de connexion : il reçoit un e-mail pour choisir son mot de passe.'}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" form="rayon-form" disabled={busy} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le rayon'}</button>
      </>}>
      <form id="rayon-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom du rayon" error={shown.nom}>
            <input className={`Input ${shown.nom ? INVALID : ''}`} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Ex. Cycle" autoFocus />
          </Field>
          <Field label="Type" hint="Détermine les outils accessibles">
            <select className="Input" value={form.type} onChange={e => set('type', e.target.value)}>
              {RAYON_TYPES.map(t => <option key={t} value={t}>{RAYON_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="E-mail de connexion du rayon" error={shown.email} hint={editing ? 'Non modifiable' : 'Ex. la boîte Outlook du rayon'}>
          <input type="email" className={`Input ${shown.email ? INVALID : ''}`} value={form.email} disabled={editing}
            onChange={e => set('email', e.target.value)} placeholder="rayon@reseau-intersport.fr" autoComplete="off" />
        </Field>
        {error && <Notice notice={{ tone: 'error', text: error }} />}
      </form>
    </Modal>
  )
}

/* ── Membre de l'équipe : modification ──────────────────────────────────── */
function MemberModal({ member, onClose, onSave }) {
  const [form, setForm] = useState({ nom: member.nom || '', poste: member.poste || STAFF_POSTES[0], actif: member.actif !== false })
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setBusy(true)
    try { await onSave(form); onClose() } finally { setBusy(false) }
  }
  return (
    <Modal title={`Modifier ${member.nom}`} onClose={onClose} size="max-w-sm"
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="submit" form="member-form" disabled={busy || !form.nom.trim()} className={BTN_PRIMARY}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}>
      <form id="member-form" onSubmit={submit} className="space-y-4">
        <Field label="Nom">
          <input className="Input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
        </Field>
        <Field label="Poste">
          <select className="Input" value={form.poste} onChange={e => setForm(f => ({ ...f, poste: e.target.value }))}>
            {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
          </select>
        </Field>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gray-900 dark:accent-white" checked={form.actif}
            onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
          <span>
            <span className="block text-sm text-gray-900 dark:text-white">Actif</span>
            <span className="block text-[11px] text-gray-500 dark:text-neutral-400">Décocher pour le retirer des listes (départ, longue absence) sans perdre l’historique.</span>
          </span>
        </label>
      </form>
    </Modal>
  )
}

/* ── Panneau d'un magasin ──────────────────────────────────────────────── */
export default function StorePanel({ magasinId, magasin, directeurs = [], showDirection = false, me }) {
  const [rayons, setRayons] = useState([])
  const [staff, setStaff] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [modal, setModal] = useState(null) // { type: 'rayon' | 'member', item? }
  const [notice, setNotice] = useState(null)
  const [nom, setNom] = useState('')
  const [poste, setPoste] = useState(STAFF_POSTES[0])
  const [adding, setAdding] = useState(false)
  const teamRef = useRef(null)

  // Sur téléphone, l'équipe est sous la liste des rayons : on y descend quand on choisit un rayon
  function selectRayon(id) {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => teamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  useEffect(() => {
    setSelectedId(null); setNotice(null)
    const q = query(collection(db, 'magasins', magasinId, 'rayons'), orderBy('type', 'asc'))
    return onSnapshot(q, snap => setRayons(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [magasinId])

  // Toute l'équipe du magasin en une requête (pour les compteurs par rayon)
  useEffect(() => {
    const q = query(collectionGroup(db, 'staff'), where('magasinId', '==', magasinId), orderBy('nom', 'asc'))
    return onSnapshot(q, snap => setStaff(snap.docs.map(d => ({ id: d.id, rayonId: d.ref.parent.parent.id, ...d.data() }))))
  }, [magasinId])

  const selected = rayons.find(r => r.id === selectedId) || rayons[0] || null
  const team = useMemo(() => staff.filter(s => s.rayonId === selected?.id), [staff, selected?.id])
  const countFor = id => staff.filter(s => s.rayonId === id && s.actif !== false).length
  const staffRef = (rayonId, id) => doc(db, 'magasins', magasinId, 'rayons', rayonId, 'staff', id)

  async function removeRayon(r) {
    const members = staff.filter(s => s.rayonId === r.id)
    if (!confirm(`Supprimer le rayon « ${r.nom} » ? Son compte de connexion n’aura plus accès à l’outil${members.length ? ` et ses ${members.length} membre(s) d’équipe seront retirés` : ''}.`)) return
    try {
      const batch = writeBatch(db)
      members.forEach(s => batch.delete(staffRef(r.id, s.id)))
      if (r.uid) batch.delete(doc(db, 'users', r.uid))
      batch.delete(doc(db, 'magasins', magasinId, 'rayons', r.id))
      await batch.commit()
      setNotice({ tone: 'ok', text: `Rayon « ${r.nom} » supprimé.` })
      if (selectedId === r.id) setSelectedId(null)
    } catch (err) { setNotice({ tone: 'error', text: accountError(err) }) }
  }

  async function addMember(e) {
    e.preventDefault()
    if (!nom.trim() || !selected) return
    setAdding(true)
    try {
      await addDoc(collection(db, 'magasins', magasinId, 'rayons', selected.id, 'staff'), {
        nom: nom.trim(), poste, actif: true, magasinId, rayonId: selected.id, createdAt: serverTimestamp(), createdBy: me,
      })
      setNom(''); setPoste(STAFF_POSTES[0])
    } catch (err) { setNotice({ tone: 'error', text: accountError(err) }) }
    finally { setAdding(false) }
  }

  async function saveMember(s, form) {
    await updateDoc(staffRef(s.rayonId, s.id), { nom: form.nom.trim(), poste: form.poste, actif: form.actif, updatedAt: serverTimestamp() })
  }

  async function removeMember(s) {
    if (!confirm(`Retirer « ${s.nom} » de l’équipe ?`)) return
    try { await deleteDoc(staffRef(s.rayonId, s.id)) }
    catch (err) { setNotice({ tone: 'error', text: accountError(err) }) }
  }

  const storeDirecteurs = directeurs.filter(d => d.magasinId === magasinId)
  const activeStaff = staff.filter(s => s.actif !== false).length

  return (
    <div className="space-y-4">
      {/* En-tête du magasin */}
      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-3">
        <span className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-black grid place-items-center text-lg font-bold shrink-0">
          {magasin?.nom?.[0]?.toUpperCase() || '?'}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white break-words">{magasin?.nom || 'Magasin'}</h2>
          <p className="text-xs text-gray-400 dark:text-neutral-500">Créé le {fmtDate(magasin?.createdAt)}</p>
          {showDirection ? (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className="text-[11px] text-gray-500 dark:text-neutral-400">Direction :</span>
              {storeDirecteurs.length
                ? storeDirecteurs.map(d => <Tag key={d.id}>{d.displayName}</Tag>)
                : <Tag dot="bg-amber-400">Aucun directeur</Tag>}
            </div>
          ) : null}
        </div>
        <dl className="w-full sm:w-auto grid grid-cols-2 gap-4 sm:gap-6 shrink-0 pt-3 sm:pt-0 border-t sm:border-0 border-gray-100 dark:border-neutral-800">
          <div><dt className="text-[11px] text-gray-400 dark:text-neutral-500">Rayons</dt><dd className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{rayons.length}</dd></div>
          <div><dt className="text-[11px] text-gray-400 dark:text-neutral-500">Équipe active</dt><dd className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{activeStaff}</dd></div>
        </dl>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 items-start">
        {/* Rayons */}
        <Section title="Rayons" count={rayons.length} hint="Chaque rayon se connecte avec son propre e-mail"
          action={<button onClick={() => { setNotice(null); setModal({ type: 'rayon' }) }} className={BTN_PRIMARY}>+ Rayon</button>}>
          {rayons.length === 0 ? (
            <EmptyState title="Aucun rayon" text="Créez le premier rayon : il recevra un e-mail pour choisir son mot de passe." />
          ) : (
            <ul className="p-2 space-y-1">
              {rayons.map(r => {
                const active = selected?.id === r.id
                return (
                  <li key={r.id} className={['flex items-center gap-2 rounded-xl pr-1.5 transition-colors',
                    active ? 'bg-gray-100 dark:bg-neutral-800' : 'hover:bg-gray-50 dark:hover:bg-neutral-800/50'].join(' ')}>
                    <button onClick={() => selectRayon(r.id)} aria-pressed={active}
                      className="flex-1 min-w-0 flex items-center gap-3 px-2.5 py-2.5 text-left">
                      <span className={['h-9 w-9 rounded-lg grid place-items-center shrink-0 text-[11px] font-bold',
                        active ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'].join(' ')}>
                        {(RAYON_TYPE_LABELS[r.type] || r.type || '?').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{r.nom}</span>
                          <Tag>{RAYON_TYPE_LABELS[r.type] || r.type}</Tag>
                        </span>
                        <span className="block text-[11px] text-gray-400 dark:text-neutral-500 break-all">{r.email || 'Sans compte de connexion'}</span>
                        <span className="block text-[11px] text-gray-500 dark:text-neutral-400">{countFor(r.id)} membre{countFor(r.id) > 1 ? 's' : ''} actif{countFor(r.id) > 1 ? 's' : ''}</span>
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {r.email && <ResendButton email={r.email} />}
                      <IconButton icon="edit" label={`Modifier le rayon ${r.nom}`} onClick={() => setModal({ type: 'rayon', item: r })} />
                      <IconButton icon="delete" danger label={`Supprimer le rayon ${r.nom}`} onClick={() => removeRayon(r)} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {/* Équipe du rayon sélectionné */}
        <div ref={teamRef} className="scroll-mt-16">
        <Section title={selected ? `Équipe · ${selected.nom}` : 'Équipe'} count={selected ? team.length : null}
          hint="Noms proposés dans les listes « Créé par », « Vendeur », « Auteur »…">
          {!selected ? (
            <EmptyState title="Choisissez un rayon" text="Son équipe s’affichera ici." />
          ) : (
            <>
              <form onSubmit={addMember} className="p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 sm:items-end border-b border-gray-100 dark:border-neutral-800">
                <Field label="Ajouter une personne">
                  <input className="Input h-9" placeholder="Prénom Nom" value={nom} onChange={e => setNom(e.target.value)} />
                </Field>
                <Field label="Poste">
                  <select className="Input h-9" value={poste} onChange={e => setPoste(e.target.value)}>
                    {STAFF_POSTES.map(p => <option key={p} value={p}>{STAFF_POSTE_LABELS[p]}</option>)}
                  </select>
                </Field>
                <button type="submit" disabled={adding || !nom.trim()} className={`${BTN_PRIMARY} h-9`}>{adding ? 'Ajout…' : 'Ajouter'}</button>
              </form>
              {team.length === 0 ? (
                <EmptyState title="Personne dans ce rayon" text="Ajoutez les vendeurs et responsables ci-dessus." />
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {team.map(s => (
                    <li key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.actif === false ? 'opacity-60' : ''}`}>
                      <Avatar name={s.nom} />
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-gray-900 dark:text-white">{s.nom}</span>
                        <Tag dark={s.poste === 'responsable'}>{STAFF_POSTE_LABELS[s.poste] || s.poste}</Tag>
                        {s.actif === false && <Tag dot="bg-gray-400">Inactif</Tag>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <IconButton icon="edit" label={`Modifier ${s.nom}`} onClick={() => setModal({ type: 'member', item: s })} />
                        <IconButton icon="delete" danger label={`Retirer ${s.nom}`} onClick={() => removeMember(s)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Section>
        </div>
      </div>

      {modal?.type === 'rayon' && (
        <RayonModal magasinId={magasinId} rayon={modal.item} me={me} onClose={() => setModal(null)}
          onDone={(n, id) => { setNotice(n); if (id) setSelectedId(id) }} />
      )}
      {modal?.type === 'member' && (
        <MemberModal member={modal.item} onClose={() => setModal(null)} onSave={form => saveMember(modal.item, form)} />
      )}
    </div>
  )
}
