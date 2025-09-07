import { create } from 'zustand'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export const useAuth = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  async init() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid))
        set({ user, profile: snap.exists() ? snap.data() : null, loading: false })
      } else {
        set({ user: null, profile: null, loading: false })
      }
    })
  },
  async login(email, password) {
    await signInWithEmailAndPassword(auth, email, password)
  },
  async logout() { await signOut(auth) },
}))
