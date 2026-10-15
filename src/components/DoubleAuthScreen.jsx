// Double authentification obligatoire (acheteurs, direction, administrateurs) : tant que la session n'a
// pas été ouverte avec le code de l'application, le compte n'a aucun droit (firestore.rules) et cet
// écran remplace l'application. Première fois : QR code à scanner dans Google Authenticator (ou une
// autre application), puis le code à 6 chiffres pour confirmer.
import { useEffect, useState } from 'react'
import { multiFactor, sendEmailVerification, TotpMultiFactorGenerator } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../store/useAuth'
import { NOM_APPLI_AUTH, codeComplet, formaterCle, lireCode, messageErreurDoubleAuth } from '../lib/doubleAuth'
import BrandScreen, { BLEU, BRAND_BUTTON, BRAND_FIELD, BrandMessage, ROUGE } from './BrandScreen'

// Étape de départ : e-mail à vérifier (exigé par Firebase), application déjà configurée sur un autre
// appareil (session ouverte avant : il faut se reconnecter avec le code) ou configuration
function etapeInitiale(user) {
  if (!user) return 'qr'
  if (multiFactor(user).enrolledFactors.length) return 'reconnexion'
  return user.emailVerified ? 'qr' : 'email'
}

export function CodeInput({ value, onChange, autoFocus = true }) {
  return (
    <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} autoFocus={autoFocus}
      className={`mt-1 ${BRAND_FIELD} text-center text-2xl font-semibold tracking-[.4em] tabular-nums`}
      placeholder="000000" aria-label="Code à 6 chiffres" value={value} onChange={e => onChange(lireCode(e.target.value))} />
  )
}

