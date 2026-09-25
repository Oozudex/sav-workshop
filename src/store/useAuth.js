import { create } from 'zustand'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

// Un administrateur voit et fait tout ce que fait le directeur général : l'app le traite comme
// « directeurgen », avec isAdmin en plus pour la gestion des comptes de direction.
function withAccountRole(data) {
  return data?.role === 'admin' ? { ...data, role: 'directeurgen', isAdmin: true } : data
}

export const useAuth = create((set) => ({
  user: null,
  profile: null,
  loading: true,
  init() {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid))
        set({ user, profile: snap.exists() ? withAccountRole(snap.data()) : null, loading: false })
      } else {
        set({ user: null, profile: null, loading: false })
      }
    })
  },
  async refreshProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) set({ profile: withAccountRole(snap.data()) })
  },
  async login(email, password) {
    await signInWithEmailAndPassword(auth, email, password)
  },
  async logout() { await signOut(auth) },
}))
