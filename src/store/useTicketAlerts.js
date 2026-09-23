import { create } from 'zustand'

/**
 * Alertes actives de l'atelier (seuils dépassés), calculées par TicketAlertsWatcher
 * pour le directeur de magasin et lues par la cloche de la Navbar.
 */
export const useTicketAlerts = create((set) => ({
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
}))
