// Administrateur : son calendrier et sa todo list personnels, ou ceux des équipes du magasin choisi
// dans la barre du haut. Choix gardé sur l'appareil (un par outil).
import { useState } from 'react'

export function useVueEquipes(profile, cle) {
  const possible = profile?.isAdmin === true
  const [vue, setVue] = useState(() => { try { return localStorage.getItem(cle) } catch { return null } })
  function choisir(v) {
    setVue(v)
    try { localStorage.setItem(cle, v) } catch { /* stockage indisponible */ }
  }
  return { possible, equipes: possible && vue === 'equipes', choisir }
}
