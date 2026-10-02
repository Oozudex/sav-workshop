// Première connexion avec le mot de passe donné par le directeur (après le retrait d'un collaborateur) :
// le rayon choisit tout de suite son propre mot de passe avant d'accéder à l'application.
import { useState } from 'react'
import { updatePassword } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../store/useAuth'
import { passwordErrors } from '../lib/session'
import BrandScreen, { BLEU, BRAND_BUTTON, BrandMessage, PasswordInput, ROUGE } from './BrandScreen'

export default function ChangePasswordScreen() {
  const logout = useAuth(s => s.logout)
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const problem = passwordErrors(pwd, confirm)
    if (problem) return setErr(problem)
    setErr(''); setSaving(true)
    try {
      await updatePassword(auth.currentUser, pwd)
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { motDePasseTemporaire: false })
    } catch (error) {
      setErr(error?.code === 'auth/requires-recent-login'
        ? 'Par sécurité, reconnecte-toi avec le mot de passe donné par ton directeur, puis choisis le nouveau.'
        : error?.code === 'auth/weak-password' ? 'Mot de passe trop simple : choisis-en un plus long.'
        : 'Enregistrement impossible. Réessaie dans un instant.')
    } finally { setSaving(false) }
  }

  return (
    <BrandScreen title="Choisis ton mot de passe"
      subtitle="Tu t’es connecté avec le mot de passe donné par ton directeur. Choisis maintenant celui du rayon : c’est lui que l’équipe utilisera.">
      <BrandMessage error={err} />
      <form onSubmit={onSubmit} className="space-y-3.5">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Nouveau mot de passe</span>
          <PasswordInput value={pwd} onChange={setPwd} autoComplete="new-password" autoFocus />
          <span className="block mt-1 text-[11px] text-gray-400">8 caractères minimum.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Confirme le mot de passe</span>
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </label>
        <button type="submit" disabled={saving} className={BRAND_BUTTON} style={{ background: ROUGE }}>
          {saving ? 'Enregistrement…' : 'Enregistrer et continuer'}
        </button>
      </form>
      <div className="mt-4 text-right">
        <button onClick={logout} className="text-xs font-semibold hover:underline" style={{ color: BLEU }}>Se déconnecter</button>
      </div>
    </BrandScreen>
  )
}
