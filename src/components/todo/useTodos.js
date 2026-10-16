// Todo list d'un rayon d'un magasin : tâches en direct, tâches automatiques (OP, atelier, récurrentes)
// créées une seule fois, mot du soir, et actions (ajouter, cocher, assigner, supprimer).
// perso : liste personnelle d'un acheteur ou de la direction (users/{uid}/todos_perso), avec ses
// tâches récurrentes, sans tâches automatiques des magasins ni mot du soir ; un acheteur y a aussi
// les budgets en fin de conservation à exporter.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../store/useAuth'
import { currentStatusSince } from '../../lib/ticketStats'
import {
  HISTORIQUE_JOURS, MOT_COLLECTION, RECURRENCE_COLLECTION, RECURRENCE_PERSO_COLLECTION, TODO_COLLECTION, TODO_PERSO_COLLECTION, addDays, atelierTodoSpecs, autoObsolete,
  baliseTodoSpecs, budgetExportTodoSpecs, opTodoSpecs, recurrenceSpecs, toMs, transfertTodoSpecs, ymd,
} from '../../lib/todos'
import { TRANSFER_ACTIVE_STATUSES } from '../../lib/transferts'
import { BALISE_TRANSFERT_COLLECTION, DEMANDE_ACTIVES } from '../../lib/balises'

export const motDocId = (magasinId, rayon) => `${magasinId}_${rayon}`

