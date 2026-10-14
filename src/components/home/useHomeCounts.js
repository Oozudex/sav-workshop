// Compteurs des cartes de l'accueil et des espaces de rayon (badges rouges)
import { useEffect, useState } from 'react'
import { collection, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { ORDER_CLOSED_STATUTS } from '../../lib/constants'
import { isOpVisibleFor, opStatus, todayStr } from '../../lib/opSearch'
import { TRANSFER_ACTIVE_STATUSES, readField, transferNeedsAction } from '../../lib/transferts'

// Compte les documents côté serveur (1 lecture facturée par tranche de 1000 docs)
// au lieu de télécharger toute la collection juste pour afficher un nombre.
function countOnce(q, setCount) {
  let cancelled = false
  getCountFromServer(q)
    .then(snap => { if (!cancelled) setCount(snap.data().count) })
    .catch(() => { if (!cancelled) setCount(null) })
  return () => { cancelled = true }
}

// { chemin de l'outil: nombre } pour le magasin affiché
export function useHomeCounts(profile, effectiveMagasinId, isGlobal) {
  const [ticketCount, setTicketCount] = useState(null)
  const [orderCount, setOrderCount] = useState(null)
  const [opCount, setOpCount] = useState(null)
  const [transfertCount, setTransfertCount] = useState(null)

  // Compteur tickets actifs (hors Prêt à rendre et Clôturé)
  useEffect(() => {
    if (!profile) return
    let q
    if (effectiveMagasinId) {
      q = query(collection(db, 'tickets'), where('magasinId', '==', effectiveMagasinId), where('status', 'not-in', ['Ready', 'Closed']))
    } else if (isGlobal) {
      q = query(collection(db, 'tickets'), where('status', 'not-in', ['Ready', 'Closed']))
    } else return
    return countOnce(q, setTicketCount)
  }, [profile, effectiveMagasinId, isGlobal])

  // Compteur commandes actives (hors livrée + annulée)
  useEffect(() => {
    if (!profile) return
    let q
    if (effectiveMagasinId) {
      q = query(collection(db, 'orders'), where('magasinId', '==', effectiveMagasinId), where('statut', 'not-in', ORDER_CLOSED_STATUTS))
    } else if (isGlobal) {
      q = query(collection(db, 'orders'), where('statut', 'not-in', ORDER_CLOSED_STATUTS))
    } else return
    return countOnce(q, setOrderCount)
  }, [profile, effectiveMagasinId, isGlobal])

  // Compteur des OP en cours visibles par l'utilisateur (même règle que la page OP)
  useEffect(() => {
    if (!profile) return
    const q = query(collection(db, 'op_commerciales'), where('dateFin', '>=', todayStr()))
    return onSnapshot(q, snap => {
      setOpCount(snap.docs.map(d => d.data())
        .filter(op => opStatus(op) === 'en_cours' && isOpVisibleFor(op, profile, effectiveMagasinId)).length)
    })
  }, [profile, effectiveMagasinId])

  // Badge transferts : ce que le magasin doit faire (répondre, envoyer, confirmer, classer) + nouveautés non lues
  useEffect(() => {
    if (!profile || !effectiveMagasinId || profile.role !== 'velo') return
    const q = query(collection(db, 'transferts'), where('status', 'in', TRANSFER_ACTIVE_STATUSES))
    return onSnapshot(q, snap => {
      const n = snap.docs.filter(d => {
        const t = d.data()
        const f = readField(t, effectiveMagasinId)
        return transferNeedsAction(t, effectiveMagasinId) || (f && t[f] === false)
      }).length
      setTransfertCount(n)
    })
  }, [profile, effectiveMagasinId])

  return { '/tickets': ticketCount, '/orders': orderCount, '/operations': opCount, '/transfert': transfertCount }
}
