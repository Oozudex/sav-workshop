// Recherche par photo : codes trouvés dans le texte lu sur l'étiquette d'un vélo.
// Le chrono est sous la forme « 0-267416 » (un chiffre, un tiret, 5 ou 6 chiffres), suivi de « /662331/60608 ».
// Les erreurs de lecture courantes sont corrigées (O lu pour 0, I ou l pour 1, tirets longs).
// Fonctions pures (tests/unit/etiquette.test.mjs).
import { cleanRef } from './opImport.js'

const chiffres = s => s.replace(/[oOQD]/g, '0').replace(/[Il|]/g, '1')

// Chronos lus, dans l'ordre de l'étiquette
export function chronosLus(texte) {
  const out = []
  for (const m of String(texte || '').matchAll(/(?<![\w-])([0-9oOQD])\s?[-–—]\s?([0-9oOQDIl|]{5,6})(?![\w-])/g)) {
    const chrono = `${chiffres(m[1])}-${chiffres(m[2])}`
    if (/^\d-\d{5,6}$/.test(chrono) && !out.includes(chrono)) out.push(chrono)
  }
  return out
}

// Réf. fournisseur et références lues (ex. « EXR-64-MS630 ») : mots avec tiret, lettres et chiffres
export function refsLues(texte) {
  const out = []
  for (const m of String(texte || '').toUpperCase().matchAll(/(?<![\w-])([A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+)(?![\w-])/g)) {
    const ref = m[1]
    if (/^\d-\d+$/.test(ref) || !/[A-Z]/.test(ref) || !/\d/.test(ref)) continue
    if (!out.includes(ref)) out.push(ref)
  }
  return out
}

/**
 * Terme à rechercher : le premier chrono lu qui existe dans la base, sinon la première réf. connue,
 * sinon le premier chrono lu (la recherche dira qu'il n'est pas en remise).
 * connus : (terme) => true si la base contient ce chrono ou cette référence.
 */
export function termeEtiquette(texte, connus = () => false) {
  const chronos = chronosLus(texte)
  const refs = refsLues(texte)
  return chronos.find(c => connus(cleanRef(c))) || refs.find(r => connus(cleanRef(r))) || chronos[0] || refs[0] || null
}
