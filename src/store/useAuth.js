import { create } from 'zustand'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { nextParisMidnight, sessionExpired } from '../lib/session'

// Un administrateur voit et fait tout ce que fait le directeur général : l'app le traite comme
// « directeurgen », avec isAdmin en plus pour la gestion des comptes de direction.
function withAccountRole(data) {
  return data?.role === 'admin' ? { ...data, role: 'directeurgen', isAdmin: true } : data
}

// Raison de la déconnexion, affichée sur la page de connexion
export const LOGOUT_REASON_KEY = 'logoutReason'
async function forceLogout(reason) {
  try { sessionStorage.setItem(LOGOUT_REASON_KEY, reason) } catch { /* stockage indisponible */ }
  await signOut(auth)
}

export const useAuth = create((set) => ({
  user: null,
  profile: null,
  loading: true,
  // Sessions : déconnexion chaque nuit à 0 h (heure de Paris) et dès que la session est coupée
  // côté serveur (users/{uid}.sessionsRevokedAt : minuit, mot de passe du rayon changé)
  init() {
    let stopProfile = null, timer = null, onVisible = null
    const stop = () => {
      stopProfile?.(); stopProfile = null
      clearTimeout(timer)
      if (onVisible) document.removeEventListener('visibilitychange', onVisible)
      onVisible = null
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      stop()
      if (!user) { set({ user: null, profile: null, loading: false }); return }

      const authTime = new Date((await user.getIdTokenResult()).authTime)
      if (sessionExpired(authTime)) { await forceLogout('minuit'); return }

      // Onglet resté ouvert : déconnexion à minuit, ou au retour sur l'onglet si l'ordinateur était en veille
      timer = setTimeout(() => forceLogout('minuit'), Math.max(1000, nextParisMidnight().getTime() - Date.now()))
      onVisible = () => { if (document.visibilityState === 'visible' && sessionExpired(authTime)) forceLogout('minuit') }
      document.addEventListener('visibilitychange', onVisible)

      stopProfile = onSnapshot(doc(db, 'users', user.uid), snap => {
        const data = snap.exists() ? snap.data() : null
        if (sessionExpired(authTime, { revokedAt: data?.sessionsRevokedAt?.toDate?.() })) { forceLogout('coupee'); return }
        set({ user, profile: data ? withAccountRole(data) : null, loading: false })
      }, err => {
        // Session refusée par les règles (plus de 24 h ou coupée) : retour à la connexion
        if (err?.code === 'permission-denied') forceLogout('coupee')
        else set({ user, profile: null, loading: false })
      })
    })
    return () => { stop(); unsub() }
  },
  async refreshProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) set({ profile: withAccountRole(snap.data()) })
  },
  async login(email, password) {
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY) } catch { /* stockage indisponible */ }
    await signInWithEmailAndPassword(auth, email, password)
  },
  async logout() {
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY) } catch { /* stockage indisponible */ }
    await signOut(auth)
  },
}))
