// Budgets acheteurs : lecture en temps réel et écritures Firestore.
// budget_univers / budget_magasins : listes communes ; budgets/{id} : segments et budget de base ;
// budgets/{id}/marques/{id} : une ligne par marque et segment (N-1 et saisie par magasin).
import { useEffect, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { useShallow } from 'zustand/react/shallow'
import { db } from './firebase'
import { useAuth } from '../store/useAuth'
import {
  DEFAULT_MAGASINS, DEFAULT_UNIVERS, budgetName, cleanMarque, editableLines, linesFromBudget, mergeSegments,
  planN1Import, previousSeason,
} from './budgets'

const BATCH_MAX = 450

function useCollection(path, order, enabled = true) {
  const [state, setState] = useState({ list: [], loading: true })
  const key = path.join('/')
  useEffect(() => {
    if (!enabled) return
    const q = query(collection(db, ...key.split('/')), ...order.map(([f, dir]) => orderBy(f, dir)))
    return onSnapshot(q,
      snap => setState({ list: snap.docs.map(d => ({ id: d.id, ...d.data() })), loading: false }),
      () => setState({ list: [], loading: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return state
}

// enabled : false pour les comptes qui n'ont pas accès aux budgets (magasins)
export const useBudgetUnivers = (enabled = true) => useCollection(['budget_univers'], [['ordre', 'asc']], enabled)
export const useBudgetMagasins = () => useCollection(['budget_magasins'], [['ordre', 'asc']])
export const useBudgets = () => useCollection(['budgets'], [['annee', 'desc']])
export const useBudgetMarques = id => useCollection(['budgets', id || '_', 'marques'], [], !!id)

export function useBudget(id) {
  const [state, setState] = useState({ budget: null, loading: true })
  useEffect(() => onSnapshot(doc(db, 'budgets', id),
    snap => setState({ budget: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false }),
    () => setState({ budget: null, loading: false })), [id])
  return state
}

// Utilisateur des budgets : auteur des écritures et droits ({ uid, displayName, role, univers })
export function useBudgetUser() {
  const { user, profile } = useAuth(useShallow(s => ({ user: s.user, profile: s.profile })))
  return useMemo(() => ({
    uid: user?.uid, displayName: profile?.displayName || user?.email || '',
    role: profile?.role || null, univers: profile?.univers || [],
  }), [user?.uid, user?.email, profile?.displayName, profile?.role, profile?.univers])
}

const author = user => ({ uid: user?.uid || null, nom: user?.displayName || '' })

// Écritures groupées par lots (500 opérations maximum par lot Firestore)
async function runBatches(ops) {
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + BATCH_MAX)) op(batch)
    await batch.commit()
  }
}

// ── Listes univers / magasins ───────────────────────────────────────────────────

export async function seedList(kind) {
  const items = kind === 'univers' ? DEFAULT_UNIVERS.map(nom => ({ nom })) : DEFAULT_MAGASINS
  const coll = collection(db, `budget_${kind}`)
  await runBatches(items.map((it, i) => b => b.set(doc(coll), { ...it, ordre: i + 1 })))
}

export function addListItem(kind, data, ordre) {
  return addDoc(collection(db, `budget_${kind}`), { ...data, ordre })
}

export function updateListItem(kind, id, data) {
  return updateDoc(doc(db, `budget_${kind}`, id), data)
}

export function removeListItem(kind, id) {
  return deleteDoc(doc(db, `budget_${kind}`, id))
}

// Échange la position de deux éléments
export async function swapListItems(kind, a, b) {
  const batch = writeBatch(db)
  batch.update(doc(db, `budget_${kind}`, a.id), { ordre: b.ordre })
  batch.update(doc(db, `budget_${kind}`, b.id), { ordre: a.ordre })
  await batch.commit()
}

// ── Budgets ─────────────────────────────────────────────────────────────────────

export async function findBudget(saison, annee) {
  const snap = await getDocs(query(collection(db, 'budgets'), where('saison', '==', saison), where('annee', '==', annee)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// Crée « BUDGET AH27 » ; reprend si demandé les marques et la saisie du budget N-1 comme N-1
export async function createBudget({ saison, annee, reprendre }, user) {
  if (await findBudget(saison, annee)) throw new Error(`${budgetName(saison, annee)} existe déjà.`)
  const ref = await addDoc(collection(db, 'budgets'), {
    saison, annee, nom: budgetName(saison, annee), segments: [], base: {},
    createdAt: serverTimestamp(), createdBy: author(user),
  })
  if (reprendre) {
    const prev = await findBudget(previousSeason({ saison, annee }).saison, previousSeason({ saison, annee }).annee)
    if (prev) await carryOverN1({ id: ref.id, segments: [] }, [], prev, user)
  }
  return ref.id
}

export async function deleteBudget(id) {
  const snap = await getDocs(collection(db, 'budgets', id, 'marques'))
  await runBatches(snap.docs.map(d => b => b.delete(d.ref)))
  await deleteDoc(doc(db, 'budgets', id))
}

// Base importée : remplace le budget de base, garde les segments venus du N-1 et toute la saisie
export function saveBase(budget, parsed, fileName, user) {
  return updateDoc(doc(db, 'budgets', budget.id), {
    segments: mergeSegments(budget.segments, parsed.segments),
    base: parsed.base,
    baseImport: { at: serverTimestamp(), by: author(user), fileName },
  })
}

// N-1 (lignes par marque) : met à jour les marques existantes, crée les autres et les segments manquants.
// Un acheteur n'importe que ses univers attitrés.
export async function applyN1(budget, marques, allLines, source, user) {
  const lines = editableLines(allLines, user)
  const plan = planN1Import(lines, marques, budget.segments)
  if (!lines.length) return plan
  const coll = collection(db, 'budgets', budget.id, 'marques')
  const now = serverTimestamp()
  await runBatches([
    ...plan.updates.map(u => b => b.update(doc(coll, u.id), { n1: u.n1, commentaireN1: u.commentaireN1 || '' })),
    ...plan.creates.map(l => b => b.set(doc(coll), {
      segId: l.segId, univers: l.univers, segment: l.segment, nom: l.nom,
      n1: l.n1, commentaireN1: l.commentaire || '', saisie: {}, commentaire: '',
      createdAt: now, createdBy: author(user),
    })),
  ])
  await updateDoc(doc(db, 'budgets', budget.id), {
    ...(plan.newSegments.length ? { segments: [...budget.segments, ...plan.newSegments] } : {}),
    n1Import: { at: now, by: author(user), source },
  })
  return plan
}

export async function carryOverN1(budget, marques, prev, user) {
  const snap = await getDocs(collection(db, 'budgets', prev.id, 'marques'))
  const lines = linesFromBudget(snap.docs.map(d => d.data()))
  return applyN1(budget, marques, lines, prev.nom, user)
}

// ── Marques ─────────────────────────────────────────────────────────────────────

const marqueRef = (budgetId, id) => doc(db, 'budgets', budgetId, 'marques', id)

export function addMarque(budgetId, seg, nom, user) {
  return addDoc(collection(db, 'budgets', budgetId, 'marques'), {
    segId: seg.id, univers: seg.univers, segment: seg.nom, nom: cleanMarque(nom),
    n1: {}, commentaireN1: '', saisie: {}, commentaire: '',
    createdAt: serverTimestamp(), createdBy: author(user),
  })
}

export function updateMarque(budgetId, id, data, user) {
  return updateDoc(marqueRef(budgetId, id), { ...data, updatedAt: serverTimestamp(), updatedBy: author(user) })
}

// Montant saisi pour un magasin (null : effacé)
export function setSaisie(budgetId, id, magId, value, user) {
  return updateMarque(budgetId, id, { [`saisie.${magId}`]: value == null ? deleteField() : value }, user)
}

export function deleteMarque(budgetId, id) {
  return deleteDoc(marqueRef(budgetId, id))
}
