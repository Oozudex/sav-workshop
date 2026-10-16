// Taux de sortie : stockage Firestore. sorties_semaines/{2026-S42} : une semaine importée (fichier, totaux),
// commune au groupe ; ses lignes sont compressées (gzip) et découpées dans sorties_semaines/{id}/parts/{i}.
// La semaine N-1 d'un rapport est la même semaine de l'année précédente : un import de N-1 est rangé
// dans sa propre semaine, qui sert ensuite automatiquement.
import { useEffect, useState } from 'react'
import {
  Bytes, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { chunkBytes, datasetTotals, gunzipJson, gzipJson, joinBytes, semaineId, semaineNom } from './sorties'

const COLL = 'sorties_semaines'
const PART_BYTES = 900_000 // un document Firestore fait au plus 1 Mo

const author = user => ({ uid: user?.uid || null, nom: user?.displayName || '' })

export function useSemaines() {
  const [state, setState] = useState({ list: [], loading: true })
  useEffect(() => onSnapshot(query(collection(db, COLL)),
    snap => setState({
      list: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.annee - a.annee || b.semaine - a.semaine),
      loading: false,
    }),
    () => setState({ list: [], loading: false })), [])
  return state
}

export function useSemaine(id) {
  const [state, setState] = useState({ semaine: null, loading: true })
  useEffect(() => {
    if (!id) { setState({ semaine: null, loading: false }); return }
    return onSnapshot(doc(db, COLL, id),
      snap => setState({ semaine: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false }),
      () => setState({ semaine: null, loading: false }))
  }, [id])
  return state
}

// Crée la semaine si elle n'existe pas encore
export async function ensureSemaine({ annee, semaine }, user) {
  const ref = doc(db, COLL, semaineId(annee, semaine))
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, { annee, semaine, nom: semaineNom(annee, semaine), createdAt: serverTimestamp(), createdBy: author(user) })
  }
  return ref.id
}

// Enregistre les lignes d'une semaine (remplace l'import précédent)
export async function saveSemaineData({ annee, semaine }, ds, fileName, user) {
  const id = await ensureSemaine({ annee, semaine }, user)
  const parts = chunkBytes(await gzipJson(ds), PART_BYTES)
  const old = await getDocs(collection(db, COLL, id, 'parts'))
  for (let i = 0; i < parts.length; i++) {
    await setDoc(doc(db, COLL, id, 'parts', String(i)), { i, b: Bytes.fromUint8Array(parts[i]) })
  }
  await Promise.all(old.docs.filter(d => Number(d.id) >= parts.length).map(d => deleteDoc(d.ref)))
  await setDoc(doc(db, COLL, id), {
    fichier: {
      at: serverTimestamp(), by: author(user), fileName, lignes: ds.n, parts: parts.length,
      version: Date.now(), totals: datasetTotals(ds),
    },
  }, { merge: true })
  return id
}

export async function deleteSemaine(id) {
  const parts = await getDocs(collection(db, COLL, id, 'parts'))
  await Promise.all(parts.docs.map(d => deleteDoc(d.ref)))
  await deleteDoc(doc(db, COLL, id))
}

// Range une semaine importée dans une autre semaine (mauvaise semaine choisie) : copie le fichier et ses
// lignes vers la nouvelle semaine, puis supprime l'ancienne (rien n'est perdu si la copie échoue).
// Refusé si la semaine visée a déjà un fichier importé.
export async function moveSemaine(from, { annee, semaine }, user) {
  const id = semaineId(annee, semaine)
  if (id === from.id) return id
  const ref = doc(db, COLL, id)
  const target = await getDoc(ref)
  if (target.data()?.fichier) throw new Error(`${semaineNom(annee, semaine)} a déjà un fichier importé : supprime-la d’abord.`)
  const parts = await getDocs(collection(db, COLL, from.id, 'parts'))
  for (const p of parts.docs) await setDoc(doc(db, COLL, id, 'parts', p.id), p.data())
  await setDoc(ref, {
    annee, semaine, nom: semaineNom(annee, semaine),
    createdAt: from.createdAt || serverTimestamp(), createdBy: from.createdBy || author(user),
    ...(from.fichier && { fichier: from.fichier }),
    deplacee: { at: serverTimestamp(), by: author(user), de: from.nom },
  })
  await deleteSemaine(from.id)
  return id
}

// Lignes d'une semaine (gardées en mémoire tant que l'import ne change pas)
const cache = new Map()
async function loadSemaineData(id, fichier) {
  const key = `${id}:${fichier.version}`
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const snap = await getDocs(collection(db, COLL, id, 'parts'))
      const parts = snap.docs.map(d => d.data()).filter(p => p.i < fichier.parts).sort((a, b) => a.i - b.i)
      if (parts.length !== fichier.parts) throw new Error('Import incomplet : réimporte le fichier.')
      return gunzipJson(joinBytes(parts.map(p => p.b.toUint8Array())))
    })().catch(err => { cache.delete(key); throw err }))
  }
  return cache.get(key)
}

// { ds, loading, error } pour une semaine (null si pas importée)
export function useSemaineData(semaine) {
  const id = semaine?.id
  const version = semaine?.fichier?.version
  const [state, setState] = useState({ ds: null, loading: false, error: '' })
  useEffect(() => {
    if (!id || !version) { setState({ ds: null, loading: false, error: '' }); return }
    let alive = true
    setState(s => ({ ...s, loading: true, error: '' }))
    loadSemaineData(id, semaine.fichier)
      .then(ds => alive && setState({ ds, loading: false, error: '' }))
      .catch(err => alive && setState({ ds: null, loading: false, error: err.message }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version])
  return state
}
