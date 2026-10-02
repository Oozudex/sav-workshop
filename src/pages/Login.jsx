import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuth, sendPasswordResetEmail } from 'firebase/auth'
import { useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'

// Couleurs Intersport
const BLEU = '#164194'
const ROUGE = '#E30613'

// Champs toujours clairs (la carte reste blanche même si le thème sombre est activé)
const FIELD = 'Input !bg-white !text-gray-900 !border-gray-300 placeholder:text-gray-400 focus:!ring-[#164194]/60 focus:!border-[#164194]'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const { user, login } = useAuth(useShallow(s => ({ user: s.user, login: s.login })))

  async function onSubmit(e) {
    e.preventDefault()
    setErr(''); setInfo('')
    setLoading(true)
    try {
      await login(email.trim(), pwd)
    } catch {
      setErr('Email ou mot de passe invalide.')
    } finally {
      setLoading(false)
    }
  }

  async function onReset() {
    setErr(''); setInfo('')
    if (!email.trim()) return setErr('Renseigne ton email pour recevoir le lien.')
    try {
      await sendPasswordResetEmail(getAuth(), email.trim())
      setInfo('Lien de réinitialisation envoyé (si l’email existe).')
    } catch {
      setErr('Impossible d’envoyer le lien. Vérifie l’email.')
    }
  }

  useEffect(() => {
    if (!user) return
    const to = loc.state?.from?.pathname || '/'
    nav(to, { replace: true })
  }, [user, nav, loc.state])

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
            <h1 className="text-xl font-bold tracking-tight">Connexion</h1>
            <p className="text-sm text-gray-500 mt-0.5">Connecte-toi avec ton email professionnel.</p>
          </div>

          {(err || info) && (
            <div role="status" className={`mb-4 text-sm rounded-xl border px-3 py-2 ${err
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {err || info}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3.5">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input type="email" autoComplete="username" className={`mt-1 ${FIELD}`} placeholder="nom@exemple.com"
                value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Mot de passe</span>
              <div className="mt-1 relative">
                <input type={showPwd ? 'text' : 'password'} autoComplete="current-password" className={`${FIELD} pr-24`}
                  value={pwd} onChange={e => setPwd(e.target.value)} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-3 text-xs font-semibold rounded-lg text-gray-600 hover:bg-gray-100">
                  {showPwd ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading}
              className="w-full mt-1 h-11 rounded-xl text-white font-semibold shadow-lg shadow-red-600/25 transition
                         hover:brightness-110 active:scale-[.99] disabled:opacity-60"
              style={{ background: ROUGE }}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>Besoin d’aide ?</span>
            <button onClick={onReset} className="font-semibold hover:underline" style={{ color: BLEU }}>
              Mot de passe oublié
            </button>
          </div>
        </div>

        <p className="login-rise text-center text-[11px] text-white/50 mt-6" style={{ animationDelay: '.3s' }}>
          © {new Date().getFullYear()} Groupe Nivault
        </p>
      </div>
    </div>
  )
}
