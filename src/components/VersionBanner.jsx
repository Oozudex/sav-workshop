import { useEffect, useState } from 'react'

// Version du code chargé dans cet onglet (définie au build dans vite.config.js)
const VERSION = import.meta.env.APP_VERSION
const INTERVALLE = 5 * 60 * 1000
// Évite de vérifier deux fois de suite (focus et visibilitychange arrivent ensemble)
const ECART_MIN = 30 * 1000

async function versionEnLigne() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' })
    if (!r.ok) return null
    const { version } = await r.json()
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

// Onglet ouvert avant un déploiement : il fait tourner l'ancien code tant qu'on ne recharge pas
export default function VersionBanner() {
  const [nouvelle, setNouvelle] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !VERSION || nouvelle) return
    let annule = false
    let derniere = 0
    const verifier = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - derniere < ECART_MIN) return
      derniere = Date.now()
      const v = await versionEnLigne()
      if (!annule && v && v !== VERSION) setNouvelle(true)
    }
    const id = setInterval(verifier, INTERVALLE)
    window.addEventListener('focus', verifier)
    document.addEventListener('visibilitychange', verifier)
    return () => {
      annule = true
      clearInterval(id)
      window.removeEventListener('focus', verifier)
      document.removeEventListener('visibilitychange', verifier)
    }
  }, [nouvelle])

  if (!nouvelle) return null
  return (
    <div className="fixed top-3 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
      <div role="status" className="pointer-events-auto flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs shadow-lg
        text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950 dark:border-sky-500/30">
        <p className="leading-relaxed">Nouvelle version de l'application disponible.</p>
        <button onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg px-2.5 py-1 font-semibold bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-500 dark:text-black dark:hover:bg-sky-400">
          Recharger
        </button>
        <button onClick={() => setNouvelle(false)} aria-label="Fermer le message" className="shrink-0 opacity-60 hover:opacity-100">
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  )
}
