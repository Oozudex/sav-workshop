// Champ en erreur annoncé comme invalide (RGAA 11.10). Le message d'erreur est placé dans le <label>
// du champ : il fait partie de son nom et il est lu avec lui.
import { Children, cloneElement, isValidElement } from 'react'

export function markInvalid(children, invalid) {
  if (!invalid) return children
  return Children.map(children, c => (isValidElement(c) && ['input', 'select', 'textarea'].includes(c.type)
    ? cloneElement(c, { 'aria-invalid': true }) : c))
}
