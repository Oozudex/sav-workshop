import { useEffect, useMemo, useState } from 'react'
import { db } from './firebase'
import { collection, collectionGroup, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { membreUnique } from './equipe'

/**
 * Retourne les membres actifs des rayons d'un magasin.
 * Utilisé pour les dropdowns "Assigné à" / "Créé par" / auteur de commentaire.
 * Chaque doc staff doit avoir un champ `magasinId`.
 *
 * @param {string} magasinId
 * @param {string} [rayonType] limite aux rayons de ce type (ex. 'velo')
 */
export function useStaff(magasinId, rayonType) {
  const [staff, setStaff] = useState([])
  const [rayonIds, setRayonIds] = useState(null)

  useEffect(() => {
    if (!magasinId) { setStaff([]); return }
    const q = query(
      collectionGroup(db, 'staff'),
      where('magasinId', '==', magasinId),
      orderBy('nom', 'asc'),
    )
    return onSnapshot(q, snap =>
      setStaff(snap.docs.map(d => ({ id: d.id, rayonId: d.ref.parent.parent.id, ...d.data() })))
    )
  }, [magasinId])

  // Rayons du type demandé : le type est porté par le rayon parent, pas par le membre
  useEffect(() => {
    if (!magasinId || !rayonType) { setRayonIds(null); return }
    const q = query(collection(db, 'magasins', magasinId, 'rayons'), where('type', '==', rayonType))
    return onSnapshot(q, snap => setRayonIds(new Set(snap.docs.map(d => d.id))))
  }, [magasinId, rayonType])

  return useMemo(() => staff.filter(s =>
    s.actif !== false && (!rayonType || rayonIds?.has(s.rayonId))
  ), [staff, rayonType, rayonIds])
}

/**
 * Nouvelle saisie (« Créé par », auteur d'un commentaire, vendeur…) : s'il n'y a qu'un membre dans
 * l'équipe, il est choisi d'office ; à partir de deux membres, rien ne change (choix dans la liste).
 * À n'utiliser que pour les nouvelles saisies, pas pour modifier une fiche existante.
 */
export function usePreselectionMembre(membres, valeur, choisir) {
  const nom = membreUnique(membres)
  useEffect(() => {
    if (nom && valeur !== nom) choisir(nom)
  }, [nom, valeur, choisir])
}
