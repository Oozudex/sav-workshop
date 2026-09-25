// Opérations commerciales : écritures partagées entre la liste et la fiche d'une OP
import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

// Formulaire de l'OP → document Firestore
export function opFormData(form) {
  return {
    nom:         form.nom.trim(),
    dateDebut:   form.dateDebut,
    dateFin:     form.dateFin,
    description: form.description.trim() || null,
    lien:        form.lien?.trim() || null,
    globale:     form.globale ?? false,
    rayonTypes:  form.rayonTypes?.length ? form.rayonTypes : null,
    rayonType:   null, // ancien champ, remplacé par rayonTypes
    magasinIds:  form.magasinIds?.length ? form.magasinIds : null,
  }
}

// Supprime une OP et ses produits : Firestore ne supprime pas la sous-collection avec son parent
export async function deleteOperation(opId) {
  const snap = await getDocs(collection(db, 'op_commerciales', opId, 'produits'))
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'op_commerciales', opId))
}
