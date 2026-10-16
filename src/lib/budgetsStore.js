// Budgets acheteurs : lecture en temps réel et écritures Firestore.
// budget_univers / budget_magasins / budget_marques : listes communes ; budgets/{id} : segments et
// budget de base ; budgets/{id}/marques/{idMarque} : ligne d'une marque (N-1, saisie par magasin,
// commentaire), avec le même id que la marque de la liste.
import { useEffect, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { useShallow } from 'zustand/react/shallow'
import { db } from './firebase'
import { useAuth } from '../store/useAuth'
import {
  DEFAULT_MAGASINS, DEFAULT_UNIVERS, budgetName, cleanMarque, linesFromBudget, mergeSegments,
  planN1Import, previousSeason, saisieFromNextN1,
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
export const useBudgetLines = id => useCollection(['budgets', id || '_', 'marques'], [], !!id)
export const useBrands = () => useCollection(['budget_marques'], [])

// Acheteurs actifs (filtre « par acheteur » des budgets et des marques)
export function useAcheteurs() {
  const [list, setList] = useState([])
  useEffect(() => onSnapshot(query(collection(db, 'users'), where('role', '==', 'acheteur')),
    snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.isActive !== false)
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'fr'))),
    () => setList([])), [])
  return list
}

// Fiches des marques d'un budget (notes, budget demandé) : budgets/{id}/fournisseurs/{clé de la marque}
export const useFiches = id => useCollection(['budgets', id || '_', 'fournisseurs'], [], !!id)

// Réglage commun budget_reglages/{id} (null tant qu'il n'existe pas)
function useReglage(id) {
  const [state, setState] = useState(null)
  useEffect(() => onSnapshot(doc(db, 'budget_reglages', id),
    snap => setState(snap.exists() ? snap.data() : null), () => setState(null)), [id])
  return state
}

// Pondérations des critères et amplitude du coefficient (budget_reglages/notation)
export const useNotationReglages = () => ({ reglages: useReglage('notation') })

// Liens marque → fournisseur choisis par les acheteurs (budget_reglages/fournisseurs : { liens })
export const useFournisseurLiens = () => useReglage('fournisseurs')?.liens || EMPTY

const EMPTY = {}

// Fiches des budgets précédents, du plus récent au plus ancien : [{ budget, list }]
export function useFichesHistory(budgetsAvant) {
  const ids = budgetsAvant.map(b => b.id).join(',')
  const [byId, setById] = useState({})
  useEffect(() => {
    if (!ids) return
    const unsubs = ids.split(',').map(id => onSnapshot(collection(db, 'budgets', id, 'fournisseurs'),
      snap => setById(s => ({ ...s, [id]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })), () => {}))
    return () => unsubs.forEach(u => u())
  }, [ids])
  return useMemo(() => budgetsAvant.map(b => ({ budget: b, list: byId[b.id] || [] })), [budgetsAvant, byId])
}

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
    role: profile?.role || null, univers: profile?.univers || [], universSegments: profile?.universSegments || {},
    isAdmin: profile?.isAdmin === true,
  }), [user?.uid, user?.email, profile?.displayName, profile?.role, profile?.univers, profile?.universSegments, profile?.isAdmin])
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

// Crée « BUDGET AH27 » ; reprend si demandé la saisie du budget N-1 comme N-1. depuisSuivant : budget de
// la saison suivante (déjà créé) dont le N-1 importé devient la saisie de celui-ci (historique, direction)
export async function createBudget({ saison, annee, reprendre, depuisSuivant = null }, user) {
  if (await findBudget(saison, annee)) throw new Error(`${budgetName(saison, annee)} existe déjà.`)
  const ref = await addDoc(collection(db, 'budgets'), {
    saison, annee, nom: budgetName(saison, annee), segments: [], base: {},
    createdAt: serverTimestamp(), createdBy: author(user),
  })
  if (reprendre) {
    const p = previousSeason({ saison, annee })
    const prev = await findBudget(p.saison, p.annee)
    if (prev) await carryOverN1({ id: ref.id, segments: [] }, prev, user)
  }
  if (depuisSuivant) await fillFromNextN1({ id: ref.id }, depuisSuivant, user)
  return ref.id
}

// Saisie d'un budget remplie avec le N-1 importé dans le budget suivant (même id de marque). Toute la
// saisie de tous les univers : réservé à la direction (les règles limitent un acheteur à ses univers).
export async function fillFromNextN1(budget, next, user) {
  const snap = await getDocs(collection(db, 'budgets', next.id, 'marques'))
  const { lines, segments } = saisieFromNextN1(snap.docs.map(d => ({ id: d.id, ...d.data() })), next.segments || [])
  const now = serverTimestamp()
  await runBatches(lines.map(l => b => b.set(lineRef(budget.id, l.id), {
    ...lineIdentity(l), saisie: l.saisie, quantite: l.quantite, commentaire: l.commentaire, updatedAt: now, updatedBy: author(user),
  }, { merge: true })))
  // Garde les segments déjà présents (N-1 repris du budget précédent)
  const current = (await getDoc(doc(db, 'budgets', budget.id))).data()?.segments || []
  const known = new Set(current.map(sg => sg.id))
  await updateDoc(doc(db, 'budgets', budget.id), {
    segments: [...current, ...segments.filter(sg => !known.has(sg.id))], saisieReprise: { at: now, by: author(user), source: next.nom, marques: lines.length },
  })
  return { count: lines.length }
}

