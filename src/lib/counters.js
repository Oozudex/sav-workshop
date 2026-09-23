import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

// Incrémente le compteur `counters/{name}` (remis à zéro chaque année)
async function nextCounter(name) {
  const ref = doc(db, 'counters', name)

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const y = new Date().getFullYear()

    if (!snap.exists()) {
      tx.set(ref, { lastNumber: 1, year: y, updatedAt: serverTimestamp() })
      return { next: 1, year: y }
    }

    let { lastNumber = 0, year = y } = snap.data()
    if (year !== y) { lastNumber = 0; year = y }
    const n = lastNumber + 1

    tx.update(ref, { lastNumber: n, year, updatedAt: serverTimestamp() })
    return { next: n, year }
  })
}

export async function getNextTicketNumber() {
  const { next, year } = await nextCounter('tickets')
  return `SAV-${year}-${String(next).padStart(4, '0')}`
}

export async function getNextOrderNumber() {
  const { next, year } = await nextCounter('orders')
  return `CMD-${year}-${String(next).padStart(4, '0')}`
}
