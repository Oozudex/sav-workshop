import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Store du magasin actif.
 * - Pour vendeur / directeurmag : magasinId vient du profil (pas de ce store).
 * - Pour acheteur / directeurgen : ils choisissent via le dropdown navbar.
 *   null = "tous les magasins"
 */
export const useMagasin = create(
  persist(
    (set) => ({
      selectedId: null,
      setSelectedId: (id) => set({ selectedId: id }),
    }),
    { name: 'sav-magasin-selected' }
  )
)
