// Todo list d'un rayon d'un magasin : tâches en direct, tâches automatiques (OP, atelier, récurrentes)
// créées une seule fois, mot du soir, et actions (ajouter, cocher, assigner, supprimer).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../store/useAuth'
import { currentStatusSince } from '../../lib/ticketStats'
import {
  HISTORIQUE_JOURS, MOT_COLLECTION, RECURRENCE_COLLECTION, TODO_COLLECTION, addDays, atelierTodoSpecs, autoObsolete,
  opTodoSpecs, recurrenceSpecs, toMs, transfertTodoSpecs, ymd,
} from '../../lib/todos'
import { TRANSFER_ACTIVE_STATUSES } from '../../lib/transferts'

export const motDocId = (magasinId, rayon) => `${magasinId}_${rayon}`

export function useTodos(magasinId, rayon) {
  const user = useAuth(s => s.user)
  const today = ymd(new Date())
  const [todos, setTodos] = useState(null)
  const [recurrences, setRecurrences] = useState(null)
  const [mot, setMot] = useState(undefined)
  const [ops, setOps] = useState(null)
  const [tickets, setTickets] = useState(null)
  const [transferts, setTransferts] = useState(null)
  const [error, setError] = useState(false)
  const ready = !!magasinId && !!rayon

  useEffect(() => {
    setTodos(null); setRecurrences(null); setMot(undefined)
    if (!ready) return
    const fail = () => setError(true)
    const scope = c => query(collection(db, c), where('magasinId', '==', magasinId), where('rayon', '==', rayon))
    const unsubs = [
      onSnapshot(scope(TODO_COLLECTION), s => setTodos(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
      onSnapshot(scope(RECURRENCE_COLLECTION), s => setRecurrences(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
      onSnapshot(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), s => setMot(s.exists() ? s.data() : null), fail),
    ]
    return () => unsubs.forEach(u => u())
  }, [ready, magasinId, rayon])

  // OP en cours ou à venir (et terminées depuis peu) : tâches de mise en place et de fin
  useEffect(() => {
    if (!ready) return
    return onSnapshot(query(collection(db, 'op_commerciales'), where('dateFin', '>=', addDays(today, -7))),
      s => setOps(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setOps([]))
  }, [ready, today])

  // Atelier (rayon vélo) : vélos prêts à rendre, pour la relance des clients
  useEffect(() => {
    if (!ready || rayon !== 'velo') { setTickets([]); return }
    getDocs(query(collection(db, 'tickets'), where('magasinId', '==', magasinId), where('status', '==', 'Ready')))
      .then(s => setTickets(s.docs.map(d => {
        const t = { id: d.id, ...d.data() }
        return { id: t.id, ticketNumber: t.ticketNumber, status: t.status, readySince: currentStatusSince(t) }
      })))
      .catch(() => setTickets([]))
  }, [ready, magasinId, rayon])

  // Transferts de vélos (rayon vélo) : ce que le magasin doit faire
  useEffect(() => {
    if (!ready || rayon !== 'velo') { setTransferts([]); return }
    return onSnapshot(query(collection(db, 'transferts'), where('status', 'in', TRANSFER_ACTIVE_STATUSES)),
      s => setTransferts(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setTransferts([]))
  }, [ready, rayon])

  // Tâches automatiques attendues aujourd'hui
  const specs = useMemo(() => (ops && tickets && transferts && recurrences ? [
    ...opTodoSpecs(ops, { magasinId, rayon, today }),
    ...atelierTodoSpecs(tickets, { magasinId, today }),
    ...transfertTodoSpecs(transferts, { magasinId }),
    ...recurrenceSpecs(recurrences, { today }),
  ] : null), [ops, tickets, transferts, recurrences, magasinId, rayon, today])

  // Synchronisation : création unique des tâches automatiques, retrait de celles devenues inutiles,
  // nettoyage des tâches terminées depuis plus de 30 jours
  const syncing = useRef(false)
  useEffect(() => {
    if (!specs || !todos || syncing.current) return
    const ids = new Set(todos.map(t => t.id))
    const specIds = new Set(specs.map(s => s.id))
    const aCreer = specs.filter(s => !ids.has(s.id))
    const aRetirer = todos.filter(t => autoObsolete(t, specIds))
    const limite = Date.now() - HISTORIQUE_JOURS * 86400000
    const vieilles = todos.filter(t => t.fait && toMs(t.faitAt) && toMs(t.faitAt) < limite)
    if (!aCreer.length && !aRetirer.length && !vieilles.length) return
    syncing.current = true
    Promise.all([
      ...aCreer.map(s => runTransaction(db, async tx => {
        const ref = doc(db, TODO_COLLECTION, s.id)
        if ((await tx.get(ref)).exists()) return // déjà créée par un collègue
        tx.set(ref, {
          magasinId, rayon, titre: s.titre, assigneA: s.assigneA || null, echeance: s.echeance || null, auto: s.auto,
          fait: false, faitPar: null, faitAt: null, createdAt: serverTimestamp(), createdBy: 'auto',
        })
      })),
      ...[...aRetirer, ...vieilles].map(t => deleteDoc(doc(db, TODO_COLLECTION, t.id))),
    ]).catch(() => {}).finally(() => { syncing.current = false })
  }, [specs, todos, magasinId, rayon])

  // ── Actions ──
  const actions = useMemo(() => ({
    add: (titre, assigneA = null) => addDoc(collection(db, TODO_COLLECTION), {
      magasinId, rayon, titre: titre.trim(), assigneA: assigneA || null, echeance: null, auto: null,
      fait: false, faitPar: null, faitAt: null, createdAt: serverTimestamp(), createdBy: user?.uid || null,
    }),
    // faitPar : qui l'a fait (choisi en cochant), sinon la personne assignée
    toggle: (t, faitPar = null) => updateDoc(doc(db, TODO_COLLECTION, t.id), t.fait
      ? { fait: false, faitPar: null, faitAt: null }
      : { fait: true, faitPar: faitPar || t.assigneA || null, faitAt: serverTimestamp() }),
    assign: (t, nom) => updateDoc(doc(db, TODO_COLLECTION, t.id), { assigneA: nom || null }),
    rename: (t, titre) => updateDoc(doc(db, TODO_COLLECTION, t.id), { titre: titre.trim() }),
    remove: t => deleteDoc(doc(db, TODO_COLLECTION, t.id)),
    addRecurrence: ({ titre, jours, assigneA }) => addDoc(collection(db, RECURRENCE_COLLECTION), {
      magasinId, rayon, titre: titre.trim(), jours, assigneA: assigneA || null, actif: true,
      createdAt: serverTimestamp(), createdBy: user?.uid || null,
    }),
    toggleRecurrence: r => updateDoc(doc(db, RECURRENCE_COLLECTION, r.id), { actif: r.actif === false }),
    removeRecurrence: r => deleteDoc(doc(db, RECURRENCE_COLLECTION, r.id)),
    saveMot: (texte, auteur) => setDoc(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), {
      magasinId, rayon, texte: texte.trim(), auteur, at: serverTimestamp(), vuPar: [], createdBy: user?.uid || null,
    }),
    motVu: nom => updateDoc(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), { vuPar: arrayUnion(nom) }),
  }), [magasinId, rayon, user?.uid])

  return {
    todos: todos || [], recurrences: recurrences || [], mot: mot ?? null, today,
    loading: ready && (todos === null || mot === undefined), error, ...actions,
  }
}
