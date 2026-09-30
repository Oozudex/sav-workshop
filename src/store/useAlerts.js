import { create } from 'zustand'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { alertId } from '../lib/alerts'

/**
 * Alertes à traiter du magasin (seuils dépassés sur les tickets SAV et les commandes),
 * calculées par AlertsWatcher pour le directeur de magasin et lues par la cloche
 * et le bandeau de la Navbar. Les alertes déjà traitées n'y figurent pas.
 */
export const useAlerts = create((set) => ({
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
}))

// Marque une alerte comme traitée pour les éléments actuellement concernés
// (magasins/{id}/alert_settings/dismissed, partagé par les directeurs du magasin)
export function dismissAlert(magasinId, alert) {
  return setDoc(doc(db, 'magasins', magasinId, 'alert_settings', 'dismissed'),
    { items: { [alertId(alert)]: alert.itemIds }, updatedAt: serverTimestamp() }, { merge: true })
}
