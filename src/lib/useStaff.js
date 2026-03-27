import { useEffect, useState } from 'react'
import { db } from './firebase'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'

/**
 * Retourne la liste du personnel d'un magasin (sans compte Auth).
 * Utilisé pour les dropdowns "Assigné à" / "Créé par".
 */
export function useStaff(magasinId) {
  const [staff, setStaff] = useState([])

  useEffect(() => {
    if (!magasinId) return
    const q = query(
      collection(db, 'magasins', magasinId, 'staff'),
      orderBy('nom', 'asc'),
    )
    return onSnapshot(q, snap =>
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [magasinId])

  return staff
}