// suppression : le N-1 du budget suivant, recopié de celui-ci (Cloud Function majN1Suivant), n'est pas vidé
export async function deleteBudget(id) {
  await updateDoc(doc(db, 'budgets', id), { suppression: true })
  const snap = await getDocs(collection(db, 'budgets', id, 'marques'))
  await runBatches(snap.docs.map(d => b => b.delete(d.ref)))
  await deleteDoc(doc(db, 'budgets', id))
}

// Budget groupe fixé par la direction : { mode: 'montant', montant } ou { mode: 'pct', pct } ; null l'efface
export function setGroupe(budgetId, groupe, user) {
  return updateDoc(doc(db, 'budgets', budgetId), {
    groupe: groupe ? { ...groupe, at: serverTimestamp(), by: author(user) } : deleteField(),
  })
}

// Export Excel fait : date gardée sur le budget (le rappel « Exporter » de fin de conservation disparaît)
export function markExport(budgetId, user) {
  return updateDoc(doc(db, 'budgets', budgetId), { export: { at: serverTimestamp(), by: author(user) } })
}

// Base importée : remplace le budget de base, garde les segments venus du N-1 et toute la saisie
export function saveBase(budget, parsed, fileName, user) {
  return updateDoc(doc(db, 'budgets', budget.id), {
    segments: mergeSegments(budget.segments, parsed.segments),
    base: parsed.base,
    baseImport: { at: serverTimestamp(), by: author(user), fileName },
  })
}

const lineRef = (budgetId, id) => doc(db, 'budgets', budgetId, 'marques', id)
const lineIdentity = x => ({ univers: x.univers, segId: x.segId, segment: x.segment || '', nom: x.nom })
const N1_FIELDS = ['univers', 'segId', 'segment', 'nom', 'n1', 'commentaireN1']
// Reprise du budget précédent : les quantités saisies deviennent aussi le N-1
const CARRY_FIELDS = [...N1_FIELDS, 'quantiteN1']

// N-1 par marque (fichier Excel) : rattache chaque ligne à la marque de la liste (ajoutée si absente),
// remplace son N-1 sans toucher à la saisie, ajoute les segments manquants. Tout le fichier, quel que soit
// l'acheteur qui importe (les règles lui permettent d'écrire le N-1 des autres univers, pas leur saisie).
export async function applyN1(budget, brands, lines, source, user) {
  const plan = planN1Import(lines, brands, budget.segments)
  if (!lines.length) return plan
  const now = serverTimestamp()
  const brandsColl = collection(db, 'budget_marques')
  const writeLine = (id, l) => b => b.set(lineRef(budget.id, id),
    { ...lineIdentity(l), n1: l.n1, commentaireN1: l.commentaire || '' }, { mergeFields: N1_FIELDS })
  const ops = plan.matched.map(m => writeLine(m.id, m.line))
  for (const l of plan.missing) {
    const ref = doc(brandsColl)
    ops.push(b => b.set(ref, { ...lineIdentity(l), createdAt: now, createdBy: author(user) }))
    ops.push(writeLine(ref.id, l))
  }
  await runBatches(ops)
  await updateDoc(doc(db, 'budgets', budget.id), {
    ...(plan.newSegments.length ? { segments: [...budget.segments, ...plan.newSegments] } : {}),
    n1Import: { at: now, by: author(user), source },
  })
  return plan
}

// N-1 repris du budget précédent : sa saisie et ses quantités deviennent le N-1, marque par marque (même id)
export async function carryOverN1(budget, prev, user) {
  const snap = await getDocs(collection(db, 'budgets', prev.id, 'marques'))
  const lines = linesFromBudget(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  if (!lines.length) return { count: 0 }
  const known = new Set(budget.segments.map(s => s.id))
  const newSegments = []
  for (const l of lines) {
    if (known.has(l.segId)) continue
    known.add(l.segId)
    newSegments.push({ id: l.segId, univers: l.univers, nom: l.segment })
  }
  await runBatches(lines.map(l => b => b.set(lineRef(budget.id, l.id),
    { ...lineIdentity(l), n1: l.n1, quantiteN1: l.quantiteN1, commentaireN1: l.commentaire }, { mergeFields: CARRY_FIELDS })))
  await updateDoc(doc(db, 'budgets', budget.id), {
    ...(newSegments.length ? { segments: [...budget.segments, ...newSegments] } : {}),
    n1Import: { at: serverTimestamp(), by: author(user), source: prev.nom },
  })
  return { count: lines.length }
}

// Commande fournisseur importée (plan de planCommande) : saisie et quantités par magasin des marques,
// ajoutées à la liste des marques au besoin. L'état engagé / prévisionnel de la marque n'est pas touché.
export async function applyCommande(budget, plan, user) {
  const now = serverTimestamp()
  const brandsColl = collection(db, 'budget_marques')
  const values = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v == null ? deleteField() : v]))
  const ops = []
  for (const it of plan.items) {
    let id = it.id
    if (!id) {
      const ref = doc(brandsColl)
      id = ref.id
      ops.push(b => b.set(ref, { ...it.identity, createdAt: now, createdBy: author(user) }))
    }
    ops.push(b => b.set(lineRef(budget.id, id), {
      ...it.identity, saisie: values(it.saisie), quantite: values(it.quantite), updatedAt: now, updatedBy: author(user),
    }, { merge: true }))
  }
  if (plan.newSegments.length) await updateDoc(doc(db, 'budgets', budget.id), { segments: [...budget.segments, ...plan.newSegments] })
  await runBatches(ops)
}