export function useTodos(magasinId, rayon, { perso = false } = {}) {
  const user = useAuth(s => s.user)
  const role = useAuth(s => s.profile?.role)
  const uid = user?.uid
  const today = ymd(new Date())
  const [todos, setTodos] = useState(null)
  const [recurrences, setRecurrences] = useState(null)
  const [mot, setMot] = useState(undefined)
  const [ops, setOps] = useState(null)
  const [tickets, setTickets] = useState(null)
  const [transferts, setTransferts] = useState(null)
  const [balises, setBalises] = useState(null)
  const [budgets, setBudgets] = useState(null)
  const [error, setError] = useState(false)
  const ready = perso ? !!uid : !!magasinId && !!rayon
  const magasin = ready && !perso // liste d'un rayon : tâches automatiques et mot du soir

  // Emplacement des documents : liste du rayon, ou liste personnelle du compte
  const todosCol = perso ? (uid ? collection(db, 'users', uid, TODO_PERSO_COLLECTION) : null) : collection(db, TODO_COLLECTION)
  const recurrencesCol = perso ? (uid ? collection(db, 'users', uid, RECURRENCE_PERSO_COLLECTION) : null) : collection(db, RECURRENCE_COLLECTION)
  const todoRef = id => doc(todosCol, id)
  const recurrenceRef = id => doc(recurrencesCol, id)
  // Champs qui rangent un document dans la liste du rayon
  const portee = perso ? {} : { magasinId, rayon }

  useEffect(() => {
    setTodos(null); setRecurrences(null); setMot(undefined)
    if (!ready) return
    const fail = () => setError(true)
    if (perso) {
      const unsubs = [
        onSnapshot(collection(db, 'users', uid, TODO_PERSO_COLLECTION), s => setTodos(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
        onSnapshot(collection(db, 'users', uid, RECURRENCE_PERSO_COLLECTION), s => setRecurrences(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
      ]
      setMot(null)
      return () => unsubs.forEach(u => u())
    }
    const scope = c => query(collection(db, c), where('magasinId', '==', magasinId), where('rayon', '==', rayon))
    const unsubs = [
      onSnapshot(scope(TODO_COLLECTION), s => setTodos(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
      onSnapshot(scope(RECURRENCE_COLLECTION), s => setRecurrences(s.docs.map(d => ({ id: d.id, ...d.data() }))), fail),
      onSnapshot(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), s => setMot(s.exists() ? s.data() : null), fail),
    ]
    return () => unsubs.forEach(u => u())
  }, [ready, perso, uid, magasinId, rayon])

  // OP en cours ou à venir (et terminées depuis peu) : tâches de mise en place et de fin
  useEffect(() => {
    if (!magasin) { setOps([]); return }
    return onSnapshot(query(collection(db, 'op_commerciales'), where('dateFin', '>=', addDays(today, -7))),
      s => setOps(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setOps([]))
  }, [magasin, today])

  // Atelier (rayon vélo) : vélos prêts à rendre, pour la relance des clients
  useEffect(() => {
    if (!magasin || rayon !== 'velo') { setTickets([]); return }
    getDocs(query(collection(db, 'tickets'), where('magasinId', '==', magasinId), where('status', '==', 'Ready')))
      .then(s => setTickets(s.docs.map(d => {
        const t = { id: d.id, ...d.data() }
        return { id: t.id, ticketNumber: t.ticketNumber, status: t.status, readySince: currentStatusSince(t) }
      })))
      .catch(() => setTickets([]))
  }, [magasin, magasinId, rayon])

  // Transferts de vélos (rayon vélo) : ce que le magasin doit faire
  useEffect(() => {
    if (!magasin || rayon !== 'velo') { setTransferts([]); return }
    return onSnapshot(query(collection(db, 'transferts'), where('status', 'in', TRANSFER_ACTIVE_STATUSES)),
      s => setTransferts(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setTransferts([]))
  }, [magasin, rayon])

  // Demandes de balises de diagnostic (rayon vélo) : ce que le magasin doit faire
  useEffect(() => {
    if (!magasin || rayon !== 'velo') { setBalises([]); return }
    return onSnapshot(query(collection(db, BALISE_TRANSFERT_COLLECTION), where('status', 'in', DEMANDE_ACTIVES)),
      s => setBalises(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setBalises([]))
  }, [magasin, rayon])

  // Liste perso d'un acheteur : budgets (fin de conservation, export à faire)
  const acheteur = ready && perso && role === 'acheteur'
  useEffect(() => {
    if (!acheteur) { setBudgets([]); return }
    return onSnapshot(collection(db, 'budgets'), s => setBudgets(s.docs.map(d => {
      const b = d.data()
      const at = b.export?.at?.toDate?.()
      return { id: d.id, nom: b.nom, annee: b.annee, exportAt: at ? ymd(at) : null }
    })), () => setBudgets([]))
  }, [acheteur])

  // Tâches automatiques attendues aujourd'hui
  const specs = useMemo(() => (ops && tickets && transferts && balises && budgets && recurrences ? [
    ...opTodoSpecs(ops, { magasinId, rayon, today }),
    ...atelierTodoSpecs(tickets, { magasinId, today }),
    ...transfertTodoSpecs(transferts, { magasinId }),
    ...baliseTodoSpecs(balises, { magasinId }),
    ...budgetExportTodoSpecs(budgets, { today }),
    ...recurrenceSpecs(recurrences, { today }),
  ] : null), [ops, tickets, transferts, balises, budgets, recurrences, magasinId, rayon, today])

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
        const ref = todoRef(s.id)
        if ((await tx.get(ref)).exists()) return // déjà créée par un collègue
        tx.set(ref, {
          ...portee, titre: s.titre, assigneA: s.assigneA || null, echeance: s.echeance || null, auto: s.auto,
          fait: false, faitPar: null, faitAt: null, createdAt: serverTimestamp(), createdBy: 'auto',
        })
      })),
      ...[...aRetirer, ...vieilles].map(t => deleteDoc(todoRef(t.id))),
    ]).catch(() => {}).finally(() => { syncing.current = false })
  }, [specs, todos, magasinId, rayon, perso, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──
  const actions = useMemo(() => ({
    // echeance : date facultative ('YYYY-MM-DD')
    add: (titre, { assigneA = null, echeance = null } = {}) => addDoc(todosCol, {
      ...portee, titre: titre.trim(), assigneA: assigneA || null, echeance: echeance || null, auto: null,
      fait: false, faitPar: null, faitAt: null, createdAt: serverTimestamp(), createdBy: uid || null,
    }),
    // faitPar : qui l'a fait (choisi en cochant), sinon la personne assignée
    toggle: (t, faitPar = null) => updateDoc(todoRef(t.id), t.fait
      ? { fait: false, faitPar: null, faitAt: null }
      : { fait: true, faitPar: faitPar || t.assigneA || null, faitAt: serverTimestamp() }),
    assign: (t, nom) => updateDoc(todoRef(t.id), { assigneA: nom || null }),
    rename: (t, titre) => updateDoc(todoRef(t.id), { titre: titre.trim() }),
    remove: t => deleteDoc(todoRef(t.id)),
    addRecurrence: ({ titre, jours, assigneA }) => addDoc(recurrencesCol, {
      ...portee, titre: titre.trim(), jours, assigneA: assigneA || null, actif: true,
      createdAt: serverTimestamp(), createdBy: uid || null,
    }),
    toggleRecurrence: r => updateDoc(recurrenceRef(r.id), { actif: r.actif === false }),
    removeRecurrence: r => deleteDoc(recurrenceRef(r.id)),
    saveMot: texte => setDoc(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), {
      magasinId, rayon, texte: texte.trim(), at: serverTimestamp(), vuPar: [], createdBy: uid || null,
    }),
    // Lu par un collègue : le mot disparaît (vuPar non vide)
    motVu: () => updateDoc(doc(db, MOT_COLLECTION, motDocId(magasinId, rayon)), { vuPar: arrayUnion(uid || 'lu') }),
  }), [magasinId, rayon, perso, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    todos: todos || [], recurrences: recurrences || [], mot: mot ?? null, today,
    loading: ready && (todos === null || mot === undefined), error, ...actions,
  }
}