export default function DoubleAuthScreen() {
  const logout = useAuth(s => s.logout)
  const user = auth.currentUser
  const [etape, setEtape] = useState(() => etapeInitiale(user))
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // Secret TOTP et son QR code, générés une fois à l'affichage de l'étape
  const [secret, setSecret] = useState(null)
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [cleVisible, setCleVisible] = useState(false)

  useEffect(() => {
    if (etape !== 'qr' || secret || !user) return
    let annule = false
    ;(async () => {
      try {
        const session = await multiFactor(user).getSession()
        const s = await TotpMultiFactorGenerator.generateSecret(session)
        const qrcode = await import('qrcode') // module CommonJS : fonctions sous default
        const image = await (qrcode.default || qrcode).toDataURL(s.generateQrCodeUrl(user.email || 'compte', NOM_APPLI_AUTH), { width: 220, margin: 1 })
        if (!annule) { setSecret(s); setQr(image) }
      } catch (e) {
        if (!annule) setErr(messageErreurDoubleAuth(e?.code))
      }
    })()
    return () => { annule = true }
  }, [etape, secret, user])

  async function activer(e) {
    e.preventDefault()
    if (!codeComplet(code)) return setErr('Tape les 6 chiffres affichés dans l’application.')
    setErr(''); setBusy(true)
    try {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Application d’authentification')
      // Nouveau jeton avec le second facteur : on recharge pour repartir avec tous les droits
      window.location.reload()
    } catch (e2) {
      setErr(messageErreurDoubleAuth(e2?.code))
      setBusy(false)
    }
  }

  async function envoyerVerification() {
    setErr(''); setInfo(''); setBusy(true)
    try {
      await sendEmailVerification(user)
      setInfo(`E-mail envoyé à ${user.email}. Clique sur le lien qu’il contient, puis reviens ici.`)
    } catch (e) { setErr(messageErreurDoubleAuth(e?.code)) } finally { setBusy(false) }
  }

  async function verifierEmail() {
    setErr(''); setBusy(true)
    try {
      await user.reload()
      if (auth.currentUser?.emailVerified) { setInfo(''); setEtape('qr') }
      else setErr('L’adresse n’est pas encore vérifiée : clique sur le lien de l’e-mail, puis réessaie.')
    } catch (e) { setErr(messageErreurDoubleAuth(e?.code)) } finally { setBusy(false) }
  }

  const deconnexion = (
    <div className="mt-4 text-right">
      <button onClick={logout} className="text-xs font-semibold hover:underline" style={{ color: BLEU }}>Se déconnecter</button>
    </div>
  )

  if (etape === 'reconnexion') {
    return (
      <BrandScreen title="Code de connexion requis"
        subtitle="La double authentification est déjà activée sur ton compte. Reconnecte-toi : on te demandera le code de ton application.">
        <button onClick={logout} className={BRAND_BUTTON} style={{ background: ROUGE }}>Se reconnecter</button>
      </BrandScreen>
    )
  }

  if (etape === 'email') {
    return (
      <BrandScreen title="Vérifie ton adresse e-mail"
        subtitle="Avant d’activer la double authentification, confirme ton adresse e-mail.">
        <BrandMessage error={err} info={info} />
        <div className="space-y-2.5">
          <button onClick={envoyerVerification} disabled={busy} className={BRAND_BUTTON} style={{ background: ROUGE }}>
            Recevoir l’e-mail de vérification
          </button>
          <button onClick={verifierEmail} disabled={busy}
            className="w-full h-11 rounded-xl border border-gray-300 text-gray-800 font-semibold hover:bg-gray-50 disabled:opacity-60">
            J’ai cliqué sur le lien
          </button>
        </div>
        {deconnexion}
      </BrandScreen>
    )
  }

  return (
    <BrandScreen title="Sécurise ton compte"
      subtitle="Ton compte a accès à tous les magasins : la double authentification est obligatoire. À chaque connexion, on te demandera en plus un code de ton téléphone.">
      <BrandMessage error={err} />
      <ol className="space-y-4 text-sm text-gray-700">
        <li className="flex gap-3">
          <Num n={1} />
          <p>Installe <strong>Google Authenticator</strong> (ou Microsoft Authenticator) sur ton téléphone.</p>
        </li>
        <li className="flex gap-3">
          <Num n={2} />
          <div className="min-w-0 flex-1">
            <p>Dans l’application, appuie sur <strong>+</strong> puis <strong>Scanner un code QR</strong>.</p>
            <div className="mt-3 grid place-items-center">
              {qr
                ? <img src={qr} alt="QR code à scanner avec l’application d’authentification" width={176} height={176} className="rounded-lg border border-gray-200" />
                : <div className="h-44 w-44 rounded-lg border border-gray-200 grid place-items-center text-xs text-gray-500" role="status">
                    {err ? 'QR code indisponible' : 'Préparation…'}
                  </div>}
            </div>
            {secret && (
              <div className="mt-2 text-center">
                {cleVisible
                  ? <p className="text-[11px] text-gray-500">Clé à saisir à la main :<br />
                      <code className="font-mono text-xs text-gray-900 select-all break-all">{formaterCle(secret.secretKey)}</code></p>
                  : <button type="button" onClick={() => setCleVisible(true)} className="text-xs font-semibold hover:underline" style={{ color: BLEU }}>
                      Impossible de scanner ? Saisir la clé
                    </button>}
              </div>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <Num n={3} />
          <form onSubmit={activer} className="min-w-0 flex-1 space-y-3">
            <p>Tape le code à 6 chiffres affiché pour « {NOM_APPLI_AUTH} ».</p>
            <CodeInput value={code} onChange={setCode} autoFocus={false} />
            <button type="submit" disabled={busy || !secret} className={BRAND_BUTTON} style={{ background: ROUGE }}>
              {busy ? 'Activation…' : 'Activer la double authentification'}
            </button>
          </form>
        </li>
      </ol>
      {deconnexion}
    </BrandScreen>
  )
}

function Num({ n }) {
  return <span className="h-6 w-6 shrink-0 grid place-items-center rounded-full text-xs font-bold text-white" style={{ background: BLEU }}>{n}</span>
}