// ── Liste des marques ───────────────────────────────────────────────────────────

export function addBrand(seg, nom, user) {
  return addDoc(collection(db, 'budget_marques'), {
    univers: seg.univers, segId: seg.id, segment: seg.nom || '', nom: cleanMarque(nom).toUpperCase(),
    createdAt: serverTimestamp(), createdBy: author(user),
  })
}

export function renameBrand(id, nom, user) {
  return updateDoc(doc(db, 'budget_marques', id), {
    nom: cleanMarque(nom).toUpperCase(), updatedAt: serverTimestamp(), updatedBy: author(user),
  })
}

// Les montants déjà saisis dans les budgets restent (marque affichée « retirée de la liste »)
export function deleteBrand(id) {
  return deleteDoc(doc(db, 'budget_marques', id))
}

// ── Saisie dans un budget ───────────────────────────────────────────────────────

// Montant d'une marque pour un magasin (null : effacé) ; crée la ligne du budget au besoin
export function setSaisie(budgetId, brand, magId, value, user) {
  return setDoc(lineRef(budgetId, brand.id), {
    ...lineIdentity(brand), saisie: { [magId]: value == null ? deleteField() : value },
    updatedAt: serverTimestamp(), updatedBy: author(user),
  }, { merge: true })
}

// Quantité d'une marque pour un magasin (null : effacée)
export function setQuantite(budgetId, brand, magId, value, user) {
  return setDoc(lineRef(budgetId, brand.id), {
    ...lineIdentity(brand), quantite: { [magId]: value == null ? deleteField() : value },
    updatedAt: serverTimestamp(), updatedBy: author(user),
  }, { merge: true })
}

// Marque engagée (commande passée chez le fournisseur, pour tous les magasins) ou prévisionnelle
export function setEngage(budgetId, brand, engage, user) {
  return setDoc(lineRef(budgetId, brand.id), {
    ...lineIdentity(brand), engage: !!engage,
    updatedAt: serverTimestamp(), updatedBy: author(user),
  }, { merge: true })
}

export function setCommentaire(budgetId, brand, commentaire, user) {
  return setDoc(lineRef(budgetId, brand.id), {
    ...lineIdentity(brand), commentaire, updatedAt: serverTimestamp(), updatedBy: author(user),
  }, { merge: true })
}

// Ligne d'une marque retirée de la liste (et ses montants)
export function deleteLine(budgetId, id) {
  return deleteDoc(lineRef(budgetId, id))
}

// ── Notation des marques ────────────────────────────────────────────────────────

export function saveNotationReglages(data, user) {
  return setDoc(doc(db, 'budget_reglages', 'notation'), { ...data, updatedAt: serverTimestamp(), updatedBy: author(user) }, { merge: true })
}

// Fiche d'une marque dans un budget. univers : univers où la marque est présente (droits des acheteurs).
// changes : { notes: { critere: n | null } } et/ou { demande: n | null }
export function saveFiche(budgetId, key, { nom, univers }, changes, user) {
  const data = { nom, univers, updatedAt: serverTimestamp(), updatedBy: author(user) }
  // Un objet vide écraserait les notes existantes (merge) : seulement les notes modifiées
  if (changes.notes && Object.keys(changes.notes).length) data.notes = Object.fromEntries(Object.entries(changes.notes).map(([k, v]) => [k, v == null ? deleteField() : v]))
  if ('demande' in changes) data.demande = changes.demande == null ? deleteField() : changes.demande
  return setDoc(doc(db, 'budgets', budgetId, 'fournisseurs', key), data, { merge: true })
}

// Lien d'une marque vers son fournisseur : nom du fournisseur, '' (marque seule) ou null (automatique)
export function saveLien(marqueKey, fournisseur, user) {
  return setDoc(doc(db, 'budget_reglages', 'fournisseurs'), {
    liens: { [marqueKey]: fournisseur == null ? deleteField() : fournisseur },
    updatedAt: serverTimestamp(), updatedBy: author(user),
  }, { merge: true })
}
