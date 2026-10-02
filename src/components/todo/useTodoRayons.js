// Rayons dont on affiche la todo list : celui du compte rayon, ou au choix pour le directeur,
// l'acheteur (ses rayons) et la direction (rayons du magasin choisi). Choix gardé sur l'appareil.
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { RAYON_TYPES } from '../../lib/constants'

const KEY = 'todoRayon'

export function useTodoRayons(profile, magasinId) {
  const fixed = RAYON_TYPES.includes(profile?.role) ? profile.role : null
  const [types, setTypes] = useState([])
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem(KEY) } catch { return null } })

  useEffect(() => {
    if (fixed || !magasinId) { setTypes([]); return }
    return onSnapshot(collection(db, 'magasins', magasinId, 'rayons'),
      s => setTypes(RAYON_TYPES.filter(t => s.docs.some(d => d.get('type') === t))), () => setTypes([]))
  }, [fixed, magasinId])

  let rayons = fixed ? [fixed] : types
  if (profile?.role === 'acheteur' && profile.rayons?.length) rayons = rayons.filter(r => profile.rayons.includes(r))
  const rayon = rayons.includes(selected) ? selected : rayons[0] || null

  function choose(r) {
    setSelected(r)
    try { localStorage.setItem(KEY, r) } catch { /* stockage indisponible */ }
  }
  return { rayons, rayon, choose }
}
