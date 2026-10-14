// Filtre par acheteur : ce que chacun doit remplir (ses univers attribués), tout, ou les univers sans acheteur
import { FILTRE_SANS_ACHETEUR, filtreAcheteur } from '../../lib/budgets'

export default function BuyerFilter({ value, onChange, acheteurs, me, className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Filtrer par acheteur"
      className={`Input h-9 text-sm sm:w-72 ${className}`}>
      <option value="">Tous les acheteurs</option>
      {acheteurs.map(a => (
        <option key={a.id} value={filtreAcheteur(a.id)}>
          {a.displayName || a.email}{a.id === me ? ' (moi)' : ''} · {(a.univers || []).length} univers
        </option>
      ))}
      <option value={FILTRE_SANS_ACHETEUR}>Univers sans acheteur</option>
    </select>
  )
}
