// Couleur du classement de la marge % et du taux de sortie entre lignes du même niveau (ex. les magasins), sans rapport
// avec l'évolution N-1 (vert / rouge) : dégradé continu bleu (meilleurs) → jaune (moyenne) → orange (moins bons),
// une nuance par place (10 magasins = 10 nuances). t = 1 pour le meilleur, 0 pour le moins bon.

// Repères du dégradé [t, rgba] : orange-300, orange-200, yellow-200, sky-100, sky-300 en clair ; mêmes teintes
// transparentes sur fond sombre. Entre deux repères, la couleur est interpolée.
const CLAIR = [[0, [253, 186, 116, 1]], [0.25, [254, 215, 170, 1]], [0.5, [254, 240, 138, 1]], [0.65, [224, 242, 254, 1]], [1, [125, 211, 252, 1]]]
const SOMBRE = [[0, [249, 115, 22, 0.5]], [0.25, [249, 115, 22, 0.25]], [0.5, [234, 179, 8, 0.25]], [0.65, [14, 165, 233, 0.15]], [1, [14, 165, 233, 0.5]]]

export function rangCouleur(t, stops = CLAIR) {
  const x = Math.max(0, Math.min(1, t))
  const i = Math.max(1, stops.findIndex(([s]) => s >= x))
  const [s0, a] = stops[i - 1], [s1, b] = stops[i]
  const f = (x - s0) / (s1 - s0)
  const [r, g, bl, al] = a.map((v, k) => v + (b[k] - v) * f)
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${+al.toFixed(2)})`
}

// Classes de la case classée ; la couleur passe par les variables CSS de rangStyle (clair / sombre)
export const RANG_CLS = 'bg-[var(--rk)] dark:bg-[var(--rk-d)] text-gray-900 dark:text-white'
export const rangStyle = t => ({ '--rk': rangCouleur(t), '--rk-d': rangCouleur(t, SOMBRE) })
export const rangTexte = ({ pos, k }) => `${pos === 1 ? '1er' : `${pos}e`} sur ${k}`

// Nuancier de la légende : k places, du meilleur (à gauche) au moins bon
export function RangNuancier({ k = 10, className = '' }) {
  return (
    <span aria-hidden="true" className={`inline-flex rounded overflow-hidden ${className}`}>
      {Array.from({ length: k }, (_, i) => <span key={i} className={`h-3 w-3 ${RANG_CLS}`} style={rangStyle(1 - i / (k - 1))} />)}
    </span>
  )
}
