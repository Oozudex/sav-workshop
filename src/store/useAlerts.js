import { create } from 'zustand'

/**
 * Alertes actives du magasin (seuils dépassés sur les tickets SAV et les commandes),
 * calculées par AlertsWatcher pour le directeur de magasin et lues par la cloche de la Navbar.
 */
export const useAlerts = create((set) => ({
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
}))
