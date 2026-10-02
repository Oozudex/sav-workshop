import { useState } from 'react'
// Écran aux couleurs Intersport (connexion, choix du mot de passe) : fond bleu, logo blanc,
// balle rouge qui rebondit et symbole en filigrane, puis une carte blanche pour le formulaire.

// Couleurs Intersport
export const BLEU = '#164194'
export const ROUGE = '#E30613'

// Champs toujours clairs (la carte reste blanche même si le thème sombre est activé)
export const BRAND_FIELD = 'Input !bg-white !text-gray-900 !border-gray-300 placeholder:text-gray-400 focus:!ring-[#164194]/60 focus:!border-[#164194]'

export const BRAND_BUTTON = 'w-full mt-1 h-11 rounded-xl text-white font-semibold shadow-lg shadow-red-600/25 transition hover:brightness-110 active:scale-[.99] disabled:opacity-60'

// Message d'erreur (rouge) ou d'information (bleu) en haut de la carte
export function BrandMessage({ error, info }) {
  if (!error && !info) return null
  return (
    <div role="status" className={`mb-4 text-sm rounded-xl border px-3 py-2 ${error
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
      {error || info}
    </div>
  )
}

// Champ mot de passe avec bouton Afficher / Masquer
export function PasswordInput({ value, onChange, autoComplete, autoFocus = false }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="mt-1 relative">
      <input type={visible ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
        className={`${BRAND_FIELD} pr-24`} value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setVisible(v => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-3 text-xs font-semibold rounded-lg text-gray-600 hover:bg-gray-100">
        {visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  )
}

export default function BrandScreen({ title, subtitle, children }) {
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-10 text-white"
      style={{ background: `radial-gradient(120% 90% at 20% 0%, #2353b3 0%, ${BLEU} 45%, #0c2766 100%)` }}>

      {/* Décor : symbole Intersport en filigrane et balle rouge qui tombe puis rebondit */}
      <img src="/brand/intersport-symbole.webp" alt="" aria-hidden
        className="login-float pointer-events-none select-none absolute -left-24 -bottom-28 w-[34rem] max-w-none opacity-[.07]"
        style={{ filter: 'brightness(0) invert(1)' }} />
      <div aria-hidden className="login-drop pointer-events-none absolute -right-6 -top-6 h-24 w-24 sm:right-[8%] sm:top-[10%] sm:h-40 sm:w-40 rounded-full origin-bottom"
        style={{ background: `radial-gradient(circle at 35% 30%, #ff4d57, ${ROUGE} 60%, #b8000c)`, boxShadow: '0 30px 60px -20px rgba(0,0,0,.45)' }} />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="login-rise flex flex-col items-center text-center mb-7">
          <img src="/brand/intersport-engages-blanc.webp" alt="Intersport — Engagés sport"
            className="w-64 sm:w-80 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,.25)]" />
          <p className="mt-4 text-sm font-medium text-white/75">Groupe Nivault · Outils des magasins</p>
        </div>

        {/* Carte */}
        <div className="login-rise rounded-3xl bg-white text-gray-900 shadow-2xl shadow-black/30 p-6 sm:p-7" style={{ animationDelay: '.15s' }}>
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {children}
        </div>

        <p className="login-rise text-center text-[11px] text-white/50 mt-6" style={{ animationDelay: '.3s' }}>
          © {new Date().getFullYear()} Groupe Nivault
        </p>
      </div>
    </div>
  )
}
