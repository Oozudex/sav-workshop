// Fenêtre accessible (RGAA 7.1, 7.3, 12.8) : annoncée comme fenêtre de dialogue, le focus y entre
// à l'ouverture, Tab et Maj+Tab restent à l'intérieur, Échap la ferme (si onClose est fourni) et le
// focus revient à l'élément d'origine à la fermeture. S'utilise à la place du <div> de fond.
// Nom de la fenêtre : label, sinon labelledBy, sinon le premier titre trouvé à l'intérieur.
import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
}

let titreSeq = 0

export default function Dialog({ label, labelledBy, onClose, onKeyDown, className = '', children, ...props }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    const origine = document.activeElement
    // Nom de la fenêtre : premier titre visible à l'intérieur
    if (!label && !labelledBy) {
      const titre = node.querySelector('h1, h2, h3, [data-dialog-title]') || node.querySelector('.font-semibold, .font-bold')
      if (titre) {
        if (!titre.id) titre.id = `dialog-titre-${++titreSeq}`
        node.setAttribute('aria-labelledby', titre.id)
      }
    }
    // Focus : champ en autofocus s'il y en a un, sinon premier élément utilisable, sinon la fenêtre
    if (!node.contains(document.activeElement)) (focusables(node)[0] || node).focus()
    return () => { if (origine?.focus && document.contains(origine)) origine.focus() }
  }, [label, labelledBy])

  function handleKeyDown(e) {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    // Fenêtre ouverte par-dessus celle-ci : c'est elle qui gère ses touches
    if (e.target instanceof Element && e.target.closest('[role="dialog"]') !== ref.current) return
    if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab') return
    const items = focusables(ref.current)
    if (!items.length) { e.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} tabIndex={-1}
      {...props} className={`${className} outline-none`} onKeyDown={handleKeyDown}>
      {children}
    </div>
  )
}
