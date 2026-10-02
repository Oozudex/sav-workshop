import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuth, sendPasswordResetEmail } from 'firebase/auth'
import { LOGOUT_REASON_KEY, useAuth } from '../store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import BrandScreen, { BLEU, BRAND_BUTTON, BRAND_FIELD, BrandMessage, PasswordInput, ROUGE } from '../components/BrandScreen'

// Pourquoi la session a été fermée (déconnexion automatique)
const LOGOUT_MESSAGES = {
  minuit: 'Pour la sécurité, les sessions se ferment chaque nuit à minuit. Reconnecte-toi.',
  coupee: 'Ta session a été fermée : le mot de passe du rayon a peut-être changé. Demande-le à ton directeur.',
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  // Message affiché une seule fois : la raison est effacée une fois la page affichée
  const [info, setInfo] = useState(() => {
    try { return LOGOUT_MESSAGES[sessionStorage.getItem(LOGOUT_REASON_KEY)] || '' } catch { return '' }
  })
  useEffect(() => {
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY) } catch { /* stockage indisponible */ }
  }, [])
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
    <BrandScreen title="Connexion" subtitle="Connecte-toi avec ton email professionnel.">
      <BrandMessage error={err} info={info} />

      <form onSubmit={onSubmit} className="space-y-3.5">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input type="email" autoComplete="username" className={`mt-1 ${BRAND_FIELD}`} placeholder="nom@exemple.com"
            value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Mot de passe</span>
          <PasswordInput value={pwd} onChange={setPwd} autoComplete="current-password" />
        </label>

        <button type="submit" disabled={loading} className={BRAND_BUTTON} style={{ background: ROUGE }}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>Besoin d’aide ?</span>
        <button onClick={onReset} className="font-semibold hover:underline" style={{ color: BLEU }}>
          Mot de passe oublié
        </button>
      </div>
    </BrandScreen>
  )
}
