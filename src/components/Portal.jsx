import { createPortal } from 'react-dom'

// Affiche une fenêtre à la racine de la page : elle passe au-dessus de la barre du haut
// même si elle est ouverte depuis une zone « collante » (sticky) qui crée sa propre pile d'affichage.
export default function Portal({ children }) {
  return createPortal(children, document.body)
}
