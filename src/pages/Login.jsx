import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuth, getMultiFactorResolver, sendPasswordResetEmail, TotpMultiFactorGenerator } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { NOM_APPLI_AUTH, codeComplet, messageErreurDoubleAuth } from '../lib/doubleAuth'
import { CodeInput } from '../components/DoubleAuthScreen'
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
  // Double authentification : 2e étape après le mot de passe (code de l'application)
  const [resolver, setResolver] = useState(null)
  const [code, setCode] = useState('')
  const nav = useNavigate()
  const loc = useLocation()
  const { user, login } = useAuth(useShallow(s => ({ user: s.user, login: s.login })))

  async function onSubmit(e) {
    e.preventDefault()
    setErr(''); setInfo('')
    setLoading(true)
    try {
      await login(email.trim(), pwd)
    } catch (error) {
      if (error?.code === 'auth/multi-factor-auth-required') {
        const r = getMultiFactorResolver(auth, error)
        if (r.hints.some(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)) { setResolver(r); setCode(''); setPwd('') }
        else setErr('Méthode de double authentification non prise en charge. Contacte l’administrateur.')
      } else setErr('Email ou mot de passe invalide.')
    } finally {
      setLoading(false)
    }
  }

  async function onCode(e) {
    e.preventDefault()
    setErr(''); setInfo('')
    if (!codeComplet(code)) return setErr('Tape les 6 chiffres affichés dans l’application.')
    const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
    setLoading(true)
    try {
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code))
    } catch (error) {
      setErr(messageErreurDoubleAuth(error?.code))
      setCode('')
      // Délai dépassé : on repart du mot de passe
      if (['auth/totp-challenge-timeout', 'auth/code-expired', 'auth/invalid-multi-factor-session', 'auth/missing-multi-factor-session'].includes(error?.code)) setResolver(null)
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

  if (resolver) {
    return (
      <BrandScreen title="Code de vérification" subtitle={`Ouvre ton application d’authentification et tape le code à 6 chiffres de « ${NOM_APPLI_AUTH} ».`}>
        <BrandMessage error={err} info={info} />
        <form onSubmit={onCode} className="space-y-3.5">
          <CodeInput value={code} onChange={setCode} />
          <button type="submit" disabled={loading} className={BRAND_BUTTON} style={{ background: ROUGE }}>
            {loading ? 'Vérification…' : 'Valider'}
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>Téléphone perdu ? Contacte l’administrateur.</span>
          <button onClick={() => { setResolver(null); setErr('') }} className="font-semibold hover:underline shrink-0" style={{ color: BLEU }}>
            ← Retour
          </button>
        </div>
      </BrandScreen>
    )
  }

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
