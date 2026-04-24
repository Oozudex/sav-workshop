import { useEffect, useState } from 'react'
import { db } from './firebase'
import { collectionGroup, onSnapshot, orderBy, query, where } from 'firebase/firestore'

/**
 * Retourne tous les membres de tous les rayons d'un magasin.
 * Utilisé pour les dropdowns "Assigné à" / "Créé par".
 * Chaque doc staff doit avoir un champ `magasinId`.
 */
export function useStaff(magasinId) {
  const [staff, setStaff] = useState([])

  useEffect(() => {
    if (!magasinId) return
    const q = query(
      collectionGroup(db, 'staff'),
      where('magasinId', '==', magasinId),
      orderBy('nom', 'asc'),
    )
    return onSnapshot(q, snap =>
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [magasinId])

  return staff
}
