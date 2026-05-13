import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuth, sendPasswordResetEmail } from 'firebase/auth'
import { useAuth } from '../store/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const { user, login } = useAuth(s => ({ user: s.user, login: s.login }))

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await login(email.trim(), pwd)
    } catch {
      setErr("Email ou mot de passe invalide.")
    } finally {
      setLoading(false)
    }
  }

  async function onReset() {
    if (!email.trim()) return setErr("Renseigne ton email pour recevoir le lien.")
    setErr('')
    try {
      await sendPasswordResetEmail(getAuth(), email.trim())
      setErr("✉️ Lien de réinitialisation envoyé (si l'email existe).")
    } catch {
      setErr("Impossible d'envoyer le lien. Vérifie l'email.")
    }
  }

  useEffect(() => {
    if (!user) return
    const to = loc.state?.from?.pathname || '/'
    nav(to, { replace: true })
  }, [user, nav, loc.state])

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-neutral-900 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Carte */}
        <div className="rounded-3xl border border-white/10 bg-neutral-900/80 backdrop-blur shadow-2xl p-6">
          {/* En-tête */}
          <div className="mb-5">
            <div className="text-2xl font-semibold tracking-tight">Groupe Nivault</div>
            <div className="text-sm text-neutral-400 mt-1">Connexion</div>
          </div>

          {/* Erreur / info */}
          {err && (
            <div className="mb-3 text-sm rounded-xl border px-3 py-2
                            border-red-500/30 bg-red-500/10 text-red-300">
              {err}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="text-sm text-neutral-300">Email</span>
              <input
                type="email"
                className="mt-1 Input bg-neutral-950/60 border-white/10 text-neutral-100 placeholder-neutral-500"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </label>

            <label className="block">
              <span className="text-sm text-neutral-300">Mot de passe</span>
              <div className="mt-1 relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="Input pr-24 bg-neutral-950/60 border-white/10 text-neutral-100 placeholder-neutral-500"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-1 top-1 h-9 px-3 text-sm rounded-xl border border-white/10 hover:bg-white/5"
                >
                  {showPwd ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 px-4 py-2.5 rounded-xl bg-white text-black font-medium
                         hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
            <span>Besoin d'aide ?</span>
            <button onClick={onReset} className="underline hover:text-neutral-200">
              Mot de passe oublié
            </button>
          </div>
        </div>

        {/* Footer mini */}
        <div className="text-center text-[11px] text-neutral-500 mt-4">
          © {new Date().getFullYear()} Atelier SAV
        </div>
      </div>
    </div>
  )
}
